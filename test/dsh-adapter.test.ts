import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { AttachmentStore, ImageAttachmentRef, SaveImageAttachment } from "@deepseek-ai/dsh-attachment"
import type { JsonValue, ToolRunContext } from "@deepseek-ai/dsh-tools"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  BrowserRigDshAdapter,
  type BrowserRigCliRunner,
  type BrowserRigProcessResult,
  createBrowserRigDshTools,
  PackageBrowserRigCliRunner,
} from "../src/dsh-adapter.ts"
import { DshSessionMap, dshSessionMappingKey } from "../src/dsh-session-map.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

class QueueRunner implements BrowserRigCliRunner {
  readonly calls: Array<{ readonly args: readonly string[]; readonly cwd: string; readonly signal: AbortSignal }> = []

  constructor(
    readonly responses: BrowserRigProcessResult[],
    readonly endpoint = "http://127.0.0.1:19990",
  ) {}

  endpointKey(): string {
    return this.endpoint
  }

  async run(
    args: readonly string[],
    options: { readonly cwd: string; readonly signal: AbortSignal },
  ): Promise<BrowserRigProcessResult> {
    this.calls.push({ args: [...args], cwd: options.cwd, signal: options.signal })
    options.signal.throwIfAborted()
    const response = this.responses.shift()
    if (response === undefined) throw new Error(`Unexpected BrowserRig command: ${args.join(" ")}`)
    return response
  }
}

async function fixture(responses: BrowserRigProcessResult[]): Promise<{
  readonly adapter: BrowserRigDshAdapter
  readonly runner: QueueRunner
  readonly map: DshSessionMap
  readonly pluginAbort: AbortController
  readonly cwd: string
}> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "browserrig-dsh-adapter-"))
  temporaryDirectories.push(cwd)
  const runner = new QueueRunner(responses)
  const map = new DshSessionMap(path.join(cwd, "sessions.json"))
  const pluginAbort = new AbortController()
  return {
    adapter: new BrowserRigDshAdapter(runner, map, pluginAbort.signal),
    runner,
    map,
    pluginAbort,
    cwd,
  }
}

function execContext(agentId: string, cwd: string, signal = new AbortController().signal): ToolRunContext {
  return {
    agent: { id: agentId, session: { header: { cwd } } },
    signal,
  } as unknown as ToolRunContext
}

function processResult(value: unknown, exitCode = 0, stderr = ""): BrowserRigProcessResult {
  return {
    exitCode,
    signal: null,
    stdout: JSON.stringify(value),
    stderr,
    stdoutTruncated: false,
    stderrTruncated: false,
  }
}

function session(id: string, pageUrl = "https://example.com/"): Record<string, JsonValue> {
  return {
    id,
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:01.000Z",
    connected: true,
    pageUrl,
    stateKeys: [],
  }
}

function executeSuccess(id: string, value: JsonValue, overrides: Record<string, JsonValue> = {}): BrowserRigProcessResult {
  return processResult({
    ok: true,
    isError: false,
    text: JSON.stringify(value),
    value,
    valueUnavailable: false,
    logs: [],
    warnings: [],
    session: session(id),
    ...overrides,
  })
}

function missingSession(command: "execute" | "reset" = "execute"): BrowserRigProcessResult {
  const error = {
    _tag: "RelayRejected",
    message: "Session not found: stale-session",
    code: "session-not-found",
    status: 404,
  }
  if (command === "reset") return processResult({ ok: false, error }, 1)
  return processResult({
    ok: false,
    isError: true,
    text: error.message,
    value: null,
    valueUnavailable: false,
    error,
    logs: [],
    warnings: [],
  }, 1)
}

function resetFailure(code: string, message: string): BrowserRigProcessResult {
  return processResult({
    ok: false,
    error: {
      _tag: "RelayRejected",
      message,
      code,
      status: 409,
    },
  }, 1)
}

function scriptFailure(id: string, message: string): BrowserRigProcessResult {
  return processResult({
    ok: false,
    isError: true,
    text: message,
    value: null,
    valueUnavailable: true,
    error: { _tag: "ScriptError", message },
    logs: [],
    warnings: [],
    session: session(id),
  }, 1)
}

describe("BrowserRig DSH adapter", () => {
  it("binds each DSH agent to an isolated persistent BrowserRig session", async () => {
    const { adapter, runner, map, cwd } = await fixture([
      executeSuccess("alpha-session", { turn: 1 }),
      executeSuccess("beta-session", { turn: 1 }),
      executeSuccess("alpha-session", { turn: 2 }),
    ])

    const alpha = execContext("dsh-alpha", cwd)
    const beta = execContext("dsh-beta", cwd)
    const first = await adapter.execute(alpha, "return { turn: 1 }")
    await adapter.execute(beta, "return { turn: 1 }")
    const continued = await adapter.execute(alpha, "return { turn: 2 }")

    expect(runner.calls.map(call => call.args)).toEqual([
      ["execute", "--json", "return { turn: 1 }"],
      ["execute", "--json", "return { turn: 1 }"],
      ["execute", "--json", "--session", "alpha-session", "return { turn: 2 }"],
    ])
    expect(await map.get(dshSessionMappingKey(runner.endpointKey(), "dsh-alpha"))).toBe("alpha-session")
    expect(await map.get(dshSessionMappingKey(runner.endpointKey(), "dsh-beta"))).toBe("beta-session")
    expect(JSON.stringify([first, continued])).not.toContain("alpha-session")
  })

  it("replaces one stale mapping and retries the execute exactly once", async () => {
    const { adapter, runner, map, cwd } = await fixture([
      missingSession(),
      executeSuccess("fresh-session", { recovered: true }),
    ])
    const key = dshSessionMappingKey(runner.endpointKey(), "dsh-agent")
    await map.set(key, "stale-session")

    const result = await adapter.execute(execContext("dsh-agent", cwd), "return { recovered: true }")

    expect(runner.calls.map(call => call.args)).toEqual([
      ["execute", "--json", "--session", "stale-session", "return { recovered: true }"],
      ["execute", "--json", "return { recovered: true }"],
    ])
    expect(await map.get(key)).toBe("fresh-session")
    expect(result.value).toEqual({ recovered: true })
    expect(JSON.stringify(result)).not.toMatch(/stale-session|fresh-session/)
  })

  it("retains a newly created session when the first browser script fails", async () => {
    const { adapter, runner, map, cwd } = await fixture([
      scriptFailure("recoverable-session", "locator failed"),
      executeSuccess("recoverable-session", { recovered: true }),
    ])
    const exec = execContext("dsh-agent", cwd)
    const key = dshSessionMappingKey(runner.endpointKey(), "dsh-agent")

    await expect(adapter.execute(exec, "throw new Error('locator failed')")).rejects.toThrow("locator failed")
    expect(await map.get(key)).toBe("recoverable-session")

    await expect(adapter.execute(exec, "return { recovered: true }")).resolves.toMatchObject({
      value: { recovered: true },
    })
    expect(runner.calls.map(call => call.args)).toEqual([
      ["execute", "--json", "throw new Error('locator failed')"],
      ["execute", "--json", "--session", "recoverable-session", "return { recovered: true }"],
    ])
  })

  it("keeps flag-like JavaScript in the CLI positional code argument", async () => {
    const { adapter, runner, cwd } = await fixture([executeSuccess("negative-session", -1)])

    await expect(adapter.execute(execContext("dsh-agent", cwd), "-1")).resolves.toMatchObject({ value: -1 })
    expect(runner.calls[0]?.args).toEqual(["execute", "--json", " -1"])
  })

  it("creates and remembers a session directly through active-tab adoption", async () => {
    const { adapter, runner, map, cwd } = await fixture([
      processResult({ ok: true, adoptedUrl: "https://signed-in.example/", session: session("adopted-session") }),
      processResult({ ok: true, adoptedUrl: "https://signed-in.example/", session: session("adopted-session") }),
    ])
    const exec = execContext("dsh-agent", cwd)

    expect(await adapter.adoptActive(exec)).toEqual({ adoptedUrl: "https://signed-in.example/" })
    expect(await adapter.adoptActive(exec)).toEqual({ adoptedUrl: "https://signed-in.example/" })

    expect(runner.calls.map(call => call.args)).toEqual([
      ["session", "adopt", "--json", "--active"],
      ["session", "adopt", "--json", "--session", "adopted-session", "--active"],
    ])
    expect(await map.get(dshSessionMappingKey(runner.endpointKey(), "dsh-agent"))).toBe("adopted-session")
  })

  it("clears a stale mapping during reset without creating a surprise tab", async () => {
    const { adapter, runner, map, cwd } = await fixture([missingSession("reset")])
    const key = dshSessionMappingKey(runner.endpointKey(), "dsh-agent")
    await map.set(key, "stale-session")

    expect(await adapter.reset(execContext("dsh-agent", cwd))).toEqual({
      reset: false,
      recreated: false,
      mappingCleared: true,
      reason: "stale-session",
    })
    expect(await map.get(key)).toBeUndefined()
    expect(runner.calls.map(call => call.args)).toEqual([
      ["session", "reset", "--json", "--session", "stale-session"],
    ])
  })

  it("preserves a DSH mapping when reset fails for anything except stable session-not-found", async () => {
    const { adapter, runner, map, cwd } = await fixture([
      resetFailure("session-busy", "Session stale-session still has an active worker"),
    ])
    const key = dshSessionMappingKey(runner.endpointKey(), "dsh-agent")
    await map.set(key, "stale-session")

    await expect(adapter.reset(execContext("dsh-agent", cwd))).rejects.toThrow(
      "Session <session> still has an active worker",
    )
    expect(await map.get(key)).toBe("stale-session")
  })

  it("projects status to this DSH session and hides all BrowserRig ids and global targets", async () => {
    const { adapter, runner, map, cwd } = await fixture([
      processResult({
        endpoint: runnerEndpoint,
        relay: { running: true, version: "0.1.0", buildId: "build", stale: false },
        extension: { connected: true, version: "0.1.0", protocolVersion: 3, internal: "omit-me" },
        currentSession: "other-session",
        sessions: [session("own-session"), session("other-session", "https://private.example/")],
        targets: [{ targetId: "secret-target", url: "https://private.example/" }],
      }),
    ])
    const key = dshSessionMappingKey(runner.endpointKey(), "dsh-agent")
    await map.set(key, "own-session")

    const status = await adapter.status(execContext("dsh-agent", cwd))
    const rendered = JSON.stringify(status)

    expect(status).toMatchObject({
      ready: true,
      endpoint: runnerEndpoint,
      extension: { connected: true, version: "0.1.0", protocolVersion: 3 },
      session: { connected: true, pageUrl: "https://example.com/", stateKeys: [] },
      mappingStale: false,
    })
    expect(rendered).not.toMatch(/own-session|other-session|secret-target|private\.example|omit-me/)
  })

  it("reports a BrowserRig issue through fixed CLI arguments without exposing the mapped session", async () => {
    const { adapter, runner, map, cwd } = await fixture([
      processResult({
        reportId: "browserrig--20260824T122400Z--abcdef",
        created: true,
        localPath: "/tmp/browserrig/issues/report.json",
        classification: "operational",
        occurrences: 1,
        submission: { status: "not-eligible" },
      }),
    ])
    const key = dshSessionMappingKey(runner.endpointKey(), "dsh-agent")
    await map.set(key, "own-session")

    const result = await adapter.issueReport(execContext("dsh-agent", cwd), {
      classification: "operational",
      component: "relay",
      summary: "Relay recovered",
      actual: "The first start failed.",
      errorCode: "relay/start-failed",
      recovery: "The retry succeeded.",
    })

    expect(runner.calls[0]?.args).toEqual([
      "issue",
      "report",
      "--json",
      "--surface=dsh",
      "--classification=operational",
      "--component=relay",
      "--summary=Relay recovered",
      "--actual=The first start failed.",
      "--error-code=relay/start-failed",
      "--recovery=The retry succeeded.",
      "--session=own-session",
    ])
    expect(JSON.stringify(result)).not.toContain("own-session")
    expect(JSON.stringify(result)).not.toContain("/tmp/browserrig")
  })

  it("stores BrowserRig image results in DSH attachments and renders attachment blocks", async () => {
    const encoded = Buffer.from([1, 2, 3]).toString("base64")
    const { adapter, cwd } = await fixture([
      executeSuccess("media-session", { screenshot: { type: "image", size: 3 } }, {
        media: [{ type: "image", mimeType: "image/png", data: encoded, size: 3 }],
        logSummary: { totalCount: 5, returnedCount: 1, repeatedCount: 3, omittedCount: 1 },
      }),
    ])
    const attachment = {
      attachmentId: "sha256:attachment" as ImageAttachmentRef["attachmentId"],
      mediaType: "image/png" as const,
      bytes: 3,
      width: 1,
      height: 1,
    }
    const saveImages = vi.fn(async (_inputs: readonly SaveImageAttachment[]) => [attachment])
    const attachments = { saveImages } as unknown as AttachmentStore

    const value = await adapter.execute(execContext("dsh-agent", cwd), "return await page.screenshot()", attachments)
    expect(saveImages).toHaveBeenCalledOnce()
    expect(saveImages.mock.calls[0]?.[0]?.[0]).toMatchObject({ mediaType: "image/png", name: "browserrig-result.png" })
    expect([...saveImages.mock.calls[0]![0]![0]!.data]).toEqual([1, 2, 3])
    expect(value.images).toEqual([attachment])
    expect(value.logSummary).toEqual({ totalCount: 5, returnedCount: 1, repeatedCount: 3, omittedCount: 1 })
    expect(JSON.stringify(value)).not.toContain(encoded)

    const tools = createBrowserRigDshTools({
      adapter,
      config: { timeoutMs: 180_000, maxOutputBytes: 8 * 1024 * 1024 },
      attachments: () => attachments,
    })
    expect(tools.map(tool => tool.name)).toEqual([
      "browserrig_execute",
      "browserrig_adopt_active",
      "browserrig_status",
      "browserrig_reset",
      "browserrig_journal",
      "browserrig_issue_report",
    ])
    const executeTool = tools[0]!
    expect(executeTool.output.render({}, value as unknown as JsonValue)).toEqual(expect.arrayContaining([
      { type: "image", attachment },
    ]))
  })

  it("rejects non-canonical image aliases before attachment storage", async () => {
    const { adapter, cwd } = await fixture([
      executeSuccess("media-session", null, {
        media: [{ type: "image", mimeType: "image/png", data: "AB==", size: 1 }],
      }),
    ])
    const saveImages = vi.fn()

    const value = await adapter.execute(
      execContext("dsh-agent", cwd),
      "return await page.screenshot()",
      { saveImages } as unknown as AttachmentStore,
    )

    expect(saveImages).not.toHaveBeenCalled()
    expect(value.images).toEqual([])
    expect(value.warnings).toEqual([expect.stringContaining("not canonical base64")])
  })

  it("forwards both call cancellation and plugin unload cancellation", async () => {
    const callerAbort = new AbortController()
    callerAbort.abort(new DOMException("caller stopped", "AbortError"))
    const first = await fixture([])
    await expect(first.adapter.execute(execContext("dsh-agent", first.cwd, callerAbort.signal), "return 1"))
      .rejects.toThrow("caller stopped")

    const second = await fixture([])
    second.pluginAbort.abort(new DOMException("plugin unloaded", "AbortError"))
    await expect(second.adapter.execute(execContext("dsh-agent", second.cwd), "return 1"))
      .rejects.toThrow("plugin unloaded")
  })

  it("fails closed on malformed, unsupported, or truncated CLI output", async () => {
    const malformed = await fixture([{
      ...processResult(null),
      stdout: "not-json",
      stderr: "bounded diagnostic",
    }])
    await expect(malformed.adapter.execute(execContext("dsh-agent", malformed.cwd), "return 1"))
      .rejects.toThrow("malformed JSON: bounded diagnostic")

    const unsupported = await fixture([processResult({ ok: true })])
    await expect(unsupported.adapter.execute(execContext("dsh-agent", unsupported.cwd), "return 1"))
      .rejects.toThrow("unsupported JSON envelope")

    const truncated = await fixture([{
      ...executeSuccess("possibly-created-session", 1),
      stdoutTruncated: true,
    }])
    await expect(truncated.adapter.execute(execContext("dsh-agent", truncated.cwd), "return 1"))
      .rejects.toThrow("outcome may have occurred; inspect before retrying")
  })
})

describe("package-local BrowserRig CLI runner", () => {
  it("uses literal argv without a shell", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "browserrig-dsh-runner-"))
    temporaryDirectories.push(cwd)
    const scriptPath = path.join(cwd, "fake-cli.mjs")
    await fs.writeFile(scriptPath, [
      "process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: { session: process.env.BROWSERRIG_SESSION, targetUrl: process.env.BROWSERRIG_TARGET_URL, targetIndex: process.env.BROWSERRIG_TARGET_INDEX, port: process.env.BROWSERRIG_PORT, issueAutoSubmit: process.env.BROWSERRIG_ISSUE_AUTO_SUBMIT } }))",
      "process.stderr.write('diagnostic-output')",
    ].join("\n"))
    const runner = new PackageBrowserRigCliRunner(1_024, scriptPath)
    const signal = new AbortController().signal
    vi.stubEnv("BROWSERRIG_SESSION", "human-session")
    vi.stubEnv("BROWSERRIG_TARGET_URL", "private.example")
    vi.stubEnv("BROWSERRIG_TARGET_INDEX", "7")
    vi.stubEnv("BROWSERRIG_PORT", "29990")
    vi.stubEnv("BROWSERRIG_ISSUE_AUTO_SUBMIT", "true")

    const result = await runner.run(["execute", "$(touch should-not-exist)", "; echo nope"], { cwd, signal })
      .finally(() => vi.unstubAllEnvs())

    expect(JSON.parse(result.stdout)).toEqual({
      argv: ["execute", "$(touch should-not-exist)", "; echo nope"],
      cwd: await fs.realpath(cwd),
      env: { port: "29990", issueAutoSubmit: "true" },
    })
    expect(result.stderr).toBe("diagnostic-output")
    expect(result.stdoutTruncated).toBe(false)
    expect(result.stderrTruncated).toBe(false)
    await expect(fs.stat(path.join(cwd, "should-not-exist"))).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("marks oversized process output as truncated", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "browserrig-dsh-runner-"))
    temporaryDirectories.push(cwd)
    const scriptPath = path.join(cwd, "noisy-cli.mjs")
    await fs.writeFile(scriptPath, "process.stdout.write('x'.repeat(128)); process.stderr.write('y'.repeat(128))\n")
    const runner = new PackageBrowserRigCliRunner(16, scriptPath)

    const result = await runner.run([], { cwd, signal: new AbortController().signal })

    expect(result.stdout).toBe("x".repeat(16))
    expect(result.stderr).toBe("y".repeat(16))
    expect(result.stdoutTruncated).toBe(true)
    expect(result.stderrTruncated).toBe(true)
  })

  it("terminates a running package-local CLI when DSH cancels", async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "browserrig-dsh-runner-"))
    temporaryDirectories.push(cwd)
    const scriptPath = path.join(cwd, "waiting-cli.mjs")
    await fs.writeFile(scriptPath, "setInterval(() => {}, 1000)\n")
    const runner = new PackageBrowserRigCliRunner(1_024, scriptPath)
    const controller = new AbortController()
    const running = runner.run([], { cwd, signal: controller.signal })
    setTimeout(() => controller.abort(new DOMException("DSH cancelled", "AbortError")), 50)

    await expect(running).rejects.toThrow("DSH cancelled")
  })
})

const runnerEndpoint = "http://127.0.0.1:19990"
