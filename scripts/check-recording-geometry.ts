import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { chromium } from "playwright-core"
import { PNG } from "pngjs"
import pixelmatch from "pixelmatch"
import { RecordingRelay } from "../src/recording-relay.ts"
import type { JsonObject } from "../src/protocol.ts"

// Browser integration check: run explicitly, never as part of browser-free unit tests.
const { values } = parseArgs({ options: { browser: { type: "string" }, out: { type: "string" } } })
assert.ok(values.out, "Pass --out <fresh artifact directory>")
const directory = path.resolve(values.out)
await fs.mkdir(directory)
const browser = await chromium.launch({ ...(values.browser ? { executablePath: values.browser } : {}) })
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const context = await browser.newContext({ viewport: { width: 2560, height: 1273 }, deviceScaleFactor: 2 })
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    const output = path.join(directory, `${viewport.width}.mp4`)
    const relay = new RecordingRelay({
      isExtensionConnected: () => true,
      sendToExtension: async () => { throw new Error("Unexpected extension command") },
      sendDebuggerCommand: ({ method, params }) => cdp.send(method as Parameters<typeof cdp.send>[0], params).then(value => value as JsonObject),
    })
    cdp.on("Page.screencastFrame", params => relay.handleDebuggerEvent({ tabId: 1, method: "Page.screencastFrame", params: params as unknown as JsonObject }))
    try {
      await cdp.send("Page.enable")
      await cdp.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 2, mobile: false, dontSetVisibleSize: true })
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font:24px Arial}main{width:100vw;height:100vh;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}section{padding:40px;border:8px solid black}section:nth-child(1){background:#ffc0c0}section:nth-child(2){background:#c0ffc0}section:nth-child(3){background:#c0c0ff}section:nth-child(4){background:#ffffc0}</style><main><section>Top left: readable settings</section><section>Top right: 0123456789</section><section>Bottom left: entire viewport</section><section>Bottom right: no padding shrinkage</section></main>`)
      const reference = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false })
      await fs.writeFile(path.join(directory, `${viewport.width}-reference.png`), Buffer.from(reference.data, "base64"))
      const started = await relay.startRecording({ tabId: 1, owner: "relay", outputPath: output, mode: "cdp" })
      assert.ok(started.success, JSON.stringify(started))
      await new Promise(resolve => setTimeout(resolve, 1200))
      const stopped = await relay.stopRecording({ tabId: 1 })
      assert.ok(stopped.success, JSON.stringify(stopped))
      assert.ok(stopped.quality && stopped.quality.sourceFrameCount > 0 && !stopped.quality.screenshotFallback)
      const metadata = JSON.parse(await fs.readFile(`${output}.json`, "utf8"))
      for (const [key, value] of Object.entries(stopped.quality)) assert.equal(metadata[key], value)
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", output], { encoding: "utf8" }))
      assert.deepEqual(probe.streams[0], { width: 1280, height: 720, r_frame_rate: "25/1" })
      const frame = path.join(directory, `${viewport.width}-frame.png`)
      const scaledReference = path.join(directory, `${viewport.width}-scaled-reference.png`)
      execFileSync("ffmpeg", ["-v", "error", "-ss", "0.4", "-i", output, "-frames:v", "1", frame])
      execFileSync("ffmpeg", ["-v", "error", "-i", path.join(directory, `${viewport.width}-reference.png`), "-vf", "scale=1280:720:flags=lanczos", scaledReference])
      const before = PNG.sync.read(await fs.readFile(scaledReference))
      const after = PNG.sync.read(await fs.readFile(frame))
      const diff = new PNG({ width: 1280, height: 720 })
      const changedRatio = pixelmatch(before.data, after.data, diff.data, 1280, 720, { threshold: 0.1, includeAA: true }) / (1280 * 720)
      await fs.writeFile(path.join(directory, `${viewport.width}-diff.png`), PNG.sync.write(diff))
      assert.ok(changedRatio < 0.02, `Geometry or fidelity regression: ${changedRatio}`)
      console.log(JSON.stringify({ viewport, changedRatio, quality: stopped.quality, output }))
    } finally {
      if (relay.hasActiveRecordings()) await relay.cancelRecording({ tabId: 1 })
      await context.close()
    }
  }
} finally {
  await browser.close()
}
