import { execFile } from "node:child_process"
import { once } from "node:events"
import http from "node:http"
import net from "node:net"
import { promisify } from "node:util"
import { describe, expect, it, vi } from "vitest"
import { closeSmokeFixtureServer } from "../scripts/smoke-fixture-server.ts"

const execFilePromise = promisify(execFile)

describe("smoke fixture server cleanup", () => {
  it("allows an active request to finish during graceful close", async () => {
    let requestStarted!: () => void
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve
    })
    const server = http.createServer((_request, response) => {
      requestStarted()
      setTimeout(() => response.end("done"), 20)
    })
    const closeAllConnections = vi.spyOn(server, "closeAllConnections")
    await listen(server)

    const response = get(server)
    await started
    await closeSmokeFixtureServer(server, { gracefulTimeoutMs: 250 })

    await expect(response).resolves.toBe("done")
    expect(closeAllConnections).not.toHaveBeenCalled()
    expect(server.listening).toBe(false)
    await expect(connectionCount(server)).resolves.toBe(0)
  })

  it("forces only the fixture server connections closed after the grace period", async () => {
    const server = http.createServer(() => undefined)
    const close = vi.spyOn(server, "close")
    await listen(server)
    const socket = net.connect(addressPort(server), "127.0.0.1")
    socket.on("error", () => undefined)
    await once(socket, "connect")
    socket.write("GET / HTTP/1.1\r\nHost: fixture\r\nConnection: keep-alive\r\n\r\n")
    await once(server, "request")
    const socketClosed = once(socket, "close")

    const firstClose = closeSmokeFixtureServer(server, { gracefulTimeoutMs: 10, forcedTimeoutMs: 500 })
    const concurrentClose = closeSmokeFixtureServer(server, { gracefulTimeoutMs: 10, forcedTimeoutMs: 500 })
    expect(concurrentClose).toBe(firstClose)
    await firstClose
    await socketClosed

    expect(server.listening).toBe(false)
    await expect(connectionCount(server)).resolves.toBe(0)
    const repeatedClose = closeSmokeFixtureServer(server)
    expect(repeatedClose).toBe(firstClose)
    await expect(repeatedClose).resolves.toBeUndefined()
    expect(close).toHaveBeenCalledOnce()
  })

  it("lets a wrapper process exit naturally after cleaning an active fixture connection", async () => {
    const helperUrl = new URL("../scripts/smoke-fixture-server.ts", import.meta.url).href
    const script = `
      import { once } from "node:events"
      import http from "node:http"
      import net from "node:net"
      import { closeSmokeFixtureServer } from ${JSON.stringify(helperUrl)}

      const server = http.createServer(() => undefined)
      await new Promise((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("missing fixture port")
      const socket = net.connect(address.port, "127.0.0.1")
      socket.on("error", () => undefined)
      await once(socket, "connect")
      socket.write("GET / HTTP/1.1\\r\\nHost: fixture\\r\\nConnection: keep-alive\\r\\n\\r\\n")
      await once(server, "request")
      await closeSmokeFixtureServer(server, { gracefulTimeoutMs: 10, forcedTimeoutMs: 500 })
      console.log(JSON.stringify({ listening: server.listening }))
    `

    const result = await execFilePromise(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      script,
    ], { timeout: 5_000 })

    expect(result.stderr).toBe("")
    expect(result.stdout.trim()).toBe('{"listening":false}')
  })

  it("rejects invalid cleanup bounds instead of reporting success", async () => {
    const server = http.createServer((_request, response) => response.end())
    await listen(server)

    await expect(closeSmokeFixtureServer(server, { gracefulTimeoutMs: -1 })).rejects.toThrow(
      "gracefulTimeoutMs must be a finite non-negative number",
    )
    expect(server.listening).toBe(true)
    await closeSmokeFixtureServer(server)
  })

  it("reports a connection inventory error and permits a repaired retry", async () => {
    const server = http.createServer((_request, response) => response.end())
    const close = vi.spyOn(server, "close")
    const getConnections = vi.spyOn(server, "getConnections")
    getConnections.mockImplementationOnce((callback) => {
      callback(new Error("fixture connection inventory failed"), 0)
      return server
    })
    await listen(server)

    const failedClose = closeSmokeFixtureServer(server)
    await expect(failedClose).rejects.toThrow("fixture connection inventory failed")
    const retriedClose = closeSmokeFixtureServer(server)
    expect(retriedClose).not.toBe(failedClose)
    await expect(retriedClose).resolves.toBeUndefined()
    expect(closeSmokeFixtureServer(server)).toBe(retriedClose)
    expect(close).toHaveBeenCalledTimes(2)
  })

  it("makes an Effect finalizer cleanup failure exit its wrapper nonzero", async () => {
    const helperUrl = new URL("../scripts/smoke-fixture-server.ts", import.meta.url).href
    const script = `
      import { NodeRuntime } from "@effect/platform-node"
      import { Effect } from "effect"
      import http from "node:http"
      import { closeSmokeFixtureServerEffect } from ${JSON.stringify(helperUrl)}

      const server = http.createServer((_request, response) => response.end())
      await new Promise((resolve, reject) => {
        server.once("error", reject)
        server.listen(0, "127.0.0.1", resolve)
      })
      server.getConnections = (callback) => {
        callback(new Error("fixture finalizer inventory failed"), 0)
        return server
      }
      Effect.scoped(
        Effect.acquireRelease(
          Effect.succeed(server),
          (fixture) => closeSmokeFixtureServerEffect("close failing fixture", fixture),
        ),
      ).pipe(Effect.asVoid, NodeRuntime.runMain)
    `

    const failure = await execFilePromise(process.execPath, [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      script,
    ], { timeout: 5_000 }).then(
      () => undefined,
      (cause: unknown) => cause,
    )

    expect(failure).toBeInstanceOf(Error)
    const details = failure as Error & { readonly code?: unknown }
    expect(details.code).toBe(1)
  })
})

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })
}

function get(server: http.Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: "127.0.0.1",
      port: addressPort(server),
      path: "/",
      agent: false,
    }, (response) => {
      response.setEncoding("utf8")
      let body = ""
      response.on("data", (chunk: string) => {
        body += chunk
      })
      response.on("end", () => resolve(body))
    })
    request.on("error", reject)
  })
}

function addressPort(server: http.Server): number {
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("fixture server did not receive a TCP address")
  }
  return address.port
}

function connectionCount(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.getConnections((error, count) => {
      if (error) {
        reject(error)
        return
      }
      resolve(count)
    })
  })
}
