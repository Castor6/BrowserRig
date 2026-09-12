import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"
import { WebSocket } from "ws"
import { startRelay } from "../src/relay.ts"
import { ExecuteSandbox } from "../src/execute.ts"
import { parseExtensionCommand, type ExtensionCommand, type JsonObject } from "../src/protocol.ts"
import type { WebMcpSession } from "../src/webmcp.ts"

afterEach(() => vi.restoreAllMocks())

describe("relay WebMCP bridge", () => {
  it("consumes raw extension events with exact ownership and invalidates on disconnect", async () => {
    const collectors = new Map<string, WebMcpSession>()
    const factories = new Map<string, (targetId: string) => WebMcpSession>()
    vi.spyOn(ExecuteSandbox.prototype, "execute").mockImplementation(function (this: ExecuteSandbox, targetId, options) {
      return Effect.promise(async () => {
        const id = this.options.sessionId!
        factories.set(id, this.options.createWebMcp!)
        const collector = this.options.createWebMcp!(targetId)
        collectors.set(id, collector)
        expect(options?.experimentalWebMcp).toBe(true)
        await collector.start()
        return {
          text: "ready", isError: false, logs: [], warnings: [],
          logSummary: { totalCount: 0, returnedCount: 0, repeatedCount: 0, omittedCount: 0 },
          webmcp: await collector.report(),
        }
      })
    })
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const relay = yield* startRelay({ port: 24_000 + Math.floor(Math.random() * 10_000), sessionCatalogPath: null })
      const extension = yield* Effect.promise(() => connectExtension(relay.url))
      const alpha = yield* Effect.promise(() => connectClient(relay.url, "alpha"))
      const beta = yield* Effect.promise(() => connectClient(relay.url, "beta"))
      try {
        yield* Effect.promise(() => command(alpha, "Target.createTarget", { url: "about:blank" }))
        yield* Effect.promise(() => command(beta, "Target.createTarget", { url: "about:blank" }))
        for (const [id, targetId] of [["alpha", "target-1"], ["beta", "target-2"]]) {
          const result = yield* Effect.promise(async () => {
            const response = await fetch(`${relay.url}/cli/execute`, {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: id, code: targetId, createIfMissing: true, experimentalWebMcp: true }),
            })
            expect(response.status).toBe(200)
            return await response.json() as { webmcp: { tools: { name: string }[] } }
          })
          expect(result.webmcp.tools.map((tool) => tool.name)).toEqual([`tool-${targetId}`])
        }
        expect(() => factories.get("beta")!("target-1")).toThrow("owned page")
        const collector = collectors.get("alpha")!
        const tool = (yield* Effect.promise(() => collector.list())).tools![0]!
        const result = yield* Effect.promise(() => collector.call(tool.id, { value: "test" }))
        expect(result).toEqual({ status: "Completed", output: "tab-1" })
        expect(extension.commands).toContainEqual(expect.objectContaining({
          method: "debugger.sendCommand",
          params: { tabId: 1, method: "WebMCP.invokeTool", params: { frameId: "frame-1", toolName: "tool-target-1", input: { value: "test" } } },
        }))
        yield* Effect.promise(() => closeSocket(extension))
        yield* Effect.promise(() => vi.waitFor(() => expect(collector.disposed).toBe(true)))
        yield* Effect.promise(async () => { await expect(collector.call(tool.id)).rejects.toThrow("stale") })
      } finally {
        for (const collector of collectors.values()) collector.dispose()
        alpha.close()
        beta.close()
        extension.close()
      }
    })))
  })
})

async function connectExtension(url: string) {
  const socket = new WebSocket(`${url.replace(/^http/, "ws")}/extension`, { origin: "chrome-extension://browserrig-test" })
  const commands: ExtensionCommand[] = []
  let nextTab = 0
  socket.on("message", (data) => {
    const command = parseExtensionCommand(data.toString())
    commands.push(command)
    const tab = command.params?.tabId
    const method = command.params?.method
    let result: JsonObject = {}
    if (command.method === "tabs.create") result = { tabId: ++nextTab }
    if (method === "Target.getTargetInfo") result = { targetInfo: { targetId: `target-${tab}`, type: "page", title: "test", url: "about:blank", attached: true, canAccessOpener: false } }
    if (method === "WebMCP.invokeTool") result = { invocationId: `invoke-${tab}` }
    socket.send(JSON.stringify({ id: command.id, result }))
    if (method === "WebMCP.enable") socket.send(JSON.stringify({ method: "debugger.event", params: {
      tabId: tab, method: "WebMCP.toolsAdded", params: { tools: [{ name: `tool-target-${tab}`, frameId: `frame-${tab}`, inputSchema: { type: "object" } }] },
    } }))
    if (method === "WebMCP.invokeTool") socket.send(JSON.stringify({ method: "debugger.event", params: {
      tabId: tab, method: "WebMCP.toolResponded", params: { invocationId: `invoke-${tab}`, status: "Completed", output: `tab-${tab}` },
    } }))
  })
  await opened(socket)
  socket.send(JSON.stringify({ method: "hello", params: { version: "test", protocolVersion: 3 } }))
  socket.send(JSON.stringify({ method: "ready" }))
  return Object.assign(socket, { commands })
}

async function connectClient(url: string, id: string): Promise<WebSocket> {
  const socket = new WebSocket(`${url.replace(/^http/, "ws")}/devtools/browser/test?browserRigSessionId=${id}`)
  await opened(socket)
  return socket
}

function opened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject) })
}

let nextCommand = 0
function command(socket: WebSocket, method: string, params: JsonObject): Promise<unknown> {
  const id = ++nextCommand
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", onMessage); reject(new Error(`Timed out: ${method}`)) }, 2_000)
    const onMessage = (data: import("ws").RawData) => {
      const response = JSON.parse(data.toString())
      if (response.id !== id) return
      clearTimeout(timer)
      socket.off("message", onMessage)
      if (response.error) reject(new Error(response.error.message))
      else resolve(response.result)
    }
    socket.on("message", onMessage)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => { socket.once("close", resolve); socket.close() })
}
