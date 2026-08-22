import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  defaultDshSessionMapPath,
  DshSessionMap,
  dshSessionMappingKey,
} from "../src/dsh-session-map.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function temporaryMap(): Promise<{ readonly directory: string; readonly filePath: string; readonly map: DshSessionMap }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "browserrig-dsh-map-"))
  temporaryDirectories.push(directory)
  const filePath = path.join(directory, "nested", "sessions.json")
  return { directory, filePath, map: new DshSessionMap(filePath) }
}

describe("DSH session map", () => {
  it("derives opaque endpoint-scoped mapping keys", () => {
    const first = dshSessionMappingKey("http://127.0.0.1:19990", "agent-a")
    const otherAgent = dshSessionMappingKey("http://127.0.0.1:19990", "agent-b")
    const otherEndpoint = dshSessionMappingKey("http://127.0.0.1:29990", "agent-a")

    expect(first).toMatch(/^[a-f0-9]{64}$/)
    expect(new Set([first, otherAgent, otherEndpoint])).toHaveLength(3)
    expect(defaultDshSessionMapPath("/tmp/example-home")).toBe("/tmp/example-home/.browserrig/dsh/sessions.json")
  })

  it("round-trips mappings with restrictive filesystem permissions", async () => {
    const { filePath, map } = await temporaryMap()
    const key = dshSessionMappingKey("endpoint", "agent")

    expect(await map.get(key)).toBeUndefined()
    await map.set(key, "cosmic-otter-866")
    expect(await new DshSessionMap(filePath).get(key)).toBe("cosmic-otter-866")

    if (process.platform !== "win32") {
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600)
      expect((await fs.stat(path.dirname(filePath))).mode & 0o777).toBe(0o700)
    }

    await map.delete(key)
    expect(await map.get(key)).toBeUndefined()
  })

  it("serializes concurrent writers without losing unrelated mappings", async () => {
    const { filePath } = await temporaryMap()
    const firstKey = dshSessionMappingKey("endpoint", "agent-a")
    const secondKey = dshSessionMappingKey("endpoint", "agent-b")

    await Promise.all([
      new DshSessionMap(filePath).set(firstKey, "first-session"),
      new DshSessionMap(filePath).set(secondKey, "second-session"),
    ])

    const map = new DshSessionMap(filePath)
    expect(await map.get(firstKey)).toBe("first-session")
    expect(await map.get(secondKey)).toBe("second-session")
  })

  it("refuses to overwrite a corrupt map", async () => {
    const { filePath, map } = await temporaryMap()
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, "{ definitely not json\n", { mode: 0o600 })
    const key = dshSessionMappingKey("endpoint", "agent")

    await expect(map.get(key)).rejects.toThrow("Could not decode")
    await expect(map.set(key, "replacement-session")).rejects.toThrow("Could not decode")
    expect(await fs.readFile(filePath, "utf8")).toBe("{ definitely not json\n")
  })
})
