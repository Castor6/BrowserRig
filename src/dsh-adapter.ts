import { spawn } from "node:child_process"
import process from "node:process"
import { fileURLToPath } from "node:url"
import type { AttachmentStore, ImageAttachmentRef, ImageMediaType } from "@deepseek-ai/dsh-attachment"
import { defineTool, type JsonValue, type ToolDefinition, type ToolRunContext } from "@deepseek-ai/dsh-tools"
import { Schema } from "effect"
import { DshSessionMap, dshSessionMappingKey } from "./dsh-session-map.ts"

const supportedImageTypes = new Set<ImageMediaType>(["image/png", "image/jpeg", "image/webp", "image/gif"])
const processKillGraceMs = 2_000

const CliErrorDetails = Schema.Struct({
  _tag: Schema.String,
  message: Schema.String,
  code: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.Number),
})

const CliSession = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  connected: Schema.Boolean,
  pageUrl: Schema.NullOr(Schema.String),
  stateKeys: Schema.Array(Schema.String),
  readOnly: Schema.optionalKey(Schema.Boolean),
  created: Schema.optionalKey(Schema.Boolean),
})

const CliMedia = Schema.Struct({
  type: Schema.Literal("image"),
  mimeType: Schema.String,
  data: Schema.String,
  size: Schema.Number,
})

const CliExecuteEnvelope = Schema.Struct({
  ok: Schema.Boolean,
  isError: Schema.Boolean,
  text: Schema.String,
  value: Schema.Json,
  valueUnavailable: Schema.Boolean,
  error: Schema.optionalKey(CliErrorDetails),
  logs: Schema.Array(Schema.Json),
  logSummary: Schema.optionalKey(Schema.Json),
  warnings: Schema.Array(Schema.String),
  diagnostic: Schema.optionalKey(Schema.String),
  aftermath: Schema.optionalKey(Schema.Json),
  media: Schema.optionalKey(Schema.Array(CliMedia)),
  session: Schema.optionalKey(CliSession),
})

const CliAdoptEnvelope = Schema.Struct({
  ok: Schema.Boolean,
  adoptedUrl: Schema.optionalKey(Schema.String),
  session: Schema.optionalKey(CliSession),
  error: Schema.optionalKey(CliErrorDetails),
})

const CliResetEnvelope = Schema.Struct({
  ok: Schema.Boolean,
  session: Schema.optionalKey(CliSession),
  error: Schema.optionalKey(CliErrorDetails),
})

const CliStatusEnvelope = Schema.Struct({
  endpoint: Schema.String,
  relay: Schema.Struct({
    running: Schema.Boolean,
    version: Schema.optionalKey(Schema.String),
    buildId: Schema.optionalKey(Schema.NullOr(Schema.String)),
    stale: Schema.optionalKey(Schema.Boolean),
    error: Schema.optionalKey(Schema.String),
  }),
  extension: Schema.Json,
  currentSession: Schema.optionalKey(Schema.NullOr(Schema.String)),
  sessions: Schema.Array(CliSession),
  targets: Schema.Array(Schema.Json),
})

const CliJournalEnvelope = Schema.Struct({
  session: Schema.String,
  entries: Schema.Array(Schema.Json),
})

const CliIssueReportEnvelope = Schema.Struct({
  reportId: Schema.String,
  created: Schema.Boolean,
  localPath: Schema.String,
  classification: Schema.Literals(["operational", "suspected-bug", "security"]),
  occurrences: Schema.Number,
  submission: Schema.Struct({
    status: Schema.Literals(["not-eligible", "disabled", "pending", "submitted", "unavailable", "failed", "unknown"]),
    attemptedAt: Schema.optionalKey(Schema.String),
    githubUrl: Schema.optionalKey(Schema.String),
    reason: Schema.optionalKey(Schema.String),
  }),
})

type CliExecuteEnvelope = Schema.Schema.Type<typeof CliExecuteEnvelope>
type CliSession = Schema.Schema.Type<typeof CliSession>
type CliErrorDetails = Schema.Schema.Type<typeof CliErrorDetails>
type CliMedia = Schema.Schema.Type<typeof CliMedia>
type EffectJson = Schema.Schema.Type<typeof Schema.Json>

export interface BrowserRigProcessResult {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly stdoutTruncated: boolean
  readonly stderrTruncated: boolean
}

export interface BrowserRigCliRunner {
  endpointKey(): string
  run(
    args: readonly string[],
    options: { readonly cwd: string; readonly signal: AbortSignal },
  ): Promise<BrowserRigProcessResult>
}

export interface BrowserRigExecuteValue {
  readonly text: string
  readonly value: JsonValue
  readonly valueUnavailable: boolean
  readonly logs: JsonValue[]
  readonly logSummary?: JsonValue
  readonly warnings: string[]
  readonly diagnostic?: string
  readonly aftermath?: JsonValue
  readonly images: ImageAttachmentRef[]
}

export interface BrowserRigAdapterConfig {
  readonly timeoutMs: number
  readonly maxOutputBytes: number
}

export interface BrowserRigIssueReportArguments {
  readonly classification: "operational" | "suspected-bug" | "security"
  readonly component: string
  readonly summary: string
  readonly actual: string
  readonly error?: string | undefined
  readonly errorCode?: string | undefined
  readonly reproduction?: string | undefined
  readonly expected?: string | undefined
  readonly recovery?: string | undefined
}

interface AgentInvocation {
  readonly dshSessionId: string
  readonly mappingKey: string
  readonly cwd: string
  readonly signal: AbortSignal
}

export class PackageBrowserRigCliRunner implements BrowserRigCliRunner {
  readonly cliPath: string

  constructor(
    readonly maxOutputBytes: number,
    cliPath = fileURLToPath(new URL("./cli.js", import.meta.url)),
  ) {
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) {
      throw new Error("BrowserRig DSH maxOutputBytes must be a positive safe integer")
    }
    this.cliPath = cliPath
  }

  endpointKey(): string {
    const configured = process.env.BROWSERRIG_PORT?.trim()
    return `http://127.0.0.1:${configured || "19990"}`
  }

  async run(
    args: readonly string[],
    options: { readonly cwd: string; readonly signal: AbortSignal },
  ): Promise<BrowserRigProcessResult> {
    options.signal.throwIfAborted()
    const {
      BROWSERRIG_SESSION: _browserRigSession,
      BROWSERRIG_TARGET_URL: _browserRigTargetUrl,
      BROWSERRIG_TARGET_INDEX: _browserRigTargetIndex,
      ...inheritedEnvironment
    } = process.env
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [this.cliPath, ...args], {
        cwd: options.cwd,
        env: { ...inheritedEnvironment, FORCE_COLOR: "0", NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      })
      const stdout = boundedCapture(this.maxOutputBytes)
      const stderr = boundedCapture(this.maxOutputBytes)
      let settled = false
      let killTimer: NodeJS.Timeout | undefined
      let aborted = options.signal.aborted

      child.stdout.on("data", stdout.append)
      child.stderr.on("data", stderr.append)

      const onAbort = (): void => {
        aborted = true
        child.kill("SIGTERM")
        killTimer = setTimeout(() => child.kill("SIGKILL"), processKillGraceMs)
        killTimer.unref()
      }
      options.signal.addEventListener("abort", onAbort, { once: true })
      if (options.signal.aborted) onAbort()

      const cleanup = (): void => {
        options.signal.removeEventListener("abort", onAbort)
        if (killTimer !== undefined) clearTimeout(killTimer)
      }

      child.once("error", (error) => {
        if (settled) return
        settled = true
        cleanup()
        reject(aborted ? abortReason(options.signal) : new Error("Could not start the package-local BrowserRig CLI", { cause: error }))
      })
      child.once("close", (exitCode, signal) => {
        if (settled) return
        settled = true
        cleanup()
        if (aborted) {
          reject(abortReason(options.signal))
          return
        }
        resolve({
          exitCode,
          signal,
          stdout: stdout.text(),
          stderr: stderr.text(),
          stdoutTruncated: stdout.truncated(),
          stderrTruncated: stderr.truncated(),
        })
      })
    })
  }
}

export class BrowserRigDshAdapter {
  private readonly sessionChains = new Map<string, Promise<void>>()

  constructor(
    readonly runner: BrowserRigCliRunner,
    readonly sessionMap: DshSessionMap,
    readonly pluginSignal: AbortSignal,
  ) {}

  async execute(exec: ToolRunContext, code: string, attachments?: AttachmentStore): Promise<BrowserRigExecuteValue> {
    if (!code.trim()) throw new Error("browserrig_execute code must not be empty")
    const invocation = this.invocation(exec)
    const envelope = await this.serialized(invocation.mappingKey, async () => {
      const sessionId = await this.sessionMap.get(invocation.mappingKey, invocation.signal)
      if (sessionId !== undefined) {
        try {
          const envelope = await this.executeCommand(invocation, code, sessionId)
          throwForExecuteFailure(envelope)
          return envelope
        } catch (error) {
          if (!isMissingSession(error)) throw scrubSessionError(error, sessionId)
          await this.sessionMap.delete(invocation.mappingKey, invocation.signal)
        }
      }
      return this.executeAndRemember(invocation, code)
    })
    return this.projectExecute(envelope, attachments)
  }

  async adoptActive(exec: ToolRunContext): Promise<{ readonly adoptedUrl: string }> {
    const invocation = this.invocation(exec)
    return this.serialized(invocation.mappingKey, async () => {
      const sessionId = await this.sessionMap.get(invocation.mappingKey, invocation.signal)
      if (sessionId !== undefined) {
        try {
          const adopted = await this.adoptCommand(invocation, sessionId)
          return { adoptedUrl: adopted.adoptedUrl }
        } catch (error) {
          if (!isMissingSession(error)) throw scrubSessionError(error, sessionId)
          await this.sessionMap.delete(invocation.mappingKey, invocation.signal)
        }
      }
      return this.adoptAndRemember(invocation)
    })
  }

  async status(exec: ToolRunContext): Promise<JsonValue> {
    const invocation = this.invocation(exec)
    const [sessionId, processResult] = await Promise.all([
      this.sessionMap.get(invocation.mappingKey, invocation.signal),
      this.runner.run(["status", "--json"], { cwd: invocation.cwd, signal: invocation.signal }),
    ])
    const decoded = decodeJson(CliStatusEnvelope, processResult, "status", { allowNonZero: true })
    const session = sessionId === undefined ? undefined : decoded.sessions.find(candidate => candidate.id === sessionId)
    const extension = projectExtension(toJsonValue(decoded.extension))
    return {
      ready: decoded.relay.running && decoded.relay.stale !== true && extension?.connected === true,
      endpoint: decoded.endpoint,
      relay: decoded.relay,
      extension,
      session: session === undefined ? null : projectSession(session),
      mappingStale: sessionId !== undefined && decoded.relay.running && session === undefined,
    }
  }

  async reset(exec: ToolRunContext): Promise<JsonValue> {
    const invocation = this.invocation(exec)
    return this.serialized(invocation.mappingKey, async () => {
      const sessionId = await this.sessionMap.get(invocation.mappingKey, invocation.signal)
      if (sessionId === undefined) return { reset: false, recreated: false, reason: "no-session" }
      try {
        const session = await this.resetCommand(invocation, sessionId)
        return { reset: true, recreated: false, session: projectSession(session) }
      } catch (error) {
        if (!isMissingSession(error)) throw scrubSessionError(error, sessionId)
        await this.sessionMap.delete(invocation.mappingKey, invocation.signal)
        return { reset: false, recreated: false, mappingCleared: true, reason: "stale-session" }
      }
    })
  }

  async journal(exec: ToolRunContext, limit: number): Promise<JsonValue> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("browserrig_journal limit must be an integer from 1 through 100")
    }
    const invocation = this.invocation(exec)
    const sessionId = await this.sessionMap.get(invocation.mappingKey, invocation.signal)
    if (sessionId === undefined) return { entries: [] }
    const result = await this.runner.run(
      ["journal", "--json", "--session", sessionId, "--limit", String(limit)],
      { cwd: invocation.cwd, signal: invocation.signal },
    )
    const decoded = decodeJson(CliJournalEnvelope, result, "journal")
    return {
      entries: decoded.entries.map(entry => stripJournalSession(toJsonValue(entry))),
    }
  }

  async issueReport(exec: ToolRunContext, input: BrowserRigIssueReportArguments): Promise<JsonValue> {
    const invocation = this.invocation(exec)
    const sessionId = await this.sessionMap.get(invocation.mappingKey, invocation.signal)
    const args = [
      "issue",
      "report",
      "--json",
      ...cliFlag("--surface", "dsh"),
      ...cliFlag("--classification", input.classification),
      ...cliFlag("--component", input.component),
      ...cliFlag("--summary", input.summary),
      ...cliFlag("--actual", input.actual),
      ...optionalCliFlag("--error", input.error),
      ...optionalCliFlag("--error-code", input.errorCode),
      ...optionalCliFlag("--reproduction", input.reproduction),
      ...optionalCliFlag("--expected", input.expected),
      ...optionalCliFlag("--recovery", input.recovery),
      ...optionalCliFlag("--session", sessionId),
    ]
    const result = await this.runner.run(args, { cwd: invocation.cwd, signal: invocation.signal })
    const decoded = decodeJson(CliIssueReportEnvelope, result, "issue report")
    return {
      reportId: decoded.reportId,
      created: decoded.created,
      classification: decoded.classification,
      occurrences: decoded.occurrences,
      submission: toJsonValue(decoded.submission),
    }
  }

  private invocation(exec: ToolRunContext): AgentInvocation {
    if (exec.agent === undefined) {
      throw new Error("BrowserRig DSH tools require an agent-owned execution context")
    }
    const dshSessionId = String(exec.agent.id)
    const signal = AbortSignal.any([exec.signal, this.pluginSignal])
    return {
      dshSessionId,
      mappingKey: dshSessionMappingKey(this.runner.endpointKey(), dshSessionId),
      cwd: exec.agent.session.header.cwd ?? process.cwd(),
      signal,
    }
  }

  private async executeAndRemember(invocation: AgentInvocation, code: string): Promise<CliExecuteEnvelope> {
    const envelope = await this.executeCommand(invocation, code)
    const sessionId = envelope.session?.id
    if (sessionId === undefined) {
      throwForExecuteFailure(envelope)
      throw new Error("BrowserRig execute succeeded without a session descriptor")
    }
    try {
      // Once browser work has completed, retain continuity even if the caller
      // aborts while this short durable write is in flight.
      await this.sessionMap.set(invocation.mappingKey, sessionId)
    } catch (error) {
      throw new Error(
        "BrowserRig completed the browser request but could not persist its DSH session mapping. The browser outcome may have occurred; inspect before retrying.",
        { cause: error },
      )
    }
    throwForExecuteFailure(envelope)
    return envelope
  }

  private async adoptAndRemember(invocation: AgentInvocation): Promise<{ readonly adoptedUrl: string }> {
    const adopted = await this.adoptCommand(invocation)
    const sessionId = adopted.session?.id
    if (sessionId === undefined) {
      throw new Error("BrowserRig adopted the active tab without returning a session descriptor")
    }
    try {
      await this.sessionMap.set(invocation.mappingKey, sessionId)
    } catch (error) {
      throw new Error(
        "BrowserRig adopted the active tab but could not persist its DSH session mapping. The browser outcome occurred; inspect before retrying.",
        { cause: error },
      )
    }
    return { adoptedUrl: adopted.adoptedUrl }
  }

  private async executeCommand(
    invocation: AgentInvocation,
    code: string,
    sessionId?: string,
  ): Promise<CliExecuteEnvelope> {
    const args = [
      "execute",
      "--json",
      ...(sessionId === undefined ? [] : ["--session", sessionId]),
      cliPositionalCode(code),
    ]
    const result = await this.runner.run(args, { cwd: invocation.cwd, signal: invocation.signal })
    const envelope = decodeJson(CliExecuteEnvelope, result, "execute", { allowNonZero: true })
    const failed = !envelope.ok || envelope.isError
    if ((result.exitCode === 0) === failed) throw inconsistentExit("execute", result)
    return envelope
  }

  private async adoptCommand(
    invocation: AgentInvocation,
    sessionId?: string,
  ): Promise<{ readonly adoptedUrl: string; readonly session?: CliSession }> {
    const result = await this.runner.run(
      [
        "session",
        "adopt",
        "--json",
        ...(sessionId === undefined ? [] : ["--session", sessionId]),
        "--active",
      ],
      { cwd: invocation.cwd, signal: invocation.signal },
    )
    const envelope = decodeJson(CliAdoptEnvelope, result, "session adopt", { allowNonZero: true })
    if (!envelope.ok) throw commandError(envelope.error, "BrowserRig could not adopt the active tab")
    if (result.exitCode !== 0 || envelope.adoptedUrl === undefined) throw inconsistentExit("session adopt", result)
    return {
      adoptedUrl: envelope.adoptedUrl,
      ...(envelope.session === undefined ? {} : { session: envelope.session }),
    }
  }

  private async resetCommand(invocation: AgentInvocation, sessionId: string): Promise<CliSession> {
    const result = await this.runner.run(
      ["session", "reset", "--json", "--session", sessionId],
      { cwd: invocation.cwd, signal: invocation.signal },
    )
    const envelope = decodeJson(CliResetEnvelope, result, "session reset", { allowNonZero: true })
    if (!envelope.ok) throw commandError(envelope.error, "BrowserRig could not reset the session")
    if (result.exitCode !== 0 || envelope.session === undefined) throw inconsistentExit("session reset", result)
    return envelope.session
  }

  private async projectExecute(
    envelope: CliExecuteEnvelope,
    attachments: AttachmentStore | undefined,
  ): Promise<BrowserRigExecuteValue> {
    const warnings = [...envelope.warnings]
    const images: ImageAttachmentRef[] = []
    const media = envelope.media ?? []
    if (media.length > 0) {
      if (attachments === undefined) {
        warnings.push(`DSH has no attachment service; omitted ${media.length} BrowserRig image result${media.length === 1 ? "" : "s"}.`)
      } else {
        try {
          const inputs = media.map(decodeCliMedia)
          images.push(...await attachments.saveImages(inputs))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          warnings.push(`DSH could not retain ${media.length} BrowserRig image result${media.length === 1 ? "" : "s"}: ${message}`)
        }
      }
    }
    return {
      text: envelope.text,
      value: toJsonValue(envelope.value),
      valueUnavailable: envelope.valueUnavailable,
      logs: envelope.logs.map(toJsonValue),
      ...(envelope.logSummary === undefined ? {} : { logSummary: toJsonValue(envelope.logSummary) }),
      warnings,
      ...(envelope.diagnostic === undefined ? {} : { diagnostic: envelope.diagnostic }),
      ...(envelope.aftermath === undefined ? {} : { aftermath: toJsonValue(envelope.aftermath) }),
      images,
    }
  }

  private async serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.sessionChains.get(key) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(operation)
    const tail = run.then(() => undefined, () => undefined)
    this.sessionChains.set(key, tail)
    try {
      return await run
    } finally {
      if (this.sessionChains.get(key) === tail) this.sessionChains.delete(key)
    }
  }
}

export function createBrowserRigDshTools(options: {
  readonly adapter: BrowserRigDshAdapter
  readonly config: BrowserRigAdapterConfig
  readonly attachments: () => AttachmentStore | undefined
}): readonly ToolDefinition[] {
  const imageAttachmentSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      attachmentId: { type: "string", required: true },
      mediaType: {
        type: "string",
        enum: ["image/png", "image/jpeg", "image/webp", "image/gif"],
        required: true,
      },
      bytes: { type: "integer", required: true },
      width: { type: "integer", required: true },
      height: { type: "integer", required: true },
      name: { type: "string" },
      originalDimensions: {
        type: "object",
        additionalProperties: false,
        properties: {
          width: { type: "integer", required: true },
          height: { type: "integer", required: true },
        },
      },
    },
  } as const

  const execute = defineTool({
    name: "browserrig_execute",
    description: "Run Playwright JavaScript in this DSH session's persistent BrowserRig page. Inspect, act, and verify in one call when steps depend on transient UI. The environment provides page, context, browser, state, snapshot(), ref(), ariaSnapshot(), screenshotWithLabels(), fillInput(), fillInputs(), and handoff(). Return evidence of the requested outcome. BrowserRig session identity is managed automatically.",
    parameters: {
      code: { type: "string", required: true, description: "Playwright JavaScript. Single expressions auto-return; multi-statement scripts must return a JSON-safe result." },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", required: true },
          value: { type: "json", required: true },
          valueUnavailable: { type: "boolean", required: true },
          logs: { type: "array", items: { type: "json" }, required: true },
          logSummary: { type: "json" },
          warnings: { type: "array", items: { type: "string" }, required: true },
          diagnostic: { type: "string" },
          aftermath: { type: "json" },
          images: { type: "array", items: imageAttachmentSchema, required: true },
        },
      },
      render: (_args, value) => [
        { type: "text", text: formatExecuteResult(value) },
        ...value.images.map(attachment => ({
          type: "image" as const,
          attachment: attachment as ImageAttachmentRef,
        })),
      ],
    },
    timeoutMs: options.config.timeoutMs,
    execute: (args, exec) => options.adapter.execute(exec, args.code, options.attachments()),
  })

  const adoptActive = defineTool({
    name: "browserrig_adopt_active",
    description: "Attach and adopt the active tab in the user's last-focused Chromium window as this DSH session's persistent BrowserRig page. Use it when the task needs an existing signed-in tab. No extension-toolbar click is required.",
    parameters: {},
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { adoptedUrl: { type: "string", required: true } },
      },
      render: (_args, value) => [{ type: "text", text: `Adopted the active browser tab: ${value.adoptedUrl}` }],
    },
    timeoutMs: options.config.timeoutMs,
    execute: (_args, exec) => options.adapter.adoptActive(exec),
  })

  const status = defineTool({
    name: "browserrig_status",
    description: "Inspect BrowserRig relay, extension, and this DSH session's browser state without starting or changing the browser runtime.",
    parameters: {},
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
    },
    timeoutMs: options.config.timeoutMs,
    isConcurrencySafe: () => true,
    execute: (_args, exec) => options.adapter.status(exec),
  })

  const reset = defineTool({
    name: "browserrig_reset",
    description: "Reset this DSH session's BrowserRig page and JavaScript state. An adopted user tab is released, never closed. Use after an unrecoverable page failure or when a clean page is explicitly needed.",
    parameters: {},
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
    },
    timeoutMs: options.config.timeoutMs,
    execute: (_args, exec) => options.adapter.reset(exec),
  })

  const journal = defineTool({
    name: "browserrig_journal",
    description: "Read recent BrowserRig execute history for this DSH session. Use for diagnostics or auditing; session ids remain internal to the plugin.",
    parameters: {
      limit: { type: "integer", description: "Number of recent entries, 1-100. Defaults to 20." },
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
    },
    timeoutMs: options.config.timeoutMs,
    isConcurrencySafe: () => true,
    execute: (args, exec) => options.adapter.journal(exec, args.limit ?? 20),
  })

  const issueReport = defineTool({
    name: "browserrig_issue_report",
    description: "Record or update a sanitized BrowserRig-owned issue report. Use operational for recoverable BrowserRig setup or lifecycle events, suspected-bug for repeated or unrecovered BrowserRig product behavior, and security for potentially sensitive findings. Ordinary locator, assertion, or changing-site failures belong in the journal, not this report. Eligible suspected-bug reports reach GitHub only when the user configured BROWSERRIG_ISSUE_AUTO_SUBMIT=true.",
    parameters: {
      classification: { type: "string", enum: ["operational", "suspected-bug", "security"], required: true },
      component: { type: "string", required: true, description: "BrowserRig component, such as relay, extension, session, dsh, recording, or network." },
      summary: { type: "string", required: true, description: "Concise BrowserRig problem summary." },
      actual: { type: "string", required: true, description: "Observed BrowserRig behavior." },
      error: { type: "string", description: "Optional exact safe error text." },
      errorCode: { type: "string", description: "Optional stable lowercase BrowserRig error code." },
      reproduction: { type: "string", description: "Optional deterministic reproduction." },
      expected: { type: "string", description: "Optional expected BrowserRig behavior." },
      recovery: { type: "string", description: "Optional recovery already attempted." },
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
    },
    timeoutMs: options.config.timeoutMs,
    execute: (args, exec) => options.adapter.issueReport(exec, args),
  })

  return [execute, adoptActive, status, reset, journal, issueReport]
}

function cliPositionalCode(code: string): string {
  return code.startsWith("-") ? ` ${code}` : code
}

function optionalCliFlag(name: string, value: string | undefined): string[] {
  return value === undefined ? [] : cliFlag(name, value)
}

function cliFlag(name: string, value: string): string[] {
  return [`${name}=${value}`]
}

function decodeJson<S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  result: BrowserRigProcessResult,
  command: string,
  options: { readonly allowNonZero?: boolean } = {},
): S["Type"] {
  if (result.stdoutTruncated || result.stderrTruncated) {
    throw new Error(`BrowserRig ${command} output exceeded the configured DSH limit. The command outcome may have occurred; inspect before retrying.`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(result.stdout)
  } catch (error) {
    throw new Error(`BrowserRig ${command} returned malformed JSON${diagnosticStderr(result.stderr)}`, { cause: error })
  }
  let decoded: S["Type"]
  try {
    decoded = Schema.decodeUnknownSync(schema)(parsed)
  } catch (error) {
    throw new Error(`BrowserRig ${command} returned an unsupported JSON envelope`, { cause: error })
  }
  if (!options.allowNonZero && result.exitCode !== 0) throw inconsistentExit(command, result)
  return decoded
}

class BrowserRigCommandError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "BrowserRigCommandError"
  }
}

function commandError(error: CliErrorDetails | undefined, fallback: string, diagnostic?: string): BrowserRigCommandError {
  const message = error?.message || fallback
  return new BrowserRigCommandError(
    diagnostic ? `${message}\nDiagnostic: ${diagnostic}` : message,
    error?.code,
    error?.status,
  )
}

function throwForExecuteFailure(envelope: CliExecuteEnvelope): void {
  if (!envelope.ok || envelope.isError) {
    throw commandError(envelope.error, envelope.text, envelope.diagnostic)
  }
}

function isMissingSession(error: unknown): boolean {
  return error instanceof BrowserRigCommandError && error.code === "session-not-found"
}

function scrubSessionError(error: unknown, sessionId: string): unknown {
  if (!(error instanceof Error)) return error
  const message = error.message.replaceAll(sessionId, "<session>")
  if (error instanceof BrowserRigCommandError) return new BrowserRigCommandError(message, error.code, error.status)
  return new Error(message, { cause: error })
}

function inconsistentExit(command: string, result: BrowserRigProcessResult): Error {
  return new Error(
    `BrowserRig ${command} exited unexpectedly (code=${String(result.exitCode)}, signal=${String(result.signal)})${diagnosticStderr(result.stderr)}`,
  )
}

function diagnosticStderr(stderr: string): string {
  const trimmed = stderr.trim()
  if (!trimmed) return ""
  return `: ${trimmed.slice(0, 1_000)}`
}

function projectSession(session: CliSession): JsonValue {
  return {
    connected: session.connected,
    pageUrl: session.pageUrl,
    stateKeys: [...session.stateKeys],
    ...(session.readOnly === undefined ? {} : { readOnly: session.readOnly }),
  }
}

function projectExtension(value: JsonValue): ({ connected: boolean } & Record<string, JsonValue>) | null {
  if (!isRecord(value) || typeof value.connected !== "boolean") return null
  return {
    connected: value.connected,
    version: typeof value.version === "string" || value.version === null ? value.version : null,
    ...(typeof value.protocolVersion === "number" || value.protocolVersion === null ? { protocolVersion: value.protocolVersion } : {}),
    ...(typeof value.protocolCompatible === "boolean" || value.protocolCompatible === null ? { protocolCompatible: value.protocolCompatible } : {}),
    ...(typeof value.protocolLegacy === "boolean" || value.protocolLegacy === null ? { protocolLegacy: value.protocolLegacy } : {}),
    ...(typeof value.activeTargets === "number" ? { activeTargets: value.activeTargets } : {}),
    ...(typeof value.childTargets === "number" ? { childTargets: value.childTargets } : {}),
    ...(typeof value.cdpClients === "number" ? { cdpClients: value.cdpClients } : {}),
  }
}

function stripJournalSession(value: JsonValue): JsonValue {
  if (!isRecord(value)) return value
  const { sessionId: _sessionId, ...entry } = value
  return entry
}

function toJsonValue(value: EffectJson): JsonValue {
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]))
  }
  return value
}

function decodeCliMedia(media: CliMedia): { readonly data: Uint8Array; readonly mediaType: ImageMediaType; readonly name: string } {
  if (!supportedImageTypes.has(media.mimeType as ImageMediaType)) {
    throw new Error(`unsupported image type ${media.mimeType}`)
  }
  const data = decodeBase64(media.data)
  if (data.byteLength !== media.size) {
    throw new Error(`image size mismatch: declared ${media.size}, decoded ${data.byteLength}`)
  }
  const mediaType = media.mimeType as ImageMediaType
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType.slice("image/".length)
  return { data, mediaType, name: `browserrig-result.${extension}` }
}

function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("image data is not canonical base64")
  }
  const decoded = Buffer.from(value, "base64")
  if (decoded.toString("base64") !== value) {
    throw new Error("image data is not canonical base64")
  }
  return decoded
}

function formatExecuteResult(value: {
  readonly text: string
  readonly logs: readonly JsonValue[]
  readonly logSummary?: JsonValue
  readonly warnings: readonly string[]
  readonly diagnostic?: string
  readonly aftermath?: JsonValue
  readonly images: readonly unknown[]
}): string {
  const lines = [value.text]
  if (value.logs.length > 0) {
    lines.push("Console logs:")
    for (const log of value.logs) lines.push(formatLog(log))
  }
  if (value.logSummary !== undefined) lines.push(`Log summary: ${JSON.stringify(value.logSummary)}`)
  for (const warning of value.warnings) lines.push(`Warning: ${warning}`)
  if (value.diagnostic) lines.push(`Diagnostic: ${value.diagnostic}`)
  if (value.aftermath !== undefined) lines.push(`Aftermath: ${JSON.stringify(value.aftermath)}`)
  if (value.images.length > 0) lines.push(`Attached images: ${value.images.length}`)
  return lines.join("\n")
}

function formatLog(value: JsonValue): string {
  if (!isRecord(value)) return JSON.stringify(value)
  const source = typeof value.source === "string" ? value.source : "unknown"
  const type = typeof value.type === "string" ? value.type : "log"
  const text = typeof value.text === "string" ? value.text : JSON.stringify(value)
  return `[${source}:${type}] ${text}`
}

function boundedCapture(maxBytes: number): {
  readonly append: (chunk: Buffer | string) => void
  readonly text: () => string
  readonly truncated: () => boolean
} {
  const chunks: Buffer[] = []
  let bytes = 0
  let wasTruncated = false
  return {
    append: (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const remaining = maxBytes - bytes
      if (remaining <= 0) {
        wasTruncated = true
        return
      }
      if (buffer.byteLength > remaining) {
        chunks.push(buffer.subarray(0, remaining))
        bytes += remaining
        wasTruncated = true
        return
      }
      chunks.push(buffer)
      bytes += buffer.byteLength
    },
    text: () => Buffer.concat(chunks, bytes).toString("utf8"),
    truncated: () => wasTruncated,
  }
}

function abortReason(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason
  return new DOMException("BrowserRig DSH command aborted", "AbortError")
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
