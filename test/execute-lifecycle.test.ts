import type { Browser, BrowserContext, Page } from "playwright-core"
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import {
  defaultPageClosedWarning,
  ExecuteSandbox,
  isSessionPageConnected,
  recoverSessionPage,
  runPlaywrightOperation,
  waitForPageContext,
} from "../src/execute.ts"
import { BrowserRigSessions } from "../src/session-manager.ts"

describe("execute lifecycle", () => {
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
      onDefaultTargetChange: (target) => sessions.updateTarget("alpha", target),
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
})

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
