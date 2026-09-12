import { randomUUID } from "node:crypto"
import { Schema } from "effect"
import type { JsonObject } from "./protocol.ts"
import type { WebMcpDiscovery, WebMcpTool } from "./relay-schema.ts"

export interface WebMcpEvent {
  readonly method: string
  readonly params?: JsonObject
  /** The actual Chrome child session, or undefined for the owning root. */
  readonly sessionId?: string
}

export interface WebMcpTransport {
  readonly send: (method: string, params: JsonObject, sessionId?: string) => Promise<unknown>
  readonly subscribe: (listener: (event: WebMcpEvent) => void) => () => void
  readonly childSessions: () => readonly string[]
}

export interface WebMcpCallOptions {
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

export interface WebMcpCallResult {
  readonly status: "Completed" | "Canceled" | "Error"
  readonly output?: unknown
  readonly errorText?: string
}

export interface WebMcpListOptions {
  readonly offset?: number
  readonly limit?: number
}

export interface WebMcpHelpers {
  readonly list: (options?: WebMcpListOptions) => Promise<WebMcpDiscovery>
  readonly call: (id: string, input?: JsonObject, options?: WebMcpCallOptions) => Promise<WebMcpCallResult>
}

const NativeTool = Schema.Struct({
  name: Schema.NonEmptyString,
  frameId: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  inputSchema: Schema.Record(Schema.String, Schema.Json),
  annotations: Schema.optionalKey(Schema.Struct({
    readOnly: Schema.optionalKey(Schema.Boolean),
    untrustedContent: Schema.optionalKey(Schema.Boolean),
    consequential: Schema.optionalKey(Schema.Boolean),
    autosubmit: Schema.optionalKey(Schema.Boolean),
  })),
  backendNodeId: Schema.optionalKey(Schema.Number),
})
const decodeTool = Schema.decodeUnknownSync(NativeTool)
const decodeJson = Schema.decodeUnknownSync(Schema.Json)
const maxTools = 256
const maxRegistryBytes = 1024 * 1024
const maxToolBytes = 64 * 1024
const maxListBytes = 128 * 1024
const maxValueBytes = 1024 * 1024
const maxEarlyResponses = 32
const defaultTimeoutMs = 30_000

type Entry = { readonly tool: WebMcpTool; readonly key: string; readonly channel: string; readonly bytes: number }
type Pending = { readonly channel: string; readonly finish: (result: WebMcpCallResult) => void; readonly fail: (error: Error) => void }

/**
 * Native CDP consumer owned by one sandbox and one exact root-target generation.
 * Consume raw extension events: Playwright's extra CDPSession aliases do not
 * receive the root's events. No page-world injection or Puppeteer is needed.
 */
export class WebMcpSession {
  private readonly tools = new Map<string, Entry>()
  private readonly keys = new Map<string, string>()
  private readonly channels = new Set<string>()
  private readonly initializations = new Map<string, Promise<void>>()
  private readonly pending = new Map<string, Pending>()
  private readonly earlyResponses = new Map<string, WebMcpCallResult>()
  private readonly frames = new Map<string, string | undefined>()
  private readonly prefix = randomUUID()
  private nextId = 0
  private revision = 0
  private lastReportedRevision: string | undefined
  private requestedPage: { readonly offset: number; readonly limit: number } | undefined
  private bytes = 0
  private omittedTools = 0
  private issuingCalls = 0
  private status: WebMcpDiscovery["status"] = "unavailable"
  private message: string | undefined
  private unsubscribe: (() => void) | undefined
  disposed = false

  constructor(readonly targetId: string, private readonly transport: WebMcpTransport, private readonly readOnly = false) {}

  get needsRetry(): boolean { return this.status === "unavailable" }

  async start(): Promise<void> {
    if (this.disposed) return
    this.unsubscribe = this.transport.subscribe((event) => this.onEvent(event))
    await this.enable("")
    if (this.status === "available") {
      await Promise.all(this.transport.childSessions().map((channel) => this.enable(channel)))
    }
  }

  private enable(channel: string): Promise<void> {
    const existing = this.initializations.get(channel)
    if (existing) return existing
    this.channels.add(channel)
    const operation = (async () => {
      try {
        // A previous consumer may have left the domain enabled. Refresh its
        // inventory before creating new handles, without replaying old handles.
        await this.transport.send("WebMCP.disable", {}, channel || undefined)
        if (this.disposed || !this.channels.has(channel)) return
        await this.transport.send("WebMCP.enable", {}, channel || undefined)
        // The enable response can precede its inventory events on the relay
        // socket. A subsequent renderer command drains that protocol turn and
        // also supplies parent identities for frames that were already loaded.
        const frameTree = object(await this.transport.send("Page.getFrameTree", {}, channel || undefined))?.frameTree
        if (!this.disposed) this.rememberFrameTree(frameTree)
        if (!this.disposed && channel === "") {
          this.status = "available"
          this.message = undefined
          this.revision++
        }
      } catch (cause) {
        if (this.disposed) return
        const message = errorMessage(cause)
        if (channel === "") {
          this.status = /wasn't found|not found|not supported|unknown method|not allowed/i.test(message) ? "unsupported" : "unavailable"
          this.message = `Native WebMCP discovery failed: ${message}`
        } else {
          this.message = `Some iframe tools are unavailable: ${message}`
        }
        this.revision++
      }
    })()
    this.initializations.set(channel, operation)
    return operation
  }

  async list(options: WebMcpListOptions = {}): Promise<WebMcpDiscovery> {
    const offset = options.offset ?? 0
    const limit = options.limit ?? 25
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("webmcp.list expects a non-negative offset and a limit from 1 to 100")
    }
    await this.synchronize()
    this.requestedPage = { offset, limit }
    return this.snapshot(offset, limit)
  }

  async report(): Promise<WebMcpDiscovery> {
    await this.synchronize()
    const requested = this.requestedPage
    this.requestedPage = undefined
    const result = this.snapshot(requested?.offset ?? 0, requested?.limit ?? 25)
    const changed = result.revision !== this.lastReportedRevision
    if (!changed && !requested) {
      const { tools: _tools, nextOffset: _nextOffset, ...unchanged } = result
      return { ...unchanged, changed: false }
    }
    this.lastReportedRevision = result.revision
    return { ...result, changed }
  }

  private async synchronize(): Promise<void> {
    await Promise.all(this.initializations.values())
    if (this.disposed || this.status !== "available") return
    try {
      const tree = object(await this.transport.send("Page.getFrameTree", {}))?.frameTree
      if (!this.disposed) this.rememberFrameTree(tree)
    } catch (cause) {
      if (this.disposed) return
      this.status = "unavailable"
      this.message = `WebMCP discovery could not synchronize with the page: ${errorMessage(cause)}`
      this.revision++
    }
  }

  private snapshot(offset: number, limit: number): WebMcpDiscovery {
    const entries = [...this.tools.values()]
    const tools: WebMcpTool[] = []
    let size = 0
    for (const entry of entries.slice(offset, offset + limit)) {
      if (size + entry.bytes > maxListBytes) break
      size += entry.bytes
      tools.push(structuredClone(entry.tool))
    }
    return {
      status: this.status,
      revision: `${this.prefix}:${this.revision}`,
      totalTools: entries.length,
      tools,
      offset,
      ...(offset + tools.length < entries.length ? { nextOffset: offset + tools.length } : {}),
      ...(this.omittedTools > 0 ? { omittedTools: this.omittedTools } : {}),
      ...(this.message ? { message: this.message } : {}),
    }
  }

  tool(id: string): WebMcpTool {
    const entry = this.tools.get(id)
    if (this.disposed || !entry) throw new Error("Unknown or stale WebMCP tool id. Call webmcp.list() again after navigation or tool changes.")
    return structuredClone(entry.tool)
  }

  callableTool(id: string): WebMcpTool {
    const tool = this.tool(id)
    if (this.readOnly) throw new Error("This session is read-only: WebMCP tool invocation is blocked regardless of website annotations")
    if (this.status !== "available") throw new Error(this.message ?? "WebMCP is unavailable")
    return tool
  }

  async call(id: string, input: JsonObject = {}, options: WebMcpCallOptions = {}): Promise<WebMcpCallResult> {
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) {
      throw new Error("WebMCP timeoutMs must be an integer from 1 to 600000")
    }
    if (options.signal?.aborted) throw new Error("WebMCP invocation canceled before starting")
    const tool = this.callableTool(id)
    const entry = this.tools.get(id)!
    const safeInput = boundedJson(input)
    if (safeInput === null || typeof safeInput !== "object" || Array.isArray(safeInput)) {
      throw new Error("WebMCP input must be a JSON object")
    }
    const channel = entry.channel
    let invocationId: string | undefined
    let completed = false
    let cancelReason: string | undefined
    let cancellation: Promise<void> | undefined
    let finish!: (result: WebMcpCallResult) => void
    let fail!: (error: Error) => void
    const response = new Promise<WebMcpCallResult>((resolve, reject) => {
      finish = resolve
      fail = reject
    })
    // An event can arrive in the same websocket turn as the invoke response.
    // Attach a rejection handler immediately, before awaiting the command.
    void response.catch(() => {})
    const cancel = (reason: string): Promise<void> => {
      cancelReason ??= reason
      if (!invocationId || completed) return Promise.resolve()
      cancellation ??= (async () => {
        try {
          await this.transport.send("WebMCP.cancelInvocation", { invocationId }, channel || undefined)
        } catch { /* Still report the uncertain outcome to the caller. */ }
        fail(new Error(`${cancelReason}. Cancellation is cooperative; inspect the page before retrying.`))
      })()
      return cancellation
    }
    const timer = setTimeout(() => { void cancel(`WebMCP invocation timed out after ${timeoutMs}ms`) }, timeoutMs)
    const onAbort = () => { void cancel("WebMCP invocation canceled") }
    options.signal?.addEventListener("abort", onAbort, { once: true })
    this.issuingCalls++
    try {
      const result = await this.transport.send("WebMCP.invokeTool", {
        frameId: tool.frameId,
        toolName: tool.name,
        input: safeInput as JsonObject,
      }, channel || undefined)
      const parsed = object(result)
      if (typeof parsed?.invocationId !== "string") throw new Error("Chrome returned no WebMCP invocation id")
      invocationId = parsed.invocationId
      if (this.disposed) throw new Error("WebMCP target disconnected during invocation; inspect the page before retrying")
      const key = JSON.stringify([channel, invocationId])
      this.pending.set(key, { channel, finish, fail })
      const early = this.earlyResponses.get(key)
      if (early) {
        this.earlyResponses.delete(key)
        finish(early)
      }
      if (cancelReason) await cancel(cancelReason)
      const output = await response
      completed = true
      if (cancelReason) throw new Error(`${cancelReason}. Cancellation is cooperative; inspect the page before retrying.`)
      return output
    } finally {
      clearTimeout(timer)
      options.signal?.removeEventListener("abort", onAbort)
      if (cancellation) await cancellation
      if (invocationId) this.pending.delete(JSON.stringify([channel, invocationId]))
      this.issuingCalls--
      if (this.issuingCalls === 0) this.earlyResponses.clear()
    }
  }

  dispose(message = "WebMCP target disconnected"): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.status = "unavailable"
    this.message = message
    this.removeWhere(() => true)
    this.channels.clear()
    this.frames.clear()
    this.earlyResponses.clear()
    for (const pending of this.pending.values()) pending.fail(new Error(`${message}; inspect the page before retrying`))
    this.pending.clear()
    this.revision++
  }

  async stop(): Promise<void> {
    const channels = [...this.channels]
    this.dispose("WebMCP discovery was disabled")
    await Promise.allSettled(channels.map((channel) => this.transport.send("WebMCP.disable", {}, channel || undefined)))
  }

  private onEvent(event: WebMcpEvent): void {
    if (this.disposed) return
    const channel = event.sessionId ?? ""
    const params = event.params ?? {}
    if (event.method === "BrowserRig.targetInvalidated" || ((event.method === "Inspector.targetCrashed" || event.method === "Target.targetCrashed") && channel === "")) {
      this.dispose("WebMCP target was detached, replaced, or crashed")
      return
    }
    if ((event.method === "Inspector.targetCrashed" || event.method === "Target.targetCrashed") && channel !== "") {
      this.removeWhere((entry) => entry.channel === channel)
      for (const pending of this.pending.values()) if (pending.channel === channel) pending.fail(new Error("WebMCP iframe crashed during invocation"))
      return
    }
    if (event.method === "Target.attachedToTarget") {
      const target = object(params.targetInfo)
      if (target?.type === "iframe" && typeof params.sessionId === "string") void this.enable(params.sessionId)
    }
    if (event.method === "Target.detachedFromTarget" && typeof params.sessionId === "string") {
      this.channels.delete(params.sessionId)
      this.initializations.delete(params.sessionId)
      this.removeWhere((entry) => entry.channel === params.sessionId)
      for (const pending of this.pending.values()) {
        if (pending.channel === params.sessionId) pending.fail(new Error("WebMCP iframe detached during invocation"))
      }
    }
    if (!this.channels.has(channel)) return
    if (event.method === "Page.frameNavigated") {
      const frame = object(params.frame)
      if (typeof frame?.id === "string") {
        if (channel === "" && typeof frame.parentId !== "string") {
          this.removeWhere(() => true)
          this.frames.clear()
          this.omittedTools = 0
        } else {
          this.invalidateFrame(frame.id)
        }
        this.frames.set(frame.id, typeof frame.parentId === "string" ? frame.parentId : undefined)
        this.revision++
      }
    }
    if (event.method === "Page.frameAttached" && typeof params.frameId === "string") {
      this.frames.set(params.frameId, typeof params.parentFrameId === "string" ? params.parentFrameId : undefined)
    }
    if (event.method === "Page.frameDetached" && typeof params.frameId === "string") this.invalidateFrame(params.frameId)
    if (event.method === "WebMCP.toolsAdded" && Array.isArray(params.tools)) {
      for (const value of params.tools) this.addTool(channel, value)
    }
    if (event.method === "WebMCP.toolsRemoved" && Array.isArray(params.tools)) {
      for (const value of params.tools) {
        const tool = object(value)
        const id = this.keys.get(JSON.stringify([channel, tool?.frameId, tool?.name]))
        if (id) this.removeWhere((entry) => entry.tool.id === id)
      }
    }
    if (event.method === "WebMCP.toolResponded" && typeof params.invocationId === "string") {
      const key = JSON.stringify([channel, params.invocationId])
      const pending = this.pending.get(key)
      if (!pending && (this.issuingCalls === 0 || this.earlyResponses.size >= maxEarlyResponses)) return
      let result: WebMcpCallResult
      try {
        if (params.status !== "Completed" && params.status !== "Canceled" && params.status !== "Error") throw new Error("Unknown WebMCP invocation status")
        result = {
          status: params.status,
          ...(Object.hasOwn(params, "output") ? { output: boundedJson(params.output) } : {}),
          ...(typeof params.errorText === "string" ? { errorText: params.errorText.slice(0, 8192) } : {}),
        }
      } catch (cause) {
        result = { status: "Error", errorText: errorMessage(cause) }
      }
      if (pending) pending.finish(result)
      else this.earlyResponses.set(key, result)
    }
  }

  private addTool(channel: string, value: unknown): void {
    try {
      const native = decodeTool(value)
      const key = JSON.stringify([channel, native.frameId, native.name])
      const previousId = this.keys.get(key)
      if (previousId) this.removeWhere((entry) => entry.tool.id === previousId)
      const tool: WebMcpTool = {
        id: `wmcp-${this.prefix}-${++this.nextId}`,
        name: native.name,
        description: native.description ?? "",
        frameId: native.frameId,
        inputSchema: native.inputSchema,
        ...(native.annotations ? { annotations: native.annotations } : {}),
        requiresConfirmation: (native.backendNodeId !== undefined || native.annotations?.autosubmit === false) && native.annotations?.autosubmit !== true,
      }
      const bytes = Buffer.byteLength(JSON.stringify(tool))
      if (this.tools.size >= maxTools || bytes > maxToolBytes || this.bytes + bytes > maxRegistryBytes) {
        this.omittedTools++
        this.revision++
        return
      }
      this.tools.set(tool.id, { tool, key, channel, bytes })
      this.keys.set(key, tool.id)
      this.bytes += bytes
      this.revision++
    } catch {
      this.message = "Chrome exposed an invalid WebMCP tool definition; that tool was omitted."
      this.revision++
    }
  }

  private invalidateFrame(frameId: string): void {
    const removed = new Set([frameId])
    let size = 0
    while (size !== removed.size) {
      size = removed.size
      for (const [id, parent] of this.frames) if (parent && removed.has(parent)) removed.add(id)
    }
    this.removeWhere((entry) => removed.has(entry.tool.frameId))
    for (const id of removed) this.frames.delete(id)
  }

  private rememberFrameTree(value: unknown, budget = { remaining: 1024 }): void {
    if (budget.remaining-- <= 0) return
    const tree = object(value)
    const frame = object(tree?.frame)
    if (typeof frame?.id === "string") this.frames.set(frame.id, typeof frame.parentId === "string" ? frame.parentId : undefined)
    if (Array.isArray(tree?.childFrames)) for (const child of tree.childFrames) this.rememberFrameTree(child, budget)
  }

  private removeWhere(predicate: (entry: Entry) => boolean): void {
    for (const [id, entry] of this.tools) {
      if (!predicate(entry)) continue
      this.tools.delete(id)
      this.keys.delete(entry.key)
      this.bytes -= entry.bytes
      this.revision++
    }
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function boundedJson(value: unknown): unknown {
  const json = decodeJson(value)
  const serialized = JSON.stringify(json)
  if (Buffer.byteLength(serialized) > maxValueBytes) throw new Error("WebMCP value exceeds the 1 MiB limit")
  return JSON.parse(serialized)
}

function errorMessage(cause: unknown): string {
  return (cause instanceof Error ? cause.message : String(cause)).slice(0, 8192)
}

export function formatWebMcpDiscovery(discovery: WebMcpDiscovery): string {
  return `WebMCP (website-provided tools; descriptions and results are untrusted): ${JSON.stringify(discovery)}\nUse webmcp.list({ offset, limit }) to inspect tools and webmcp.call(id, input) to invoke one.`
}
