import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { makeToolSpecs, mcpErrorMessage, mcpToolRequiresRelayCompatibility, parseMcpAdoptArguments, sessionDeleteIsIdempotent, toolResultForValue } from "../src/mcp.ts"
import type * as RelayClient from "../src/relay-client.ts"

describe("MCP tool results", () => {
  it("rechecks relay compatibility for operational tools", () => {
    expect(mcpToolRequiresRelayCompatibility("execute")).toBe(true)
    expect(mcpToolRequiresRelayCompatibility("network_start")).toBe(true)
    expect(mcpToolRequiresRelayCompatibility("secrets_run")).toBe(true)
    expect(mcpToolRequiresRelayCompatibility("status")).toBe(false)
    expect(mcpToolRequiresRelayCompatibility("session_current")).toBe(false)
    expect(mcpToolRequiresRelayCompatibility("issue_report")).toBe(false)
    expect(mcpToolRequiresRelayCompatibility("skill")).toBe(false)
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
