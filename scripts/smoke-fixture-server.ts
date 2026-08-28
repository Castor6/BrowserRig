import type http from "node:http"

const fixtureClosures = new WeakMap<http.Server, Promise<void>>()

export type SmokeFixtureServerCloseOptions = {
  readonly gracefulTimeoutMs?: number
  readonly forcedTimeoutMs?: number
}

export function closeSmokeFixtureServer(
  server: http.Server,
  options: SmokeFixtureServerCloseOptions = {},
): Promise<void> {
  const existing = fixtureClosures.get(server)
  if (existing) {
    return existing
  }

  const closing = closeAndVerifySmokeFixtureServer(server, options).finally(() => {
    fixtureClosures.delete(server)
  })
  fixtureClosures.set(server, closing)
  return closing
}

async function closeAndVerifySmokeFixtureServer(
  server: http.Server,
  options: SmokeFixtureServerCloseOptions,
): Promise<void> {
  const gracefulTimeoutMs = options.gracefulTimeoutMs ?? 250
  const forcedTimeoutMs = options.forcedTimeoutMs ?? 2_000
  assertTimeout("gracefulTimeoutMs", gracefulTimeoutMs)
  assertTimeout("forcedTimeoutMs", forcedTimeoutMs)

  const closed = requestServerClose(server)
  if (!await settlesWithin(closed, gracefulTimeoutMs)) {
    // These APIs affect only connections accepted by this fixture server. Give
    // completed keep-alive requests a chance to drain before forcing sockets
    // that Chrome retained after the smoke assertions finished.
    server.closeIdleConnections()
    server.closeAllConnections()
    if (!await settlesWithin(closed, forcedTimeoutMs)) {
      throw new Error(`Smoke fixture server close callback did not settle within ${forcedTimeoutMs}ms after forcing connections closed`)
    }
  }

  if (server.listening) {
    throw new Error("Smoke fixture server remained listening after close")
  }

  let connectionCount = await getConnectionCount(server)
  if (connectionCount > 0) {
    server.closeAllConnections()
    const deadline = Date.now() + forcedTimeoutMs
    do {
      await delay(10)
      connectionCount = await getConnectionCount(server)
    } while (connectionCount > 0 && Date.now() < deadline)
  }
  if (connectionCount > 0) {
    throw new Error(`Smoke fixture server retained ${connectionCount} connection(s) after close`)
  }
}

function requestServerClose(server: http.Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      server.close((error) => {
        if (error && !isServerNotRunning(error)) {
          reject(error)
          return
        }
        resolve()
      })
    } catch (cause) {
      if (isServerNotRunning(cause)) {
        resolve()
        return
      }
      reject(cause)
    }
  })
}

function getConnectionCount(server: http.Server): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.getConnections((error, count) => {
      if (error) {
        reject(error)
        return
      }
      resolve(count)
    })
  })
}

function settlesWithin(promise: Promise<void>, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs)
    promise.then(
      () => {
        clearTimeout(timeout)
        resolve(true)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs))
}

function assertTimeout(label: string, timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error(`${label} must be a finite non-negative number`)
  }
}

function isServerNotRunning(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ERR_SERVER_NOT_RUNNING"
}
