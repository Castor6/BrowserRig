import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const storeVersion = 1
const lockRetryMs = 25
const lockTimeoutMs = 5_000
const staleLockMs = 30_000
const sessionIdPattern = /^[a-z0-9][a-z0-9-]{0,62}$/
const mappingKeyPattern = /^[a-f0-9]{64}$/

interface SessionMapping {
  readonly sessionId: string
  readonly updatedAt: string
}

interface SessionMapFile {
  readonly version: typeof storeVersion
  readonly mappings: Readonly<Record<string, SessionMapping>>
}

export function defaultDshSessionMapPath(home = os.homedir()): string {
  return path.join(home, ".browserrig", "dsh", "sessions.json")
}

export function dshSessionMappingKey(endpoint: string, dshSessionId: string): string {
  return crypto.createHash("sha256").update(endpoint).update("\0").update(dshSessionId).digest("hex")
}

/**
 * Durable DSH-session to BrowserRig-session mapping.
 *
 * DSH session ids are hashed before storage keys are written so arbitrary ids
 * cannot become object keys or filenames. Updates take a short cross-process
 * lock and publish through an atomic same-directory rename.
 */
export class DshSessionMap {
  constructor(readonly filePath = defaultDshSessionMapPath()) {}

  async get(key: string, signal?: AbortSignal): Promise<string | undefined> {
    signal?.throwIfAborted()
    assertMappingKey(key)
    return (await this.load()).mappings[key]?.sessionId
  }

  async set(key: string, sessionId: string, signal?: AbortSignal): Promise<void> {
    assertMappingKey(key)
    assertSessionId(sessionId)
    await this.withLock(signal, async () => {
      const current = await this.load()
      await this.save({
        version: storeVersion,
        mappings: {
          ...current.mappings,
          [key]: { sessionId, updatedAt: new Date().toISOString() },
        },
      })
    })
  }

  async delete(key: string, signal?: AbortSignal): Promise<void> {
    assertMappingKey(key)
    await this.withLock(signal, async () => {
      const current = await this.load()
      if (current.mappings[key] === undefined) return
      const mappings = { ...current.mappings }
      delete mappings[key]
      await this.save({ version: storeVersion, mappings })
    })
  }

  private async load(): Promise<SessionMapFile> {
    let text: string
    try {
      text = await fs.readFile(this.filePath, "utf8")
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return { version: storeVersion, mappings: {} }
      }
      throw new Error(`Could not read the BrowserRig DSH session map at ${this.filePath}`, { cause: error })
    }

    try {
      const parsed = JSON.parse(text) as unknown
      if (!isRecord(parsed) || parsed.version !== storeVersion || !isRecord(parsed.mappings)) {
        throw new Error(`expected { version: ${storeVersion}, mappings: object }`)
      }
      const mappings: Record<string, SessionMapping> = {}
      for (const [key, value] of Object.entries(parsed.mappings)) {
        assertMappingKey(key)
        if (!isRecord(value) || typeof value.sessionId !== "string" || typeof value.updatedAt !== "string") {
          throw new Error(`invalid mapping ${key}`)
        }
        assertSessionId(value.sessionId)
        if (Number.isNaN(Date.parse(value.updatedAt))) {
          throw new Error(`invalid updatedAt for mapping ${key}`)
        }
        mappings[key] = { sessionId: value.sessionId, updatedAt: value.updatedAt }
      }
      return { version: storeVersion, mappings }
    } catch (error) {
      const detail = error instanceof Error && error.message ? `: ${error.message}` : ""
      throw new Error(`Could not decode the BrowserRig DSH session map at ${this.filePath}${detail}`, { cause: error })
    }
  }

  private async save(store: SessionMapFile): Promise<void> {
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
    const contents = `${JSON.stringify(store, null, 2)}\n`
    let temporaryFile: fs.FileHandle | undefined
    let renamed = false
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      await fs.chmod(directory, 0o700)
      temporaryFile = await fs.open(temporaryPath, "wx", 0o600)
      await temporaryFile.writeFile(contents, "utf8")
      await temporaryFile.sync()
      await temporaryFile.close()
      temporaryFile = undefined
      await fs.rename(temporaryPath, this.filePath)
      renamed = true
      const directoryHandle = await fs.open(directory, "r")
      try {
        await directoryHandle.sync()
      } finally {
        await directoryHandle.close()
      }
    } catch (error) {
      if (renamed) {
        try {
          if (await fs.readFile(this.filePath, "utf8") === contents) return
        } catch {}
      }
      try {
        await temporaryFile?.close()
        await fs.rm(temporaryPath, { force: true })
      } catch {}
      throw new Error(`Could not write the BrowserRig DSH session map at ${this.filePath}`, { cause: error })
    }
  }

  private async withLock<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
    const lockPath = `${this.filePath}.lock`
    const directory = path.dirname(lockPath)
    const token = `${process.pid}:${crypto.randomUUID()}`
    const deadline = Date.now() + lockTimeoutMs
    let handle: fs.FileHandle | undefined

    await fs.mkdir(directory, { recursive: true, mode: 0o700 })
    await fs.chmod(directory, 0o700)
    for (;;) {
      signal?.throwIfAborted()
      try {
        handle = await fs.open(lockPath, "wx", 0o600)
        await handle.writeFile(`${token}\n`, "utf8")
        await handle.sync()
        break
      } catch (error) {
        await handle?.close().catch(() => {})
        handle = undefined
        if (!isNodeError(error) || error.code !== "EEXIST") {
          throw new Error(`Could not lock the BrowserRig DSH session map at ${this.filePath}`, { cause: error })
        }
        const stat = await fs.stat(lockPath).catch(() => undefined)
        if (stat && Date.now() - stat.mtimeMs > staleLockMs) {
          await fs.unlink(lockPath).catch(() => {})
          continue
        }
        if (Date.now() >= deadline) {
          throw new Error(`Timed out waiting for the BrowserRig DSH session map lock at ${this.filePath}`)
        }
        await abortableDelay(lockRetryMs, signal)
      }
    }

    try {
      return await operation()
    } finally {
      await handle.close().catch(() => {})
      try {
        if ((await fs.readFile(lockPath, "utf8")).trim() === token) {
          await fs.unlink(lockPath)
        }
      } catch {}
    }
  }
}

function assertMappingKey(key: string): void {
  if (!mappingKeyPattern.test(key)) throw new Error("Invalid BrowserRig DSH session mapping key")
}

function assertSessionId(sessionId: string): void {
  if (!sessionIdPattern.test(sessionId)) throw new Error(`Invalid BrowserRig session id: ${sessionId}`)
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, milliseconds)
    function done(): void {
      signal?.removeEventListener("abort", aborted)
      resolve()
    }
    function aborted(): void {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener("abort", aborted, { once: true })
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
