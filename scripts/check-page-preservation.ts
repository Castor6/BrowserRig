import assert from "node:assert/strict"
import fs from "node:fs/promises"
import http from "node:http"
import { Effect } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { chromium } from "playwright-core"
import * as RelayClient from "../src/relay-client.ts"
import type { ExecuteResponse, TargetSummary } from "../src/relay-schema.ts"

// Selected upstream #93 invariants, using BrowserRig's typed relay client and existing lifecycle.
const main = Effect.fn("PagePreservation.check")(function* () {
  const relay = yield* RelayClient.Service
  const status = yield* relay.extensionStatus
  assert(status.connected, "Start an isolated Chrome extension and relay before this check")
  const fixture = yield* Effect.acquireRelease(
    Effect.promise(async () => {
      const spa = await fs.readFile(new URL("./fixtures/page-preservation/heavy-spa-slow-context.html", import.meta.url), "utf8")
      const typing = await fs.readFile(new URL("./fixtures/page-preservation/typing-freezes-page.html", import.meta.url), "utf8")
      const server = http.createServer((request, response) => {
        response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" })
        response.end(request.url?.startsWith("/typing") ? typing : spa)
      })
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
      const address = server.address()
      assert(address && typeof address !== "string")
      return { server, url: `http://127.0.0.1:${address.port}` }
    }),
    ({ server }) => Effect.promise(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()) })),
  )
  const targets = (id: string) => relay.targets.pipe(Effect.map((all) => all.filter((target) => target.browserRigSessionId === id)))
  const preserved = Effect.fn("PagePreservation.assert")(function* (id: string, before: TargetSummary, results: readonly ExecuteResponse[]) {
    const after = yield* targets(id)
    assert.equal(after.length, 1, "exactly one session-owned target must survive")
    assert.equal(after[0]!.id, before.id, "the physical target must survive")
    assert.equal(after[0]!.tabId, before.tabId)
    assert.equal(after[0]!.owner, before.owner)
    assert.notEqual(after[0]!.url, "about:blank")
    for (const result of results) assert(!result.warnings?.some((warning) => warning.includes("created a new page")))
  })

  for (const adopted of [false, true]) {
    const label = adopted ? "adopted-heavy-spa" : "owned-heavy-spa"
    const session = yield* relay.sessionNew()
    const id = session.id
    const url = `${fixture.url}/spa?block=8000&case=${label}`
    yield* Effect.addFinalizer(() => relay.sessionDelete(id).pipe(Effect.ignore))
    if (adopted) {
      const browser = yield* Effect.acquireRelease(Effect.promise(() => chromium.connectOverCDP(relay.endpoint)), (browser) => Effect.promise(() => browser.close()))
      const page = yield* Effect.promise(() => browser.contexts()[0]!.newPage())
      yield* Effect.promise(() => page.goto(url))
      yield* relay.sessionAdopt({ createIfMissing: false, sessionId: id, targetSelection: { urlIncludes: `case=${label}` } })
    } else {
      const boot = yield* relay.execute({ createIfMissing: false, sessionId: id, code: `await page.goto(${JSON.stringify(url)}); return await page.locator('#ready').textContent()` })
      assert.equal(boot.value, "SPA ready")
    }
    const before = (yield* targets(id))[0]!
    assert(before)
    const destroyed = yield* relay.execute({ createIfMissing: false, sessionId: id, code: "await page.evaluate(() => { document.getElementById('rehydrate').click(); return new Promise(() => {}) })" })
    assert(destroyed.isError)
    assert(destroyed.diagnostic?.startsWith("execution-context/"))
    const start = Date.now()
    const immediate = yield* relay.execute({ createIfMissing: false, sessionId: id, code: "return page.url()" })
    assert(Date.now() - start < 20_000, "bounded health/reconnect attempt")
    yield* preserved(id, before, [destroyed, immediate])
    if (adopted && immediate.isError) assert.equal(immediate.diagnostic, "session-page/adopted-unresponsive")
    yield* Effect.sleep(Math.max(0, start + 9_000 - Date.now()))
    const settled = yield* relay.execute({ createIfMissing: false, sessionId: id, code: "return { url: page.url(), version: await page.locator('#version').textContent() }" })
    assert.equal(settled.isError, false, settled.text)
    assert.deepEqual(settled.value, { url: `${url}&v=2`, version: "version 2" })
    yield* preserved(id, before, [settled])
    console.log(`PASS ${label}: same target ${before.id}; immediate ${immediate.diagnostic ?? "usable"}`)
    yield* relay.sessionDelete(id)
    if (adopted) {
      const released = (yield* relay.targets).find((target) => target.id === before.id)
      assert(released && !released.browserRigSessionId, "delete must release the adopted tab")
      // Only this fixture tab is closed after verifying user-tab preservation.
      const browser = yield* Effect.acquireRelease(Effect.promise(() => chromium.connectOverCDP(relay.endpoint)), (browser) => Effect.promise(() => browser.close()))
      const page = browser.contexts()[0]!.pages().find((page) => page.url() === `${url}&v=2`)
      assert(page)
      yield* Effect.promise(() => page.close())
    }
  }

  const session = yield* relay.sessionNew()
  yield* Effect.addFinalizer(() => relay.sessionDelete(session.id).pipe(Effect.ignore))
  const url = `${fixture.url}/typing?freeze=12000&chunk=6000`
  assert.equal((yield* relay.execute({ createIfMissing: false, sessionId: session.id, code: `await page.goto(${JSON.stringify(url)}); return page.url()` })).isError, false)
  const before = (yield* targets(session.id))[0]!
  const typed = yield* relay.execute({ createIfMissing: false, sessionId: session.id, code: "await page.locator('#pnr').pressSequentially('ABC123', { timeout: 1000 })" })
  assert(typed.isError, "typing must time out during the intentional freeze")
  yield* preserved(session.id, before, [typed])
  yield* Effect.sleep(13_000)
  const final = yield* relay.execute({ createIfMissing: false, sessionId: session.id, code: "return await page.locator('#pnr').inputValue()" })
  assert(!final.isError && typeof final.value === "string" && final.value.length > 0, "typed form state survives")
  yield* preserved(session.id, before, [final])
  console.log("PASS typing-freeze: partial input and target preserved")
})

main().pipe(Effect.scoped, Effect.provide(RelayClient.layerFetch), Effect.provide(NodeServices.layer), NodeRuntime.runMain)
