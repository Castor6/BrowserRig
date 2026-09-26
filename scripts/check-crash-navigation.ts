import assert from "node:assert/strict"
import http from "node:http"
import { Effect } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { chromium } from "playwright-core"
import * as RelayClient from "../src/relay-client.ts"

// Run only against the task-owned relay and isolated Chrome fixture.
const main = Effect.fn("CrashNavigation.check")(function* () {
  const relay = yield* RelayClient.Service
  assert.equal(relay.endpoint, "http://127.0.0.1:21990")
  const server = http.createServer((_request, response) => response.end('<title>Recovered form</title><input id="draft">'))
  yield* Effect.promise(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)))
  yield* Effect.addFinalizer(() => Effect.promise(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()) })))
  const address = server.address()
  assert(address && typeof address !== "string")
  for (const sameUrl of [false, true]) {
    const session = yield* relay.sessionNew()
    yield* Effect.addFinalizer(() => relay.sessionDelete(session.id).pipe(Effect.ignore))
    const url: string = `http://127.0.0.1:${address.port}/form?case=${sameUrl}`
    assert.equal((yield* relay.execute({ sessionId: session.id, createIfMissing: false, code: `await page.goto(${JSON.stringify(url)}); return page.url()` })).isError, false)
    const before = (yield* relay.targets).find((target) => target.browserRigSessionId === session.id)!
    const browser = yield* Effect.acquireRelease(Effect.promise(() => chromium.connectOverCDP(relay.endpoint, { headers: { "BrowserRig-Session-Id": session.id } })), (browser) => Effect.promise(() => browser.close()))
    const page = browser.contexts()[0]!.pages().find((page) => page.url() === url)!
    assert(page)
    const cdp = yield* Effect.promise(() => page.context().newCDPSession(page))
    yield* Effect.promise(async () => {
      const crashed = page.waitForEvent("crash", { timeout: 5_000 })
      void cdp.send("Page.crash").catch(() => {})
      await crashed
      await cdp.send("Page.navigate", { url: sameUrl ? url : `${url}&recovered=true` })
      // Independent CDP access works even while the old Playwright Page retains its crash state.
      for (let attempt = 0; attempt < 50; attempt++) {
        const result = await cdp.send("Runtime.evaluate", { expression: 'document.querySelector("#draft") && (document.querySelector("#draft").value = "saved-user-state")', returnByValue: true }).catch(() => undefined)
        if (result?.result.value === "saved-user-state") return
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error("Recovered form did not become available")
    })
    const result = yield* relay.execute({ sessionId: session.id, createIfMissing: false, code: "return { title: await page.title(), draft: await page.locator('#draft').inputValue() }" })
    assert.equal(result.isError, false, result.text)
    assert.deepEqual(result.value, { title: "Recovered form", draft: "saved-user-state" })
    const after = (yield* relay.targets).find((target) => target.browserRigSessionId === session.id)!
    assert.equal(after.id, before.id)
    assert.equal(after.tabId, before.tabId)
    assert(!page.isClosed(), "The recovered physical tab must remain open")
    assert(result.warnings?.some((warning) => warning.includes("reconnected and re-resolved the same tab")), "The stale crashed Playwright connection must be repaired")
    console.log(`PASS crash then ${sameUrl ? "same-URL reload" : "navigation"}: target ${before.id}, tab ${before.tabId}, saved-user-state preserved; ${JSON.stringify(result.warnings)}`)
    yield* relay.sessionDelete(session.id)
  }
})
main().pipe(Effect.scoped, Effect.provide(RelayClient.layerFetch), Effect.provide(NodeServices.layer), NodeRuntime.runMain)
