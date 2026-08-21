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

type FakeExtension = WebSocket & { readonly commands: ExtensionCommand[] }

describe("relay active-tab extension generation", () => {
  it.each([
    ["Page.enable", (command: ExtensionCommand) => debuggerMethod(command) === "Page.enable"],
    ["Target.getTargetInfo", (command: ExtensionCommand) => debuggerMethod(command) === "Target.getTargetInfo"],
    ["tabs.ungroup", (command: ExtensionCommand) => command.method === "tabs.ungroup"],
  ] as const)("fails closed when the extension is replaced during %s", async (_phase, shouldReplace) => {
    const port = await freePort()
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const relay = yield* startRelay({ port, sessionCatalogPath: null })
      let replacementPromise: Promise<FakeExtension> | undefined
      const original = yield* Effect.promise(() => connectFakeExtension(relay.url, {
        beforeResponse: (command) => {
          if (replacementPromise || !shouldReplace(command)) return true
          replacementPromise = connectFakeExtension(relay.url)
          return false
        },
      }))
      yield* Effect.promise(() => waitForExtensionConnected(relay.url))

      try {
        yield* Effect.promise(() => createSession(relay.url, "alpha"))
        const response = yield* Effect.promise(() => adoptActiveTab(relay.url, "alpha"))
        expect(response.status).toBe(500)
        expect(yield* Effect.promise(() => response.json())).toMatchObject({
          error: expect.stringMatching(/Extension (?:changed|replaced)/),
        })

        expect(replacementPromise).toBeDefined()
        const replacement = yield* Effect.promise(() => replacementPromise!)
        yield* Effect.promise(() => waitForSocketClosed(original))
        yield* Effect.promise(() => waitForExtensionConnected(relay.url))
        expect(replacement.commands.some((command) => command.params?.tabId === 7)).toBe(false)

        const targets = yield* Effect.promise(async () => {
          const listResponse = await fetch(new URL("/json/list", relay.url))
          return await listResponse.json() as Array<{ readonly id: string }>
        })
        expect(targets.some((target) => target.id === "target-7")).toBe(false)
      } finally {
        original.close()
        if (replacementPromise) {
          const replacement = yield* Effect.promise(() => replacementPromise!)
          replacement.close()
        }
      }
    })))
  })
})

function connectFakeExtension(relayUrl: string, options: {
  readonly beforeResponse?: (command: ExtensionCommand) => boolean
} = {}): Promise<FakeExtension> {
  return new Promise((resolve, reject) => {
    const commands: ExtensionCommand[] = []
    const socket = new WebSocket(`${relayUrl.replace(/^http/, "ws")}/extension`, {
      origin: "chrome-extension://browserrig-test",
    })
    socket.once("error", reject)
    socket.on("message", (data) => {
      const command = JSON.parse(data.toString()) as ExtensionCommand
      commands.push(command)
      if (options.beforeResponse?.(command) === false) return
      let result: JsonObject = {}
      if (command.method === "tabs.attachActive") {
        result = { tabId: 7 }
      } else if (debuggerMethod(command) === "Target.getTargetInfo") {
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

function debuggerMethod(command: ExtensionCommand): string | undefined {
  return command.method === "debugger.sendCommand" ? command.params?.method : undefined
}

async function createSession(relayUrl: string, id: string): Promise<void> {
  const response = await fetch(new URL("/cli/session/new", relayUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) throw new Error(`Failed to create test session: ${await response.text()}`)
}

function adoptActiveTab(relayUrl: string, sessionId: string): Promise<Response> {
  return fetch(new URL("/cli/session/adopt", relayUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, createIfMissing: false, active: true }),
  })
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

async function waitForSocketClosed(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return
  await new Promise<void>((resolve) => socket.once("close", () => resolve()))
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
