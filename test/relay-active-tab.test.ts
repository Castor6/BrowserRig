import net from "node:net"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { WebSocket } from "ws"
import { extensionProtocolVersion, type JsonObject } from "../src/protocol.ts"
import { startRelay } from "../src/relay.ts"

type ExtensionCommand = {
  readonly id: number
  readonly method: string
  readonly params?: { readonly tabId?: number; readonly method?: string }
}

describe("relay active-tab attachment", () => {
  it("rejects a missing explicit session without attaching, then safely reuses an active tab", async () => {
    const port = await freePort()
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const relay = yield* startRelay({ port, sessionCatalogPath: null })
      const extension = yield* Effect.promise(() => connectFakeExtension(relay.url))
      yield* Effect.promise(() => waitForExtensionConnected(relay.url))

      try {
        const missingResponse = yield* Effect.promise(() => adoptActiveTab(relay.url, "ghost"))
        expect(missingResponse.status).toBe(404)
        expect(yield* Effect.promise(() => missingResponse.json())).toMatchObject({
          error: "Session not found: ghost",
          code: "session-not-found",
        })

        expect(extension.commands.filter((command) => command.method === "tabs.attachActive")).toHaveLength(0)
        expect(extension.commands.some((command) => command.method === "debugger.attach")).toBe(false)
        expect(debuggerMethodCount(extension.commands, "Page.enable")).toBe(0)
        expect(debuggerMethodCount(extension.commands, "Target.getTargetInfo")).toBe(0)

        const targetsAfterMissingAdopt = yield* Effect.promise(async () => {
          const response = await fetch(new URL("/json/list", relay.url))
          return await response.json() as Array<{ readonly id: string; readonly url: string }>
        })
        expect(targetsAfterMissingAdopt).toEqual([])

        const createResponse = yield* Effect.promise(() => fetch(new URL("/cli/session/new", relay.url), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: "alpha" }),
        }))
        expect(createResponse.status).toBe(200)
        expect(yield* Effect.promise(() => createResponse.json())).toMatchObject({ session: { id: "alpha" } })

        const firstResponse = yield* Effect.promise(() => adoptActiveTab(relay.url, "alpha"))
        expect(firstResponse.status).toBe(200)
        expect(yield* Effect.promise(() => firstResponse.json())).toMatchObject({
          adoptedTargetId: "target-7",
          session: { id: "alpha" },
        })
        expect(extension.commands.filter((command) => command.method === "tabs.attachActive")).toHaveLength(1)
        const pageEnableCountAfterFirstAdopt = debuggerMethodCount(extension.commands, "Page.enable")
        const targetInfoCountAfterFirstAdopt = debuggerMethodCount(extension.commands, "Target.getTargetInfo")
        expect(pageEnableCountAfterFirstAdopt).toBeGreaterThan(0)
        expect(targetInfoCountAfterFirstAdopt).toBeGreaterThan(0)

        const targetsAfterFirstAdopt = yield* Effect.promise(async () => {
          const response = await fetch(new URL("/json/list", relay.url))
          return await response.json() as Array<{
            readonly id: string
            readonly url: string
            readonly browserRigSessionId?: string
            readonly owner: string
          }>
        })
        expect(targetsAfterFirstAdopt).toContainEqual(expect.objectContaining({
          id: "target-7",
          url: "https://active.example/",
          browserRigSessionId: "alpha",
          owner: "user",
        }))

        const initializedCommandCount = extension.commands.length
        const secondResponse = yield* Effect.promise(() => adoptActiveTab(relay.url, "alpha"))
        expect(secondResponse.status).toBe(200)
        expect(yield* Effect.promise(() => secondResponse.json())).toMatchObject({
          adoptedTargetId: "target-7",
          session: { id: "alpha" },
        })
        expect(extension.commands.filter((command) => command.method === "tabs.attachActive")).toHaveLength(2)
        const repeatedDebuggerMethods = extension.commands.slice(initializedCommandCount)
          .filter((command) => command.method === "debugger.sendCommand")
          .map((command) => command.params?.method)
        expect(repeatedDebuggerMethods).toContain("Target.getTargetInfo")
        expect(repeatedDebuggerMethods).not.toContain("Page.enable")
        expect(debuggerMethodCount(extension.commands, "Page.enable")).toBe(pageEnableCountAfterFirstAdopt)
        expect(debuggerMethodCount(extension.commands, "Target.getTargetInfo")).toBe(targetInfoCountAfterFirstAdopt + 1)
      } finally {
        extension.close()
      }
    })))
  })
})

function connectFakeExtension(relayUrl: string): Promise<WebSocket & { readonly commands: ExtensionCommand[] }> {
  return new Promise((resolve, reject) => {
    const commands: ExtensionCommand[] = []
    const socket = new WebSocket(`${relayUrl.replace(/^http/, "ws")}/extension`, {
      origin: "chrome-extension://browserrig-test",
    })
    socket.once("error", reject)
    socket.on("message", (data) => {
      const command = JSON.parse(data.toString()) as ExtensionCommand
      commands.push(command)
      let result: JsonObject = {}
      if (command.method === "tabs.attachActive") {
        result = { tabId: 7 }
      } else if (command.method === "debugger.sendCommand" && command.params?.method === "Target.getTargetInfo") {
        result = {
          targetInfo: {
            targetId: "target-7",
            type: "page",
            title: "Active tab",
            url: "https://active.example/",
            attached: true,
            canAccessOpener: false,
            browserContextId: "default",
          },
        }
      }
      socket.send(JSON.stringify({ id: command.id, result }))
    })
    socket.once("open", () => {
      socket.send(JSON.stringify({
        method: "hello",
        params: { version: "test", protocolVersion: extensionProtocolVersion },
      }))
      socket.send(JSON.stringify({ method: "ready" }))
      resolve(Object.assign(socket, { commands }))
    })
  })
}

function adoptActiveTab(relayUrl: string, sessionId: string): Promise<Response> {
  return fetch(new URL("/cli/session/adopt", relayUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, createIfMissing: false, active: true }),
  })
}

function debuggerMethodCount(commands: readonly ExtensionCommand[], method: string): number {
  return commands.filter((command) => {
    return command.method === "debugger.sendCommand" && command.params?.method === method
  }).length
}

async function waitForExtensionConnected(relayUrl: string): Promise<void> {
  const deadline = Date.now() + 2_000
  while (true) {
    const status = await fetch(new URL("/extension/status", relayUrl)).then((response) => response.json()) as {
      readonly connected?: boolean
    }
    if (status.connected === true) return
    if (Date.now() >= deadline) throw new Error("Timed out waiting for the fake extension to become ready")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function freePort(): Promise<number> {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Expected TCP address")
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}
