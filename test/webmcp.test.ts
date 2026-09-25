import { afterEach, describe, expect, it, vi } from "vitest"
import { WebMcpSession, type WebMcpEvent, type WebMcpTransport } from "../src/webmcp.ts"
import type { JsonObject } from "../src/protocol.ts"

const tool = (name = "search", frameId = "main", extra: JsonObject = {}) => ({
  name, frameId, description: "Search the page", inputSchema: { type: "object", properties: { query: { type: "string" } } }, ...extra,
})

function fixture(initialTools: JsonObject[] = [tool()], children: string[] = [], readOnly = false) {
  const listeners = new Set<(event: WebMcpEvent) => void>()
  const emit = (event: WebMcpEvent) => { for (const listener of listeners) listener(event) }
  let nextInvocation = 0
  const send = vi.fn<WebMcpTransport["send"]>(async (method, _params, sessionId) => {
    if (method === "WebMCP.enable") emit({ method: "WebMCP.toolsAdded", params: { tools: initialTools }, ...(sessionId ? { sessionId } : {}) })
    if (method === "WebMCP.invokeTool") return { invocationId: `invoke-${++nextInvocation}` }
    return {}
  })
  const session = new WebMcpSession("root", {
    send,
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    childSessions: () => children,
  }, readOnly)
  const respond = (status: "Completed" | "Canceled" | "Error", extra: JsonObject = {}, sessionId?: string, invocationId = "invoke-1") => emit({
    method: "WebMCP.toolResponded", params: { invocationId, status, ...extra }, ...(sessionId ? { sessionId } : {}),
  })
  return { session, emit, send, listeners, respond }
}

afterEach(() => vi.useRealTimers())

describe("native WebMCP", () => {
  it("discovers full definitions, reports changes once, and does not expose mutable registry entries", async () => {
    const f = fixture()
    await f.session.start()
    const first = await f.session.report()
    expect(first).toMatchObject({ status: "available", totalTools: 1, changed: true, tools: [tool()] })
    expect(first.tools?.[0]?.id).toMatch(/^wmcp-/)
    const second = await f.session.report()
    expect(second.changed).toBe(false)
    expect(second.tools).toBeUndefined()
    Object.assign(first.tools![0]!.inputSchema, { type: "array" })
    expect((await f.session.list()).tools![0]!.inputSchema.type).toBe("object")
    f.session.dispose()
    expect(f.listeners.size).toBe(0)
  })

  it("invalidates handles on removal and re-registration even for identical names", async () => {
    const f = fixture()
    await f.session.start()
    const old = (await f.session.list()).tools![0]!
    f.emit({ method: "WebMCP.toolsRemoved", params: { tools: [{ name: old.name, frameId: old.frameId }] } })
    f.emit({ method: "WebMCP.toolsAdded", params: { tools: [tool()] } })
    const current = (await f.session.list()).tools![0]!
    expect(current.id).not.toBe(old.id)
    await expect(f.session.call(old.id)).rejects.toThrow("stale")
    expect(f.send.mock.calls.some(([method]) => method === "WebMCP.invokeTool")).toBe(false)
  })

  it("invalidates old document tools on navigation even without toolsRemoved", async () => {
    const f = fixture([tool(), tool("child", "frame")])
    await f.session.start()
    const old = (await f.session.list()).tools![0]!
    f.emit({ method: "Page.frameNavigated", params: { frame: { id: "main", url: "https://example.test/next", loaderId: "next" } } })
    expect((await f.session.list()).totalTools).toBe(0)
    f.emit({ method: "WebMCP.toolsAdded", params: { tools: [tool()] } })
    await expect(f.session.call(old.id)).rejects.toThrow("stale")
    expect((await f.session.list()).totalTools).toBe(1)
  })

  it("preserves handles for same-document navigation and clears detached frame descendants", async () => {
    const f = fixture([tool(), tool("child", "frame"), tool("nested", "nested")])
    await f.session.start()
    const first = await f.session.list()
    f.emit({ method: "Page.navigatedWithinDocument", params: { frameId: "main", url: "https://example.test/#one" } })
    expect((await f.session.list()).tools).toEqual(first.tools)
    f.emit({ method: "Page.frameAttached", params: { frameId: "frame", parentFrameId: "main" } })
    f.emit({ method: "Page.frameAttached", params: { frameId: "nested", parentFrameId: "frame" } })
    f.emit({ method: "Page.frameDetached", params: { frameId: "frame" } })
    expect((await f.session.list()).tools?.map((tool) => tool.name)).toEqual(["search"])
  })

  it("routes identically named iframe tools and results using the real child session", async () => {
    const f = fixture([tool()], ["child"])
    await f.session.start()
    const tools = (await f.session.list()).tools!
    expect(tools).toHaveLength(2)
    expect(tools[0]!.id).not.toBe(tools[1]!.id)
    const invoked = f.session.call(tools[1]!.id, { query: "hello" })
    await Promise.resolve()
    expect(f.send).toHaveBeenLastCalledWith("WebMCP.invokeTool", { frameId: "main", toolName: "search", input: { query: "hello" } }, "child")
    f.respond("Completed", { output: "wrong channel" })
    f.respond("Completed", { output: "correct channel" }, "child")
    await expect(invoked).resolves.toEqual({ status: "Completed", output: "correct channel" })
  })

  it("subscribes to new iframe targets and rejects calls pending on detached iframes", async () => {
    const f = fixture()
    await f.session.start()
    f.emit({ method: "Target.attachedToTarget", params: { sessionId: "new-child", targetInfo: { type: "iframe" } } })
    const tools = (await f.session.list()).tools!
    expect(tools).toHaveLength(2)
    const call = f.session.call(tools[1]!.id)
    await Promise.resolve()
    f.emit({ method: "Target.detachedFromTarget", params: { sessionId: "new-child" } })
    await expect(call).rejects.toThrow("iframe detached")
    expect((await f.session.list()).totalTools).toBe(1)
  })

  it("waits for the final response and retains a navigation-causing invocation", async () => {
    const f = fixture()
    await f.session.start()
    const id = (await f.session.list()).tools![0]!.id
    const call = f.session.call(id)
    let finished = false
    void call.then(() => { finished = true })
    await Promise.resolve()
    expect(finished).toBe(false)
    f.emit({ method: "Page.frameNavigated", params: { frame: { id: "main", url: "https://example.test/next" } } })
    f.respond("Completed", { output: ["navigated"] })
    await expect(call).resolves.toEqual({ status: "Completed", output: ["navigated"] })
    expect((await f.session.list()).tools).toEqual([])
  })

  it("handles a response event arriving before the command promise resumes", async () => {
    const f = fixture()
    await f.session.start()
    const id = (await f.session.list()).tools![0]!.id
    f.send.mockImplementationOnce(async () => {
      f.respond("Completed", { output: { ok: true } })
      return { invocationId: "invoke-1" }
    })
    await expect(f.session.call(id)).resolves.toEqual({ status: "Completed", output: { ok: true } })
  })

  it.each(["Error", "Canceled"] as const)("preserves Chrome's %s status", async (status) => {
    const f = fixture()
    await f.session.start()
    const call = f.session.call((await f.session.list()).tools![0]!.id)
    await Promise.resolve()
    f.respond(status, { errorText: "website response" })
    await expect(call).resolves.toEqual({ status, errorText: "website response" })
  })

  it("cancels an invocation on timeout and reports its uncertain side effects", async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.session.start()
    const call = f.session.call((await f.session.list()).tools![0]!.id, {}, { timeoutMs: 100 })
    const expectation = expect(call).rejects.toThrow("Cancellation is cooperative")
    await vi.advanceTimersByTimeAsync(100)
    await expectation
    expect(f.send).toHaveBeenLastCalledWith("WebMCP.cancelInvocation", { invocationId: "invoke-1" }, undefined)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("handles abort before and during invocation without sending duplicate cancellation", async () => {
    const f = fixture()
    await f.session.start()
    const id = (await f.session.list()).tools![0]!.id
    await expect(f.session.call(id, {}, { signal: AbortSignal.abort() })).rejects.toThrow("before starting")
    expect(f.send.mock.calls.some(([method]) => method === "WebMCP.invokeTool")).toBe(false)
    const controller = new AbortController()
    const call = f.session.call(id, {}, { signal: controller.signal })
    controller.abort()
    await expect(call).rejects.toThrow("canceled")
    expect(f.send.mock.calls.filter(([method]) => method === "WebMCP.cancelInvocation")).toHaveLength(1)
  })

  it("rejects pending invocations and old handles after a root replacement", async () => {
    const f = fixture()
    await f.session.start()
    const id = (await f.session.list()).tools![0]!.id
    const call = f.session.call(id)
    await Promise.resolve()
    f.emit({ method: "BrowserRig.targetInvalidated" })
    await expect(call).rejects.toThrow("detached, replaced, or crashed")
    await expect(f.session.call(id)).rejects.toThrow("stale")
    expect(f.listeners.size).toBe(0)
    expect((await f.session.list()).status).toBe("unavailable")
  })

  it("cannot use a tool handle from a different session", async () => {
    const alpha = fixture()
    const beta = fixture()
    await Promise.all([alpha.session.start(), beta.session.start()])
    await expect(beta.session.call((await alpha.session.list()).tools![0]!.id)).rejects.toThrow("stale")
  })

  it("reports unsupported Chrome without failing ordinary discovery", async () => {
    const f = fixture()
    f.send.mockRejectedValue(new Error("'WebMCP.disable' wasn't found"))
    await f.session.start()
    expect(await f.session.report()).toMatchObject({ status: "unsupported", totalTools: 0, tools: [] })
  })

  it("identifies declarative tools requiring human submission", async () => {
    const f = fixture([
      tool("imperative"),
      tool("manual", "main", { backendNodeId: 15 }),
      tool("automatic", "main", { backendNodeId: 16, annotations: { autosubmit: true } }),
    ])
    await f.session.start()
    expect((await f.session.list()).tools?.map((t) => [t.name, t.requiresConfirmation])).toEqual([
      ["imperative", false], ["manual", true], ["automatic", false],
    ])
  })

  it("bounds automatic output and paginates the retained registry", async () => {
    const f = fixture(Array.from({ length: 300 }, (_, i) => tool(`tool-${i}`)))
    await f.session.start()
    const initial = await f.session.report()
    expect(initial).toMatchObject({ totalTools: 256, omittedTools: 44, nextOffset: 25 })
    expect(initial.tools).toHaveLength(25)
    const more = await f.session.list({ offset: 25, limit: 100 })
    expect(more.tools![0]!.name).toBe("tool-25")
    expect(more.tools).toHaveLength(100)
    expect(await f.session.report()).toMatchObject({ changed: false, offset: 25, nextOffset: 125, tools: more.tools })
    await expect(f.session.list({ offset: -1 })).rejects.toThrow("offset")
  })

  it("rejects invocation in read-only sessions even for a tool marked read-only", async () => {
    const f = fixture([tool("read", "main", { annotations: { readOnly: true } })], [], true)
    await f.session.start()
    await expect(f.session.call((await f.session.list()).tools![0]!.id)).rejects.toThrow("regardless of website annotations")
    expect(f.send.mock.calls.some(([method]) => method === "WebMCP.invokeTool")).toBe(false)
  })

  it("stops native discovery and removes listeners when disabled", async () => {
    const f = fixture()
    await f.session.start()
    await f.session.stop()
    expect(f.send).toHaveBeenLastCalledWith("WebMCP.disable", {}, undefined)
    expect(f.listeners.size).toBe(0)
  })

  it("rejects invalid or oversized inputs before executing a tool", async () => {
    const f = fixture()
    await f.session.start()
    const id = (await f.session.list()).tools![0]!.id
    await expect(f.session.call(id, [] as unknown as JsonObject)).rejects.toThrow("JSON object")
    await expect(f.session.call(id, { text: "x".repeat(1024 * 1024) })).rejects.toThrow("1 MiB")
    await expect(f.session.call(id, {}, { timeoutMs: 0 })).rejects.toThrow("timeoutMs")
    expect(f.send.mock.calls.some(([method]) => method === "WebMCP.invokeTool")).toBe(false)
  })
})
