import assert from "node:assert/strict"
import http from "node:http"
import { Config, Effect } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import * as RelayClient from "../src/relay-client.ts"

// Load scripts/fixtures/protected-extension alongside BrowserRig in an isolated Chrome profile.
const main = Effect.fn("ProtectedFrame.check")(function* () {
  const relay = yield* RelayClient.Service
  const inspector = yield* Config.string("BROWSERRIG_TEST_INSPECTOR")
  const fixture = yield* Effect.acquireRelease(Effect.promise(async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" })
      response.end('<!doctype html><title>Protected frame fixture</title><input id="secret"><p id="kept">Form state survives</p>')
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    assert(address && typeof address !== "string")
    return { server, url: `http://127.0.0.1:${address.port}/protected` }
  }), ({ server }) => Effect.promise(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()) })))
  const session = yield* relay.sessionNew()
  yield* Effect.addFinalizer(() => relay.sessionDelete(session.id).pipe(Effect.ignore))
  const execute = (code: string) => relay.execute({ sessionId: session.id, createIfMissing: false, code })
  const initial = yield* execute(`await page.bringToFront(); await page.goto(${JSON.stringify(fixture.url)}); return page.url()`)
  assert.equal(initial.isError, false, initial.text)
  const before = (yield* relay.targets).find((target) => target.browserRigSessionId === session.id)!
  assert(before)
  const focused = yield* execute("await page.locator('#secret').focus({ timeout: 1500 }); await new Promise(resolve => setTimeout(resolve, 300)); return await page.evaluate(() => document.title)")
  console.log(JSON.stringify({ phase: "focus", diagnostic: focused.diagnostic, isError: focused.isError, text: focused.text, warnings: focused.warnings }))
  const blocked = (yield* relay.targets).find((target) => target.id === before.id)
  console.log(JSON.stringify({ phase: "status", protectedUi: blocked?.protectedUi }))
  assert(focused.isError && focused.diagnostic === "target/cross-extension-page", "actual Chrome debugger block must be named")
  assert.equal(blocked?.protectedUi, true)
  const physical = yield* Effect.promise(async () => await (await fetch(inspector)).json() as { targetInfos: Array<{ targetId: string; url: string; title: string; attached: boolean }> })
  const kept = physical.targetInfos.find((target) => target.targetId === before.id)
  assert.equal(kept?.url, fixture.url)
  assert.equal(kept?.title, "Protected frame fixture")
  console.log(JSON.stringify({ phase: "physical", ...kept }))
  const frames = yield* execute("return page.frames().map(frame => frame.url())")
  assert.equal(frames.isError, false, frames.text)
  assert.deepEqual(frames.value, [fixture.url], "protected frame must not remain as a phantom frame")
  yield* Effect.sleep(16_000)
  // Chrome can revoke debugger attachment when a protected document is injected.
  // Re-attach the same active fixture tab explicitly, then release and re-adopt that user tab to refresh the sandbox.
  yield* Effect.promise(async () => {
    const response = await fetch(`${inspector}/activate?id=${before.id}`)
    assert(response.ok, await response.text())
  })
  const adoption = yield* relay.sessionAdopt({ sessionId: session.id, createIfMissing: false, active: true })
  console.log(JSON.stringify({ phase: "reattach", adoption }))
  assert.equal((yield* relay.targets).find((target) => target.browserRigSessionId === session.id)?.id, before.id, "reattach must select the exact preserved tab")
  yield* relay.sessionReset(session.id)
  yield* relay.sessionAdopt({ sessionId: session.id, createIfMissing: false, active: true })
  const after = yield* execute("return { title: await page.title(), frames: page.frames().map(frame => frame.url()) }")
  assert.equal(after.isError, false, after.text)
  assert.deepEqual(after.value, { title: "Protected frame fixture", frames: [fixture.url] })
  const final = (yield* relay.targets).filter((target) => target.browserRigSessionId === session.id)
  assert.equal(final.length, 1)
  assert.equal(final[0]?.id, before.id)
  assert(!final[0]?.protectedUi)
  console.log("PASS real Chrome protected iframe: named block, no phantom frame, same target after dismissal")
})
main().pipe(Effect.scoped, Effect.provide(RelayClient.layerFetch), Effect.provide(NodeServices.layer), NodeRuntime.runMain)
