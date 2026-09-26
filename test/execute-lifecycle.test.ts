import { PNG } from "pngjs"
import { chromium, selectors, type Browser, type BrowserContext, type Page } from "playwright-core"
import { describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import {
  defaultPageClosedWarning,
  defaultPageRepairedWarning,
  isDisposableSessionPage,
  ExecuteSandbox,
  isSessionPageConnected,
  recoverSessionPage,
  runPlaywrightOperation,
  waitForPageContext,
} from "../src/execute.ts"
import { BrowserRigSessions } from "../src/session-manager.ts"
import { WebMcpSession, type WebMcpEvent } from "../src/webmcp.ts"

describe("execute lifecycle", () => {
  it.each([
    { kind: "protected extension", error: "Cannot access a chrome-extension:// URL of different extension", healthCheck: false },
    { kind: "destroyed context", error: "Execution context was destroyed", healthCheck: true },
    { kind: "crashed target", error: "Target closed", healthCheck: true },
  ])("handles $kind failures without losing the session page", async ({ kind, error, healthCheck }) => {
    const page = {
      isClosed: () => false,
      url: () => "https://example.test/form",
      title: async () => "Fixture",
      context: (): BrowserContext => context as unknown as BrowserContext,
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      evaluate: vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error(error)),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const context = {
      pages: () => [],
      on: vi.fn(),
      newPage: vi.fn().mockResolvedValueOnce(page).mockRejectedValue(new Error("Unexpected page replacement")),
      newCDPSession: async () => ({
        send: async () => ({ targetInfo: { targetId: "fixture-target" } }),
        detach: async () => {},
      }),
    }
    const browser = {
      isConnected: () => true,
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    }
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as unknown as Browser)
    const register = vi.spyOn(selectors, "register").mockResolvedValue(undefined)
    const sandbox = new ExecuteSandbox({ endpointUrl: "http://127.0.0.1:1" })
    try {
      const failure = await Effect.runPromise(sandbox.execute("state.originalPage = page; return page.evaluate(() => true)"))
      expect(failure.isError).toBe(true)
      expect(failure.text).toContain(error)
      if (kind === "protected extension") {
        expect(failure.diagnostic).toBe("target/cross-extension-page")
        expect(failure.warnings).toEqual([
          "Chromium blocked protected extension UI, possibly a password manager. Ask the user to finish or dismiss it in the browser, then retry.",
        ])
      } else {
        expect(failure.warnings).toEqual([])
      }
      if (kind === "crashed target") expect(sandbox.markTargetCrashed("fixture-target")).toBe(true)
      expect(sandbox.getStatus()).toMatchObject({ connected: !healthCheck, pageUrl: "https://example.test/form" })

      // Keep the permission failure active: the next execute must not probe or replace this page.
      if (healthCheck) page.evaluate.mockResolvedValue(true)
      const continued = await Effect.runPromise(sandbox.execute("return { samePage: page === state.originalPage }"))
      expect(continued).toMatchObject({ isError: false, value: { samePage: true } })
      expect(page.evaluate).toHaveBeenCalledTimes(healthCheck ? 2 : 1)
      expect(context.newPage).toHaveBeenCalledTimes(1)
      expect(page.close).not.toHaveBeenCalled()
      expect(sandbox.getStatus().connected).toBe(true)

      page.evaluate.mockResolvedValue(true)
      const retried = await Effect.runPromise(sandbox.execute("return page.evaluate(() => true)"))
      expect(retried).toMatchObject({ isError: false, value: true, warnings: [] })
    } finally {
      await Effect.runPromise(sandbox.disconnectSettled())
      connect.mockRestore()
      register.mockRestore()
    }
  })

  it.each([
    { kind: "rewritten evaluate", error: "Execution context was destroyed, most likely because of a navigation." },
    { kind: "locator retry", error: "locator.inputValue: Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator('#payment').contentFrame().locator('#card')" },
  ])("names protected extension UI behind a $kind failure while the relay reports the tab blocked", async ({ error }) => {
    // Playwright hides Chrome's "Cannot access a chrome-extension:// URL of
    // different extension" rejection behind a rewritten evaluate error or a
    // locator timeout; only the relay saw the real message.
    const page = {
      isClosed: () => false,
      url: () => "https://example.test/pay",
      title: async () => "Fixture",
      context: (): BrowserContext => context as unknown as BrowserContext,
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      evaluate: vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error(error)),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const context = {
      pages: () => [],
      on: vi.fn(),
      newPage: vi.fn().mockResolvedValueOnce(page).mockRejectedValue(new Error("Unexpected page replacement")),
      newCDPSession: async () => ({
        send: async () => ({ targetInfo: { targetId: "fixture-target" } }),
        detach: async () => {},
      }),
    }
    const browser = {
      isConnected: () => true,
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    }
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as unknown as Browser)
    const register = vi.spyOn(selectors, "register").mockResolvedValue(undefined)
    const sandbox = new ExecuteSandbox({ endpointUrl: "http://127.0.0.1:1", pageHealthCheckTimeoutMs: 50 })
    try {
      const ready = await Effect.runPromise(sandbox.execute("state.originalPage = page; return page.url()"))
      expect(ready).toMatchObject({ isError: false, value: "https://example.test/pay" })
      expect(sandbox.markTargetProtectedUi("other-target", true)).toBe(false)
      expect(sandbox.markTargetProtectedUi("fixture-target", true)).toBe(true)

      const failure = await Effect.runPromise(sandbox.execute("return page.evaluate(() => true)"))
      expect(failure.isError).toBe(true)
      expect(failure.text).toContain(error.split("\n")[0])
      expect(failure.diagnostic).toBe("target/cross-extension-page")
      expect(failure.warnings).toEqual([
        "Chromium blocked protected extension UI, possibly a password manager. Ask the user to finish or dismiss it in the browser, then retry.",
      ])
      // The tab is healthy; no health check, repair, or replacement follows.
      expect(sandbox.getStatus()).toMatchObject({ connected: true, pageUrl: "https://example.test/pay" })
      const continued = await Effect.runPromise(sandbox.execute("return { samePage: page === state.originalPage }"))
      expect(continued).toMatchObject({ isError: false, value: { samePage: true }, warnings: [] })
      expect(page.evaluate).toHaveBeenCalledTimes(1)
      expect(context.newPage).toHaveBeenCalledTimes(1)
      expect(page.close).not.toHaveBeenCalled()
      expect(connect).toHaveBeenCalledTimes(1)

      // Once the menu is dismissed the same failure is classified as before.
      expect(sandbox.markTargetProtectedUi("fixture-target", false)).toBe(true)
      const later = await Effect.runPromise(sandbox.execute("return page.evaluate(() => true)"))
      expect(later.isError).toBe(true)
      expect(later.diagnostic).not.toBe("target/cross-extension-page")
      expect(later.warnings).toEqual([])
    } finally {
      await Effect.runPromise(sandbox.disconnectSettled())
      connect.mockRestore()
      register.mockRestore()
    }
  })


  it("repairs a stale relay-owned page over a fresh connection instead of replacing it", async () => {
    const makePage = (evaluate: () => Promise<boolean>) => ({
      isClosed: () => false,
      url: () => "https://example.test/sign-in",
      title: async () => "Fixture",
      context: (): BrowserContext => context as unknown as BrowserContext,
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      evaluate: vi.fn(evaluate),
      close: vi.fn().mockResolvedValue(undefined),
    })
    // The first Playwright view of the tab keeps failing with a stale context id.
    const stalePage = makePage(() => Promise.reject(new Error("Execution context was destroyed")))
    // The same tab re-resolved over a new connection answers immediately.
    const repairedPage = makePage(() => Promise.resolve(true))
    const pages: Array<typeof stalePage> = []
    const context = {
      pages: () => pages,
      on: vi.fn(),
      newPage: vi.fn(async () => {
        pages.push(stalePage)
        return stalePage
      }),
      newCDPSession: async () => ({
        send: async () => ({ targetInfo: { targetId: "fixture-target" } }),
        detach: async () => {},
      }),
    }
    let connected = true
    const browser = {
      isConnected: () => connected,
      contexts: () => [context],
      close: vi.fn(async () => { connected = false }),
    }
    const connect = vi.spyOn(chromium, "connectOverCDP").mockImplementation(async () => {
      connected = true
      return browser as unknown as Browser
    })
    const register = vi.spyOn(selectors, "register").mockResolvedValue(undefined)
    const sandbox = new ExecuteSandbox({ endpointUrl: "http://127.0.0.1:1", pageHealthCheckTimeoutMs: 50 })
    try {
      const failure = await Effect.runPromise(sandbox.execute("return page.evaluate(() => true)"))
      expect(failure.isError).toBe(true)
      expect(failure.diagnostic).toMatch(/^execution-context\/context-destroyed/)
      expect(sandbox.getStatus().connected).toBe(false)

      // Reconnecting exposes the same target id through a fresh page object.
      pages.splice(0, pages.length, repairedPage)
      const continued = await Effect.runPromise(sandbox.execute("return { url: page.url() }"))
      expect(continued).toMatchObject({ isError: false, value: { url: "https://example.test/sign-in" } })
      expect(continued.warnings).toEqual([defaultPageRepairedWarning])
      expect(stalePage.close).not.toHaveBeenCalled()
      expect(context.newPage).toHaveBeenCalledTimes(1)
      expect(browser.close).toHaveBeenCalledTimes(1)
      expect(connect).toHaveBeenCalledTimes(2)
      expect(sandbox.getStatus()).toMatchObject({ connected: true, pageUrl: "https://example.test/sign-in" })
    } finally {
      await Effect.runPromise(sandbox.disconnectSettled())
      connect.mockRestore()
      register.mockRestore()
    }
  })

  it("reports an unresponsive relay-owned page and keeps the tab when repair does not help", async () => {
    const page = {
      isClosed: () => false,
      url: () => "https://example.test/customize-your-trip",
      title: async () => "Fixture",
      context: (): BrowserContext => context as unknown as BrowserContext,
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      evaluate: vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error("Execution context was destroyed")),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const pages: Array<typeof page> = []
    const context = {
      pages: () => pages,
      on: vi.fn(),
      newPage: vi.fn(async () => {
        pages.push(page)
        return page
      }),
      newCDPSession: async () => ({
        send: async () => ({ targetInfo: { targetId: "fixture-target" } }),
        detach: async () => {},
      }),
    }
    let connected = true
    const browser = {
      isConnected: () => connected,
      contexts: () => [context],
      close: vi.fn(async () => { connected = false }),
    }
    const connect = vi.spyOn(chromium, "connectOverCDP").mockImplementation(async () => {
      connected = true
      return browser as unknown as Browser
    })
    const register = vi.spyOn(selectors, "register").mockResolvedValue(undefined)
    const sandbox = new ExecuteSandbox({ endpointUrl: "http://127.0.0.1:1", pageHealthCheckTimeoutMs: 50 })
    try {
      const failure = await Effect.runPromise(sandbox.execute("return page.evaluate(() => document.readyState)"))
      expect(failure.isError).toBe(true)
      expect(failure.diagnostic).toMatch(/^execution-context\/context-destroyed/)

      const kept = await Effect.runPromise(sandbox.execute("return page.url()"))
      expect(kept.isError).toBe(true)
      expect(kept.setupFailed).toBe(true)
      expect(kept.diagnostic).toBe("session-page/owned-unresponsive")
      expect(kept.text).toContain("relay-owned session page is unresponsive")
      expect(kept.text).toContain("was kept and was not replaced")
      expect(kept.warnings).toEqual([])
      expect(page.close).not.toHaveBeenCalled()
      expect(context.newPage).toHaveBeenCalledTimes(1)
      expect(sandbox.getStatus()).toMatchObject({ connected: false, pageUrl: "https://example.test/customize-your-trip" })
    } finally {
      await Effect.runPromise(sandbox.disconnectSettled())
      connect.mockRestore()
      register.mockRestore()
    }
  })

  it("still recreates a crashed relay-owned page", async () => {
    const page = {
      isClosed: () => false,
      url: () => "https://example.test/form",
      title: async () => "Fixture",
      context: (): BrowserContext => context as unknown as BrowserContext,
      on: vi.fn(),
      off: vi.fn(),
      once: vi.fn(),
      evaluate: vi.fn<() => Promise<boolean>>().mockRejectedValue(new Error("Target crashed")),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const freshPage = { ...page, url: () => "about:blank", evaluate: vi.fn().mockResolvedValue(true), close: vi.fn() }
    const context = {
      pages: () => [],
      on: vi.fn(),
      newPage: vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(freshPage),
      newCDPSession: async () => ({
        send: async () => ({ targetInfo: { targetId: "fixture-target" } }),
        detach: async () => {},
      }),
    }
    const browser = {
      isConnected: () => true,
      contexts: () => [context],
      close: vi.fn().mockResolvedValue(undefined),
    }
    const connect = vi.spyOn(chromium, "connectOverCDP").mockResolvedValue(browser as unknown as Browser)
    const register = vi.spyOn(selectors, "register").mockResolvedValue(undefined)
    const sandbox = new ExecuteSandbox({ endpointUrl: "http://127.0.0.1:1" })
    try {
      const failure = await Effect.runPromise(sandbox.execute("return page.evaluate(() => true)"))
      expect(failure.isError).toBe(true)
      expect(sandbox.markTargetCrashed("fixture-target")).toBe(true)

      const recovered = await Effect.runPromise(sandbox.execute("return page.url()"))
      expect(recovered).toMatchObject({ isError: false, value: "about:blank" })
      expect(recovered.warnings).toEqual([
        "The session default page target crashed; checking it before the next execute.",
        "The session default page was unresponsive; created a new page. References to the old page in state are stale.",
      ])
      expect(page.close).toHaveBeenCalledTimes(1)
      expect(context.newPage).toHaveBeenCalledTimes(2)
    } finally {
      await Effect.runPromise(sandbox.disconnectSettled())
      connect.mockRestore()
      register.mockRestore()
    }
  })


  it.each(["replace", "detach"] as const)("does not apply a late health result after target %s", async (change) => {
    let finish!: () => void
    let started!: () => void
    const checking = new Promise<void>((resolve) => { started = resolve })
    const fixture = makeMultiPageBrowserFixture([
      { targetId: "old", targetUrl: "https://example.test/form", evaluate: () => { started(); return new Promise<void>((resolve) => { finish = resolve }) } },
      { targetId: "new", targetUrl: "https://example.test/replacement", initiallyVisible: false },
    ])
    const sandbox = new ExecuteSandbox({ endpointUrl: "http://127.0.0.1:1" })
    Object.assign(sandbox, { browser: fixture.browser })
    await Effect.runPromise(sandbox.execute("return page.url()"))
    sandbox.markTargetCrashed("old")
    const pending = Effect.runPromise(sandbox.execute("return page.url()"))
    await checking
    if (change === "replace") {
      fixture.replace("old", "new")
      sandbox.markTargetReplaced("old", "new")
    } else {
      fixture.detach("old")
      sandbox.markTargetDetached("old")
    }
    finish()
    expect(await pending).toMatchObject({ isError: true, diagnostic: "session-page/target-unavailable" })
    expect(fixture.newPageCalls()).toBe(1)
    if (change === "replace") {
      expect(await Effect.runPromise(sandbox.execute("return page.url()"))).toMatchObject({ isError: false, value: "https://example.test/replacement" })
    }
  })

  it("does not erase a replacement that arrives while closing a crashed page", async () => {
    const fixture = makeMultiPageBrowserFixture([
      { targetId: "old", targetUrl: "https://example.test/form", evaluate: async () => { throw new Error("Target crashed") } },
      { targetId: "new", targetUrl: "https://example.test/replacement", initiallyVisible: false },
    ])
    const sandbox = new ExecuteSandbox({ endpointUrl: "http://127.0.0.1:1" })
    Object.assign(sandbox, { browser: fixture.browser })
    await Effect.runPromise(sandbox.execute("return page.url()"))
    const old = fixture.browser.contexts()[0]!.pages()[0]!
    old.close = async () => { fixture.replace("old", "new"); sandbox.markTargetReplaced("old", "new") }
    sandbox.markTargetCrashed("old")
    expect(await Effect.runPromise(sandbox.execute("return page.url()"))).toMatchObject({ isError: true, diagnostic: "session-page/target-unavailable" })
    expect(await Effect.runPromise(sandbox.execute("return page.url()"))).toMatchObject({ isError: false, value: "https://example.test/replacement" })
    expect(fixture.newPageCalls()).toBe(1)
  })

  it("binds screenshotDiff to the selected page and extracts its PNG media", async () => {
    const f = makeWebMcpSandboxFixture()
    const browser = (f.sandbox as unknown as { browser: Browser }).browser
    const page = browser.contexts()[0]!.pages()[0]!
    const screenshot = vi.fn(async () => PNG.sync.write(new PNG({ width: 2, height: 2 })))
    page.screenshot = screenshot
    const result = await Effect.runPromise(f.sandbox.execute("state.before = await page.screenshot(); return await screenshotDiff({ baseline: state.before })"))
    expect(result).toMatchObject({ isError: false, value: { matches: true, changedPixels: 0, changedRatio: 0 } })
    expect(result.media).toHaveLength(1)
    expect(result.media?.[0]).toMatchObject({ mimeType: "image/png" })
    expect(screenshot).toHaveBeenLastCalledWith({ type: "png", scale: "css", fullPage: false })
  })

  it("bounds a stalled adopted-page title without closing or replacing the tab", async () => {
    vi.useFakeTimers()
    const f = makeWebMcpSandboxFixture()
    const browser = (f.sandbox as unknown as { browser: Browser }).browser
    const page = browser.contexts()[0]!.pages()[0]!
    page.title = () => new Promise(() => {})
    page.close = vi.fn()
    try {
      await Effect.runPromise(f.sandbox.adoptPage({ targetId: "webmcp-target", url: page.url() }))
      const read = Effect.runPromise(f.sandbox.execute("return await page.title()"))
      await vi.advanceTimersByTimeAsync(5_100)
      expect(await read).toMatchObject({ isError: true, text: expect.stringContaining("page.title() timed out") })
      expect(await Effect.runPromise(f.sandbox.execute("return page.url()"))).toMatchObject({ isError: false, value: page.url() })
      expect(page.close).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("discovers tools by default across ordinary executions and expires saved helpers", async () => {
    const f = makeWebMcpSandboxFixture()
    const first = await Effect.runPromise(f.sandbox.execute("state.oldWebMcp = webmcp; return 42"))
    expect(first).toMatchObject({ isError: false, value: 42, webmcp: { status: "available", totalTools: 1, changed: true } })
    const repeated = await Effect.runPromise(f.sandbox.execute("return typeof webmcp.call"))
    expect(repeated).toMatchObject({ isError: false, value: "function", webmcp: { changed: false } })
    expect(repeated.webmcp?.tools).toBeUndefined()
    expect(f.create).toHaveBeenCalledTimes(1)
    const expired = await Effect.runPromise(f.sandbox.execute("state.oldWebMcp.list()"))
    expect(expired.isError).toBe(true)
    expect(expired.text).toContain("finished execute")
    expect(expired.webmcp).toMatchObject({ changed: false })
    const off = await Effect.runPromise(f.sandbox.execute("webmcp.list()", { experimentalWebMcp: false }))
    expect(off.isError).toBe(true)
    expect(off.text).toContain("legacy experimentalWebMcp option")
    expect(off.webmcp).toBeUndefined()
    expect(f.listeners.size).toBe(0)
    const resumed = await Effect.runPromise(f.sandbox.execute("return 43"))
    expect(resumed).toMatchObject({ isError: false, value: 43, webmcp: { status: "available", totalTools: 1, changed: true } })
  })

  it("keeps ordinary execution available when native WebMCP is unsupported", async () => {
    const f = makeWebMcpSandboxFixture(false, false, true)
    const result = await Effect.runPromise(f.sandbox.execute("return 42"))
    expect(result).toMatchObject({ isError: false, value: 42, webmcp: { status: "unsupported", totalTools: 0 } })
  })

  it("discovers by default in read-only sessions but rejects invocation", async () => {
    const f = makeWebMcpSandboxFixture(false, true)
    const invoked = vi.fn()
    f.onInvoke = invoked
    const result = await Effect.runPromise(f.sandbox.execute("const tool = (await webmcp.list()).tools[0]; return webmcp.call(tool.id)"))
    expect(result.isError).toBe(true)
    expect(result.text).toContain("read-only")
    expect(result.webmcp).toMatchObject({ status: "available", totalTools: 1 })
    expect(invoked).not.toHaveBeenCalled()
  })

  it.each([false, true])("waits for unawaited WebMCP calls before finishing (script failure: %s)", async (failScript) => {
    const f = makeWebMcpSandboxFixture()
    let resolveStarted!: () => void
    const started = new Promise<void>((resolve) => { resolveStarted = resolve })
    f.onInvoke = resolveStarted
    let settled = false
    const result = Effect.runPromise(f.sandbox.execute(`
      const tool = (await webmcp.list()).tools[0];
      webmcp.call(tool.id, {});
      ${failScript ? 'throw new Error("script failed")' : 'return "script returned"'}
    `)).then((value) => { settled = true; return value })
    await started
    await Promise.resolve()
    expect(settled).toBe(false)
    f.emit({ method: "WebMCP.toolResponded", params: { invocationId: "one", status: "Completed", output: "done" } })
    const completed = await result
    expect(completed.isError).toBe(failScript)
    expect(completed.webmcp?.totalTools).toBe(1)
  })

  it("registers human handoff before invoking a form that requires manual submission", async () => {
    const f = makeWebMcpSandboxFixture(true)
    const order: string[] = []
    f.onInvoke = () => {
      order.push("invoke")
      f.emit({ method: "WebMCP.toolResponded", params: { invocationId: "one", status: "Completed", output: "submitted" } })
    }
    Object.assign(f.sandbox.options, {
      requestHandoff: async ({ start }: { start: () => Promise<unknown> }) => {
        order.push("handoff")
        await start()
        return "resolved"
      },
    })
    const result = await Effect.runPromise(f.sandbox.execute("const tool = (await webmcp.list()).tools[0]; return webmcp.call(tool.id)"))
    expect(result).toMatchObject({ isError: false, value: { status: "Completed", output: "submitted" }, aftermath: { handoffs: 1 } })
    expect(order).toEqual(["handoff", "invoke"])
  })

  it("settles network capture once for a successful execute", async () => {
    const browserFixture = makeAdoptedBrowserFixture({
      targetId: "target-network-settlement",
      targetUrl: "https://example.test/capture",
    })
    const sandbox = new ExecuteSandbox({
      endpointUrl: "http://127.0.0.1:0",
      sessionId: "alpha",
    })
    Object.assign(sandbox, { browser: browserFixture.browser })
    const recorder = (sandbox as unknown as {
      readonly networkCapture: { settleForOutput: () => Promise<void> }
    }).networkCapture
    const settleForOutput = vi.spyOn(recorder, "settleForOutput")

    const result = await Effect.runPromise(sandbox.execute("return 'complete'"))

    expect(result).toMatchObject({ isError: false, value: "complete" })
    expect(settleForOutput).toHaveBeenCalledTimes(1)
  })

  it("reports a real network finalizer failure instead of returning successful output", async () => {
    const browserFixture = makeAdoptedBrowserFixture({
      targetId: "target-network-finalizer-failure",
      targetUrl: "https://example.test/capture",
    })
    const sandbox = new ExecuteSandbox({
      endpointUrl: "http://127.0.0.1:0",
      sessionId: "alpha",
    })
    Object.assign(sandbox, { browser: browserFixture.browser })
    const recorder = (sandbox as unknown as {
      readonly networkCapture: { settleForOutput: () => Promise<void> }
    }).networkCapture
    const settleForOutput = vi.spyOn(recorder, "settleForOutput")
      .mockRejectedValueOnce(new Error("network finalizer failed"))
      .mockResolvedValueOnce()

    const result = await Effect.runPromise(sandbox.execute("return 'unsafe success'"))

    expect(result.isError).toBe(true)
    expect(result.text).toContain("network finalizer failed")
    expect(settleForOutput).toHaveBeenCalledTimes(2)
  })

  it("reports a session connected only when it has a live default page", () => {
    expect(isSessionPageConnected({ browserConnected: true, pageUrl: null, healthCheckRequired: false })).toBe(false)
    expect(isSessionPageConnected({ browserConnected: true, pageUrl: "about:blank", healthCheckRequired: false })).toBe(true)
    expect(isSessionPageConnected({ browserConnected: false, pageUrl: "about:blank", healthCheckRequired: false })).toBe(false)
    expect(isSessionPageConnected({ browserConnected: true, pageUrl: "about:blank", healthCheckRequired: true })).toBe(false)
  })

  it("does not report fallback-page recovery after a detached tab is successfully re-adopted", async () => {
    const targetId = "target-re-adopted"
    const targetUrl = "https://example.test/re-adopted"
    const browserFixture = makeAdoptedBrowserFixture({ targetId, targetUrl })
    let sessions!: BrowserRigSessions
    const sandbox = new ExecuteSandbox({
      endpointUrl: "http://127.0.0.1:0",
      sessionId: "alpha",
      onDefaultTargetChange: (target) => sessions.updateTarget(sessions.sessions.get("alpha")!, target),
    })
    Object.assign(sandbox, { browser: browserFixture.browser })
    sessions = new BrowserRigSessions(
      "http://127.0.0.1:0",
      () => sandbox,
      { getUserAttachedPageUrls: () => [targetUrl] },
    )
    sessions.createNew("alpha")

    await Effect.runPromise(sessions.adopt({
      sessionId: "alpha",
      createIfMissing: false,
      targetId,
      targetUrl,
    }))
    expect(sessions.markTargetDetached(targetId)).toEqual(["alpha"])
    await Effect.runPromise(sessions.adopt({
      sessionId: "alpha",
      createIfMissing: false,
      targetId,
      targetUrl,
    }))

    const { result } = await Effect.runPromise(sessions.execute({
      sessionId: "alpha",
      createIfMissing: false,
      code: "return page.url()",
    }))

    expect(result.value).toBe(targetUrl)
    expect(result.warnings).not.toContain(defaultPageClosedWarning)
    expect(result.warnings.some((warning) => warning.startsWith("Tip: an attached tab is open"))).toBe(false)
    expect(browserFixture.newPageCalls()).toBe(0)
  })

  it("bounds a Playwright operation that never settles", async () => {
    const error = await Effect.runPromise(runPlaywrightOperation({
      label: "Close test page",
      timeoutMs: 20,
      run: () => new Promise<void>(() => {}),
    }).pipe(Effect.flip))

    expect(error.message).toBe("Close test page timed out after 20ms")
  })

  it("keeps a navigable relay-owned error document", async () => {
    let closed = false
    const result = await Effect.runPromise(recoverSessionPage({
      ownsPage: true,
      url: "chrome-error://chromewebdata/",
      timeoutMs: 20,
      healthCheck: () => Promise.resolve(),
      close: () => {
        closed = true
        return Promise.resolve()
      },
    }))

    expect(result).toBe("use")
    expect(closed).toBe(false)
  })

  it("recreates a relay-owned error document whose context is unavailable", async () => {
    let closed = false
    const result = await Effect.runPromise(recoverSessionPage({
      ownsPage: true,
      url: "chrome-error://chromewebdata/",
      timeoutMs: 20,
      healthCheck: () => Promise.reject(new Error("Execution context was destroyed")),
      close: () => {
        closed = true
        return Promise.resolve()
      },
    }))

    expect(result).toBe("recreate")
    expect(closed).toBe(true)
  })

  it("does not claim recovery when an unhealthy relay-owned page cannot close", async () => {
    const error = await Effect.runPromise(recoverSessionPage({
      ownsPage: true,
      url: "chrome-error://chromewebdata/",
      timeoutMs: 20,
      healthCheck: () => Promise.reject(new Error("Execution context was destroyed")),
      close: () => Promise.reject(new Error("target did not close")),
    })).then(
      () => undefined,
      (cause: unknown) => cause,
    )

    expect(error instanceof Error ? error.message : "").toContain("could not be closed")
  })

  it("fails fast without closing an unhealthy adopted page", async () => {
    let closed = false
    const error = await Effect.runPromise(recoverSessionPage({
      ownsPage: false,
      url: "https://example.test/form",
      timeoutMs: 20,
      healthCheck: () => Promise.reject(new Error("Execution context was destroyed")),
      close: () => {
        closed = true
        return Promise.resolve()
      },
    })).then(
      () => undefined,
      (cause: unknown) => cause,
    )

    expect(error).toBeInstanceOf(Error)
    expect(error instanceof Error ? error.message : "").toContain("adopted session page is unresponsive")
    expect(closed).toBe(false)
  })

  it("keeps a relay-owned page with user state instead of closing it", async () => {
    let closed = false
    const result = await Effect.runPromise(recoverSessionPage({
      ownsPage: true,
      url: "https://example.test/sign-in",
      timeoutMs: 20,
      healthCheck: () => Promise.reject(new Error("Execution context was destroyed")),
      close: () => {
        closed = true
        return Promise.resolve()
      },
    }))

    expect(result).toBe("repair")
    expect(closed).toBe(false)
  })

  it("diagnoses a relay-owned page that stays unresponsive after repair without closing it", async () => {
    let closed = false
    const error = await Effect.runPromise(recoverSessionPage({
      ownsPage: true,
      url: "https://example.test/sign-in",
      timeoutMs: 20,
      repaired: true,
      healthCheck: () => Promise.reject(new Error("Execution context was destroyed")),
      close: () => {
        closed = true
        return Promise.resolve()
      },
    })).then(
      () => undefined,
      (cause: unknown) => cause,
    )

    expect(error).toBeInstanceOf(Error)
    const message = error instanceof Error ? error.message : ""
    expect(message).toContain("relay-owned session page is unresponsive")
    expect(message).toContain("even after reconnecting")
    expect(message).toContain("was kept")
    expect(closed).toBe(false)
  })

  it("recreates a crashed relay-owned page regardless of its URL", async () => {
    let closed = false
    const result = await Effect.runPromise(recoverSessionPage({
      ownsPage: true,
      url: "https://example.test/form",
      timeoutMs: 20,
      crashed: true,
      healthCheck: () => Promise.reject(new Error("Target crashed")),
      close: () => {
        closed = true
        return Promise.resolve()
      },
    }))

    expect(result).toBe("recreate")
    expect(closed).toBe(true)
  })

  it("classifies which relay-owned documents are disposable", () => {
    expect(isDisposableSessionPage({ url: "about:blank" })).toBe(true)
    expect(isDisposableSessionPage({ url: "" })).toBe(true)
    expect(isDisposableSessionPage({ url: "chrome-error://chromewebdata/" })).toBe(true)
    expect(isDisposableSessionPage({ url: "https://example.test/form", crashed: true })).toBe(true)
    expect(isDisposableSessionPage({ url: "https://example.test/form" })).toBe(false)
  })

  it("keeps a page that passes the bounded health check", async () => {
    const result = await Effect.runPromise(recoverSessionPage({
      ownsPage: true,
      url: "https://example.test/form",
      timeoutMs: 20,
      healthCheck: () => Promise.resolve(),
      close: () => Promise.resolve(),
    }))

    expect(result).toBe("use")
  })

  it("waits through transient execution-context replacement", async () => {
    let attempts = 0
    await expect(waitForPageContext({
      timeoutMs: 1_000,
      retryDelayMs: 10,
      delay: () => Promise.resolve(),
      evaluate: () => ++attempts < 3
        ? Promise.reject(new Error("Execution context was destroyed"))
        : Promise.resolve(),
    })).resolves.toBeUndefined()
    expect(attempts).toBe(3)
  })

  it("does not retry non-context page failures", async () => {
    let attempts = 0
    await expect(waitForPageContext({
      timeoutMs: 30,
      retryDelayMs: 10,
      delay: () => Promise.resolve(),
      evaluate: () => {
        attempts += 1
        return Promise.reject(new Error("Permission denied"))
      },
    })).rejects.toThrow("Permission denied")
    expect(attempts).toBe(1)
  })

  it("bounds a context evaluation that never settles", async () => {
    const startedAt = Date.now()
    await expect(waitForPageContext({
      timeoutMs: 20,
      evaluate: () => new Promise<void>(() => {}),
    })).rejects.toThrow("did not become available within 20ms")
    expect(Date.now() - startedAt).toBeLessThan(100)
  })

  it("waits for the destination execution context after a resolved handoff", async () => {
    let contextAttempts = 0
    const browserFixture = makeAdoptedBrowserFixture({
      targetId: "target-handoff",
      targetUrl: "https://example.test/destination",
      evaluate: () => {
        contextAttempts += 1
        return contextAttempts < 3
          ? Promise.reject(new Error("Execution context was destroyed, most likely because of a navigation"))
          : Promise.resolve(true)
      },
    })
    const sandbox = new ExecuteSandbox({
      endpointUrl: "http://127.0.0.1:0",
      sessionId: "alpha",
      requestHandoff: () => Promise.resolve("resolved"),
    })
    Object.assign(sandbox, { browser: browserFixture.browser })

    const result = await Effect.runPromise(sandbox.execute("await handoff('finish navigation'); return page.url()"))

    expect(result).toMatchObject({
      isError: false,
      value: "https://example.test/destination",
      aftermath: { handoffs: 1 },
    })
    expect(contextAttempts).toBe(3)
  })

  it("waits for the exact secondary-page context selected by handoff", async () => {
    let defaultAttempts = 0
    let secondaryAttempts = 0
    const browserFixture = makeMultiPageBrowserFixture([
      {
        targetId: "target-default",
        targetUrl: "https://example.test/default",
        evaluate: () => {
          defaultAttempts += 1
          return Promise.resolve(true)
        },
      },
      {
        targetId: "target-secondary",
        targetUrl: "https://example.test/destination",
        evaluate: () => {
          secondaryAttempts += 1
          return secondaryAttempts < 3
            ? Promise.reject(new Error("Execution context was destroyed, most likely because of a navigation"))
            : Promise.resolve(true)
        },
      },
    ])
    const sandbox = new ExecuteSandbox({
      endpointUrl: "http://127.0.0.1:0",
      sessionId: "alpha",
      requestHandoff: () => Promise.resolve("resolved"),
    })
    Object.assign(sandbox, { browser: browserFixture.browser })

    const result = await Effect.runPromise(sandbox.execute(`
      const secondaryPage = context.pages()[1]
      await handoff("finish navigation", { page: secondaryPage })
      return secondaryPage.url()
    `))

    expect(result).toMatchObject({ isError: false, value: "https://example.test/destination" })
    expect(defaultAttempts).toBe(0)
    expect(secondaryAttempts).toBe(3)
  })

  it("fails closed when the handoff page target generation is replaced", async () => {
    let replacementAttempts = 0
    const browserFixture = makeMultiPageBrowserFixture([
      { targetId: "target-old", targetUrl: "https://example.test/wait" },
      {
        targetId: "target-new",
        targetUrl: "https://example.test/destination",
        initiallyVisible: false,
        evaluate: () => {
          replacementAttempts += 1
          return Promise.resolve(true)
        },
      },
    ])
    let sandbox!: ExecuteSandbox
    sandbox = new ExecuteSandbox({
      endpointUrl: "http://127.0.0.1:0",
      sessionId: "alpha",
      requestHandoff: () => {
        browserFixture.replace("target-old", "target-new")
        expect(sandbox.markTargetReplaced("target-old", "target-new")).toBe(true)
        return Promise.resolve("resolved")
      },
    })
    Object.assign(sandbox, { browser: browserFixture.browser })

    const result = await Effect.runPromise(sandbox.execute(`
      await handoff("finish navigation")
      return { url: page.url(), snapshot: await snapshot() }
    `))

    expect(result.isError).toBe(true)
    expect(result.text).toContain("exact handoff page was detached or replaced")
    expect(replacementAttempts).toBe(0)
    expect(browserFixture.newPageCalls()).toBe(1)
  })

  it("does not create a fallback page when the resolved handoff target detaches", async () => {
    let fallbackAttempts = 0
    const browserFixture = makeMultiPageBrowserFixture([
      { targetId: "target-detached", targetUrl: "https://example.test/wait" },
      {
        targetId: "target-unrelated",
        targetUrl: "https://example.test/unrelated",
        evaluate: () => {
          fallbackAttempts += 1
          return Promise.resolve(true)
        },
      },
    ])
    let sandbox!: ExecuteSandbox
    sandbox = new ExecuteSandbox({
      endpointUrl: "http://127.0.0.1:0",
      sessionId: "alpha",
      requestHandoff: () => {
        browserFixture.detach("target-detached")
        expect(sandbox.markTargetDetached("target-detached")).toBe(true)
        return Promise.resolve("resolved")
      },
    })
    Object.assign(sandbox, { browser: browserFixture.browser })

    const result = await Effect.runPromise(sandbox.execute(`
      await handoff("finish navigation")
      return "continued"
    `))

    expect(result.isError).toBe(true)
    expect(result.text).toContain("exact handoff page was detached or replaced")
    expect(fallbackAttempts).toBe(0)
    expect(browserFixture.newPageCalls()).toBe(1)
  })

  it("does not recover a crashed resolved handoff target onto an unrelated page", async () => {
    let fallbackAttempts = 0
    const browserFixture = makeMultiPageBrowserFixture([
      {
        targetId: "target-crashed",
        targetUrl: "https://example.test/wait",
        evaluate: () => Promise.reject(new Error("Target crashed: target-crashed")),
      },
      {
        targetId: "target-unrelated",
        targetUrl: "https://example.test/unrelated",
        evaluate: () => {
          fallbackAttempts += 1
          return Promise.resolve(true)
        },
      },
    ])
    let sandbox!: ExecuteSandbox
    sandbox = new ExecuteSandbox({
      endpointUrl: "http://127.0.0.1:0",
      sessionId: "alpha",
      requestHandoff: () => {
        expect(sandbox.markTargetCrashed("target-crashed")).toBe(true)
        return Promise.resolve("resolved")
      },
    })
    Object.assign(sandbox, { browser: browserFixture.browser })

    const result = await Effect.runPromise(sandbox.execute(`
      await handoff("finish navigation")
      return "continued"
    `))

    expect(result.isError).toBe(true)
    expect(result.text).toContain("Target crashed: target-crashed")
    expect(fallbackAttempts).toBe(0)
    expect(browserFixture.newPageCalls()).toBe(1)
  })
})

function makeMultiPageBrowserFixture(options: readonly {
  readonly targetId: string
  readonly targetUrl: string
  readonly initiallyVisible?: boolean
  readonly evaluate?: () => Promise<unknown>
}[]): {
  readonly browser: Browser
  readonly detach: (targetId: string) => void
  readonly replace: (previousTargetId: string, targetId: string) => void
  readonly newPageCalls: () => number
} {
  type FixturePage = { readonly page: Page; closed: boolean; visible: boolean }
  let newPageCalls = 0
  let context!: BrowserContext
  const pages = new Map<string, FixturePage>()
  for (const option of options) {
    let fixture!: FixturePage
    const mainFrame = { url: () => option.targetUrl }
    const page = {
      close: async () => {
        fixture.closed = true
        fixture.visible = false
      },
      title: async () => "Fixture",
      context: () => context,
      evaluate: option.evaluate ?? (() => Promise.resolve(true)),
      isClosed: () => fixture.closed,
      mainFrame: () => mainFrame,
      off: () => page,
      on: () => page,
      once: () => page,
      url: () => {
        if (fixture.closed) throw new Error("Target page, context or browser has been closed")
        return option.targetUrl
      },
      waitForEvent: () => new Promise(() => {}),
    } as unknown as Page
    fixture = { page, closed: false, visible: option.initiallyVisible !== false }
    pages.set(option.targetId, fixture)
  }
  const firstPage = pages.values().next().value as FixturePage | undefined
  if (!firstPage) throw new Error("Fixture requires at least one page")
  context = {
    newCDPSession: async (page: Page) => {
      const entry = [...pages.entries()].find(([, fixture]) => fixture.page === page)
      if (!entry || entry[1].closed) throw new Error("Target page, context or browser has been closed")
      return {
        detach: async () => {},
        send: async () => ({ targetInfo: { targetId: entry[0] } }),
      }
    },
    newPage: async () => {
      newPageCalls += 1
      const page = [...pages.values()].find((fixture) => fixture.visible && !fixture.closed)
      if (!page) throw new Error("Fixture has no page available for newPage")
      return page.page
    },
    on: () => context,
    pages: () => [...pages.values()].filter((fixture) => fixture.visible && !fixture.closed).map((fixture) => fixture.page),
  } as unknown as BrowserContext
  const browser = {
    contexts: () => [context],
    isConnected: () => true,
  } as unknown as Browser
  return {
    browser,
    detach: (targetId) => {
      const fixture = pages.get(targetId)
      if (!fixture) throw new Error(`Unknown fixture target: ${targetId}`)
      fixture.closed = true
      fixture.visible = false
    },
    replace: (previousTargetId, targetId) => {
      const previous = pages.get(previousTargetId)
      const replacement = pages.get(targetId)
      if (!previous || !replacement) throw new Error("Unknown fixture replacement target")
      previous.closed = true
      previous.visible = false
      replacement.visible = true
    },
    newPageCalls: () => newPageCalls,
  }
}

function makeAdoptedBrowserFixture(options: {
  readonly targetId: string
  readonly targetUrl: string
  readonly evaluate?: () => Promise<unknown>
}): { readonly browser: Browser; readonly newPageCalls: () => number } {
  let newPageCalls = 0
  let context!: BrowserContext
  let page!: Page
  const mainFrame = { url: () => options.targetUrl }
  page = {
    title: async () => "Fixture",
    context: () => context,
    evaluate: options.evaluate ?? (() => Promise.resolve(true)),
    isClosed: () => false,
    mainFrame: () => mainFrame,
    off: () => page,
    on: () => page,
    once: () => page,
    url: () => options.targetUrl,
    waitForEvent: () => new Promise(() => {}),
  } as unknown as Page
  context = {
    newCDPSession: async () => ({
      detach: async () => {},
      send: async () => ({ targetInfo: { targetId: options.targetId } }),
    }),
    newPage: async () => {
      newPageCalls += 1
      return page
    },
    on: () => context,
    pages: () => [page],
  } as unknown as BrowserContext
  const browser = {
    contexts: () => [context],
    isConnected: () => true,
  } as unknown as Browser
  return { browser, newPageCalls: () => newPageCalls }
}

function makeWebMcpSandboxFixture(manualSubmit = false, readOnly = false, unsupported = false) {
  const browser = makeAdoptedBrowserFixture({ targetId: "webmcp-target", targetUrl: "https://example.test/tools" })
  const listeners = new Set<(event: WebMcpEvent) => void>()
  const emit = (event: WebMcpEvent) => { for (const listener of listeners) listener(event) }
  const f = { onInvoke: () => {} }
  const create = vi.fn((targetId: string) => new WebMcpSession(targetId, {
    send: async (method) => {
      if (method === "WebMCP.enable" && unsupported) throw new Error("WebMCP.enable was not found")
      if (method === "WebMCP.enable") emit({ method: "WebMCP.toolsAdded", params: { tools: [{
        name: "search", frameId: "main", inputSchema: { type: "object" },
        ...(manualSubmit ? { backendNodeId: 1 } : {}),
      }] } })
      if (method === "WebMCP.invokeTool") { f.onInvoke(); return { invocationId: "one" } }
      return {}
    },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    childSessions: () => [],
  }, readOnly))
  const sandbox = new ExecuteSandbox({ endpointUrl: "http://127.0.0.1:0", sessionId: "alpha", createWebMcp: create })
  Object.assign(sandbox, { browser: browser.browser })
  return Object.assign(f, { sandbox, create, listeners, emit })
}
