import { describe, expect, it, vi } from "vitest"
import path from "node:path"
import { ConfigProvider, Effect } from "effect"
import { makeToolSpecs, mcpErrorMessage, mcpToolRequiresRelayCompatibility, parseMcpAdoptArguments, sessionDeleteIsIdempotent, toolResultForValue } from "../src/mcp.ts"
import type * as RelayClient from "../src/relay-client.ts"

describe("MCP tool results", () => {
  it("uses default WebMCP discovery without reading a legacy environment switch", async () => {
    const seen: unknown[] = []
    const relay = {
      extensionStatus: Effect.succeed({ connected: true }),
      execute: (request: unknown) => Effect.sync(() => {
        seen.push(request)
        return { session: { id: "current" }, text: "ok", isError: false, logs: [] }
      }),
    } as unknown as RelayClient.Interface
    const execute = makeToolSpecs(relay, { id: "current", established: false }).find((spec) => spec.name === "execute")!
    for (const value of [undefined, true, false, "invalid"]) {
      await Effect.runPromise(execute.handle({ code: "page.url()" }).pipe(Effect.provideService(
        ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(value === undefined ? {} : { BROWSERRIG_EXPERIMENTAL_WEBMCP: value }),
      )))
    }
    expect(seen).toHaveLength(4)
    for (const request of seen) expect(request).not.toHaveProperty("experimentalWebMcp")
  })

  it("keeps discovery in both MCP text and structured output after a script error", () => {
    const webmcp = { status: "available", revision: "one", totalTools: 0, offset: 0, tools: [] }
    const result = toolResultForValue({ text: "script failed", isError: true, webmcp })
    expect(result.structuredContent).toMatchObject({ webmcp })
    expect(result.content[0]).toMatchObject({ text: expect.stringContaining('"webmcp"') })
  })
  it("rechecks relay compatibility for operational tools", () => {
    expect(mcpToolRequiresRelayCompatibility("execute")).toBe(true)
    expect(mcpToolRequiresRelayCompatibility("network_start")).toBe(true)
    expect(mcpToolRequiresRelayCompatibility("secrets_run")).toBe(true)
    expect(mcpToolRequiresRelayCompatibility("status")).toBe(false)
    expect(mcpToolRequiresRelayCompatibility("session_current")).toBe(false)
    expect(mcpToolRequiresRelayCompatibility("issue_report")).toBe(false)
    expect(mcpToolRequiresRelayCompatibility("skill")).toBe(false)
  })

  it("routes ordinary recording controls through the selected session without changing it", async () => {
    const quality = { width: 1280, height: 720, frameRate: 25, screenshotFallback: false }
    const recordingStart = vi.fn(() => Effect.succeed({ success: true, mode: "cdp" }))
    const recordingStop = vi.fn(() => Effect.succeed({ success: true, quality }))
    const recordingStatus = vi.fn(() => Effect.succeed({ isRecording: true, quality }))
    const recordingCancel = vi.fn(() => Effect.succeed({ success: true }))
    const relay = { recordingStart, recordingStop, recordingStatus, recordingCancel } as unknown as RelayClient.Interface
    const current = { id: "mcp-current", established: true }
    const specs = makeToolSpecs(relay, current)
    const tool = (name: string) => specs.find((spec) => spec.name === name)!
    expect(specs.some((spec) => spec.name.startsWith("flight_recorder"))).toBe(false)
    expect(tool("recording_start")).toMatchObject({ readOnly: false, destructive: false, idempotent: false })
    expect(tool("recording_stop")).toMatchObject({ readOnly: false, destructive: false, idempotent: false })
    expect(tool("recording_status")).toMatchObject({ readOnly: true, destructive: false, idempotent: true })
    expect(tool("recording_cancel")).toMatchObject({ readOnly: false, destructive: true, idempotent: true })
    await Effect.runPromise(tool("recording_start").handle({ outputPath: "demo.mp4" }))
    expect(recordingStart).toHaveBeenLastCalledWith({ sessionId: "mcp-current", outputPath: path.resolve("demo.mp4") })
    await Effect.runPromise(tool("recording_start").handle({ session: "explicit", outputPath: "demo.webm", mode: "tab-capture", audio: true, frameRate: 60, maxDurationMs: 1000 }))
    expect(recordingStart).toHaveBeenLastCalledWith({ sessionId: "explicit", outputPath: path.resolve("demo.webm"), mode: "tab-capture", audio: true, frameRate: 60, maxDurationMs: 1000 })
    for (const [name, operation] of [["recording_status", recordingStatus], ["recording_stop", recordingStop], ["recording_cancel", recordingCancel]] as const) {
      await Effect.runPromise(tool(name).handle({}))
      expect(operation).toHaveBeenLastCalledWith({ sessionId: "mcp-current" })
      const result = await Effect.runPromise(tool(name).handle({ session: "explicit" }))
      expect(operation).toHaveBeenLastCalledWith({ sessionId: "explicit" })
      if (name !== "recording_cancel") expect(toolResultForValue(result).structuredContent).toMatchObject({ quality })
    }
    expect(current).toEqual({ id: "mcp-current", established: true })
    expect(mcpToolRequiresRelayCompatibility("recording_status")).toBe(false)
    for (const name of ["recording_start", "recording_stop", "recording_cancel"]) {
      expect(mcpToolRequiresRelayCompatibility(name)).toBe(true)
    }
  })

  it.each([
    {}, { outputPath: "" }, { outputPath: 7 },
    { mode: "invalid" }, { mode: 1 }, { audio: "true" },
    { frameRate: 0 }, { frameRate: 61 }, { frameRate: 1.5 },
    { maxDurationMs: 0 }, { maxDurationMs: "100" }, { session: "" }, { session: 1 },
  ])("rejects malformed recording start arguments: %j", async (invalid) => {
    const recordingStart = vi.fn(() => Effect.succeed({ success: true }))
    const relay = { recordingStart } as unknown as RelayClient.Interface
    const spec = makeToolSpecs(relay, { id: "current", established: false }).find((spec) => spec.name === "recording_start")!
    const args = Object.keys(invalid).length === 0 ? {} : { outputPath: "demo.webm", ...invalid }
    const result = await Effect.runPromise(Effect.result(spec.handle(args)))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.message).not.toBe("An error occurred in Effect.try")
    expect(recordingStart).not.toHaveBeenCalled()
  })

  it("preserves relay recording failures and never creates a missing session", async () => {
    const failure = new Error("No attached tab found for sessionId missing")
    const recordingStart = vi.fn(() => Effect.fail(failure))
    const relay = { recordingStart } as unknown as RelayClient.Interface
    const current = { id: "missing", established: false }
    const spec = makeToolSpecs(relay, current).find((spec) => spec.name === "recording_start")!
    const result = await Effect.runPromise(Effect.result(spec.handle({ outputPath: "demo.mp4" })))
    expect(result).toMatchObject({ _tag: "Failure", failure })
    expect(current).toEqual({ id: "missing", established: false })
  })

  it("accepts active-tab adoption as an exclusive target selector", () => {
    expect(parseMcpAdoptArguments({ active: true, session: "github" })).toEqual({
      active: true,
      session: "github",
    })
    expect(parseMcpAdoptArguments({ targetUrl: "github.com" })).toEqual({ targetUrl: "github.com" })
    expect(() => parseMcpAdoptArguments({})).toThrow("exactly one")
    expect(() => parseMcpAdoptArguments({ active: false })).toThrow("exactly one")
    expect(() => parseMcpAdoptArguments({ active: true, targetIndex: 0 })).toThrow("exactly one")
  })

  it("does not advertise implicit current-session deletion as retry-safe", () => {
    expect(sessionDeleteIsIdempotent).toBe(false)
  })

  it("keeps consecutive implicit session deletions on one stable current target", async () => {
    const deletedIds: string[] = []
    let attempts = 0
    const relay = {
      sessionDelete: (id: string) => Effect.sync(() => {
        deletedIds.push(id)
        attempts += 1
        return { id, deleted: attempts === 1 }
      }),
    } as unknown as RelayClient.Interface
    const currentSession = { id: "mcp-current", established: true }
    const sessionDelete = makeToolSpecs(relay, currentSession).find((spec) => spec.name === "session_delete")
    if (!sessionDelete) throw new Error("session_delete tool missing")
    expect(sessionDelete).toMatchObject({ destructive: true, idempotent: false })

    const first = await Effect.runPromise(sessionDelete.handle({}))
    const second = await Effect.runPromise(sessionDelete.handle({}))

    expect(deletedIds).toEqual(["mcp-current", "mcp-current"])
    expect(first).toEqual({ id: "mcp-current", deleted: true, currentSession: "mcp-current" })
    expect(second).toEqual({ id: "mcp-current", deleted: false, currentSession: "mcp-current" })
    expect(currentSession).toEqual({ id: "mcp-current", established: false })
  })

  it("keeps explicit session deletion scoped away from the MCP current session", async () => {
    const deletedIds: string[] = []
    const relay = {
      sessionDelete: (id: string) => Effect.sync(() => {
        deletedIds.push(id)
        return { id, deleted: false }
      }),
    } as unknown as RelayClient.Interface
    const currentSession = { id: "mcp-current", established: true }
    const sessionDelete = makeToolSpecs(relay, currentSession).find((spec) => spec.name === "session_delete")
    if (!sessionDelete) throw new Error("session_delete tool missing")

    await Effect.runPromise(sessionDelete.handle({ id: "explicit-target" }))
    await Effect.runPromise(sessionDelete.handle({ id: "explicit-target" }))

    expect(deletedIds).toEqual(["explicit-target", "explicit-target"])
    expect(currentSession).toEqual({ id: "mcp-current", established: true })
  })

  it("marks execute script failures as failed MCP tool calls", () => {
    const result = toolResultForValue({
      text: "locator.click: Timeout 30000ms exceeded",
      isError: true,
      logs: [],
      session: { id: "mcp-test" },
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "locator.click: Timeout 30000ms exceeded",
    })
    expect(result.structuredContent).toMatchObject({ isError: true })
  })

  it("omits structured content for primitive tool results", () => {
    const result = toolResultForValue("# BrowserRig\n\nSkill instructions")

    expect(result.isError).toBe(false)
    expect(result.content[0]).toMatchObject({ type: "text", text: "# BrowserRig\n\nSkill instructions" })
    expect(result.structuredContent).toBeUndefined()
  })

  it("adds session recovery guidance at the MCP boundary", () => {
    expect(mcpErrorMessage("execute", "Session not found: stale")).toContain("omit the explicit session id")
    expect(mcpErrorMessage("session_use", "Session not found: stale")).toContain("Create it with session_new first")
    expect(mcpErrorMessage("execute", "Extension disconnected")).toBe("Extension disconnected")
  })

  it("attaches explicit execute images without duplicating base64 in metadata", () => {
    const result = toolResultForValue({
      text: "Image (image/png, 4 bytes)",
      media: [
        { type: "image", mimeType: "image/png", data: Buffer.from([1, 2]).toString("base64"), size: 2 },
        { type: "image", mimeType: "image/png", data: Buffer.from([3, 4]).toString("base64"), size: 2 },
      ],
      isError: false,
      logs: [],
      session: { id: "mcp-test" },
    })

    expect(result.content).toHaveLength(3)
    expect(result.content[0]).toMatchObject({ type: "text" })
    expect(result.content[1]).toMatchObject({ type: "image", mimeType: "image/png" })
    expect(Array.from(result.content[1]?.type === "image" ? result.content[1].data : [])).toEqual([1, 2])
    expect(Array.from(result.content[2]?.type === "image" ? result.content[2].data : [])).toEqual([3, 4])
    expect(result.structuredContent).not.toHaveProperty("media")
  })
})
