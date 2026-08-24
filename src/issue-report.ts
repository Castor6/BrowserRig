import { Config, Effect, Schema } from "effect"
import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isValidSessionId } from "./relay-helpers.ts"
import { defaultJournalBaseDir, readJournalEntries } from "./session-journal.ts"
import { browserRigBuildId, browserRigVersion } from "./version.ts"

export const issueAutoSubmitConfig = Config.boolean("BROWSERRIG_ISSUE_AUTO_SUBMIT").pipe(
  Config.withDefault(false),
)

export const IssueClassification = Schema.Literals(["operational", "suspected-bug", "security"])
export type IssueClassification = Schema.Schema.Type<typeof IssueClassification>

export const IssueSurface = Schema.Literals(["cli", "mcp", "dsh"])
export type IssueSurface = Schema.Schema.Type<typeof IssueSurface>

const JournalReference = Schema.Struct({
  sessionId: Schema.String,
  timestamp: Schema.String,
})

const IssueSubmission = Schema.Struct({
  status: Schema.Literals(["not-eligible", "disabled", "pending", "submitted", "unavailable", "failed", "unknown"]),
  attemptedAt: Schema.optionalKey(Schema.String),
  githubUrl: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
})

export type IssueSubmission = Schema.Schema.Type<typeof IssueSubmission>

export const StoredIssueReport = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String,
  fingerprint: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  firstSeenAt: Schema.String,
  lastSeenAt: Schema.String,
  occurrences: Schema.Number,
  classification: IssueClassification,
  component: Schema.String,
  summary: Schema.String,
  actual: Schema.String,
  error: Schema.optionalKey(Schema.String),
  errorCode: Schema.optionalKey(Schema.String),
  reproduction: Schema.optionalKey(Schema.String),
  expected: Schema.optionalKey(Schema.String),
  recovery: Schema.optionalKey(Schema.String),
  primarySessionId: Schema.optionalKey(Schema.String),
  relatedSessionIds: Schema.Array(Schema.String),
  journalReferences: Schema.Array(JournalReference),
  runtime: Schema.Struct({
    browserRigVersion: Schema.String,
    buildId: Schema.String,
    surfaces: Schema.Array(IssueSurface),
    platform: Schema.String,
    architecture: Schema.String,
    nodeVersion: Schema.String,
  }),
  submission: IssueSubmission,
})

export type StoredIssueReport = Schema.Schema.Type<typeof StoredIssueReport>

export interface IssueReportInput {
  readonly classification: IssueClassification
  readonly component: string
  readonly summary: string
  readonly actual: string
  readonly error?: string | undefined
  readonly errorCode?: string | undefined
  readonly reproduction?: string | undefined
  readonly expected?: string | undefined
  readonly recovery?: string | undefined
  readonly primarySessionId?: string | undefined
  readonly relatedSessionIds?: readonly string[] | undefined
  readonly surface: IssueSurface
}

export interface IssueReportResult {
  readonly reportId: string
  readonly created: boolean
  readonly localPath: string
  readonly classification: IssueClassification
  readonly occurrences: number
  readonly submission: IssueSubmission
}

export interface IssueReportOptions {
  readonly baseDir?: string | undefined
  readonly journalBaseDir?: string | undefined
  readonly now?: (() => Date) | undefined
  readonly randomUUID?: (() => string) | undefined
  readonly autoSubmit?: boolean | undefined
  readonly githubSubmitter?: ((report: StoredIssueReport) => Effect.Effect<IssueSubmission>) | undefined
}

type NormalizedIssueInput = Omit<IssueReportInput, "relatedSessionIds"> & {
  readonly relatedSessionIds: readonly string[]
}

type StorageDecision = {
  readonly report: StoredIssueReport
  readonly created: boolean
  readonly shouldSubmit: boolean
}

export const defaultIssueBaseDir = (): string => path.join(os.homedir(), ".browserrig", "issues")

export const recordIssueReport = Effect.fn("IssueReport.record")(function* (
  input: IssueReportInput,
  options: IssueReportOptions = {},
) {
  const normalized = yield* Effect.try({
    try: () => normalizeInput(input),
    catch: (cause) => cause instanceof Error ? cause : new Error("Invalid BrowserRig issue report", { cause }),
  })
  const now = options.now ?? (() => new Date())
  const randomUUID = options.randomUUID ?? crypto.randomUUID
  const baseDir = options.baseDir ?? defaultIssueBaseDir()
  const autoSubmit = options.autoSubmit ?? false
  const journalReferences = yield* Effect.tryPromise({
    try: () => collectJournalReferences(
      normalized,
      options.journalBaseDir ?? defaultJournalBaseDir(),
    ),
    catch: (cause) => new Error("Could not collect BrowserRig journal references", { cause }),
  })

  let decision = yield* Effect.tryPromise({
    try: () => withIssueStoreLock(baseDir, () => upsertReport({
      baseDir,
      input: normalized,
      journalReferences,
      autoSubmit,
      now,
      randomUUID,
    })),
    catch: (cause) => new Error(`Could not persist BrowserRig issue report under ${baseDir}`, { cause }),
  })

  if (decision.shouldSubmit) {
    const submitter = options.githubSubmitter ?? submitIssueToGitHub
    const submission = yield* submitter(decision.report)
    decision = yield* Effect.tryPromise({
      try: () => withIssueStoreLock(baseDir, async () => {
        const current = await readReport(reportPath(baseDir, decision.report.id))
        const updated: StoredIssueReport = {
          ...current,
          updatedAt: now().toISOString(),
          submission,
        }
        await writeReport(baseDir, updated)
        return { ...decision, report: updated, shouldSubmit: false }
      }),
      catch: (cause) => new Error(`Could not update BrowserRig issue submission under ${baseDir}`, { cause }),
    })
  }

  return resultFor(baseDir, decision)
})

export const submitIssueToGitHub = Effect.fn("IssueReport.submitGitHub")(function* (report: StoredIssueReport) {
  const auth = yield* Effect.promise((signal) => runGh(["auth", "status", "--active", "--hostname", "github.com"], undefined, signal))
  if (auth.kind === "spawn-error") {
    return submission("unavailable", report.updatedAt, auth.notFound ? "gh-not-found" : "gh-start-failed")
  }
  if (auth.kind === "timeout") return submission("unavailable", report.updatedAt, "gh-auth-timeout")
  if (auth.exitCode !== 0) return submission("unavailable", report.updatedAt, "gh-not-authenticated")

  const marker = `browserrig-report:${report.fingerprint}`
  const existing = yield* Effect.promise((signal) => runGh([
    "issue",
    "list",
    "--repo",
    "Castor6/BrowserRig",
    "--state",
    "all",
    "--search",
    `${marker} in:body`,
    "--json",
    "number,url",
    "--limit",
    "1",
  ], undefined, signal))
  if (existing.kind !== "completed" || existing.exitCode !== 0) {
    return submission(existing.kind === "timeout" ? "unknown" : "failed", report.updatedAt, "github-dedup-check-failed")
  }
  const existingUrl = parseExistingIssueUrl(existing.stdout)
  if (existingUrl) return { status: "submitted", attemptedAt: report.updatedAt, githubUrl: existingUrl } satisfies IssueSubmission

  const created = yield* Effect.promise((signal) => runGh([
    "issue",
    "create",
    "--repo",
    "Castor6/BrowserRig",
    "--title",
    githubTitle(report),
    "--body-file",
    "-",
  ], githubBody(report), signal))
  if (created.kind === "timeout") return submission("unknown", report.updatedAt, "github-create-timeout")
  if (created.kind === "spawn-error") return submission("unknown", report.updatedAt, "github-create-start-failed")
  if (created.exitCode !== 0) return submission("unknown", report.updatedAt, "github-create-failed")
  const url = parseCreatedIssueUrl(created.stdout)
  return url
    ? { status: "submitted", attemptedAt: report.updatedAt, githubUrl: url } satisfies IssueSubmission
    : submission("unknown", report.updatedAt, "github-create-result-unrecognized")
})

export function parseIssueClassification(value: string): IssueClassification {
  return decodeLiteral(IssueClassification, value, "classification")
}

export function parseIssueSurface(value: string): IssueSurface {
  return decodeLiteral(IssueSurface, value, "surface")
}

export function sanitizeIssueText(input: string, maxLength = 4_000): string {
  const home = os.homedir()
  let text = input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\b(authorization|cookie|set-cookie)\s*[:=][^\r\n]*/gi, "$1=[REDACTED]")
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[CREDENTIAL REDACTED]")
    .replace(/\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+|sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16})\b/g, "[CREDENTIAL REDACTED]")
    .replace(/\b(password|passwd|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|client[_ -]?secret|csrf|otp)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL REDACTED]")
    .replace(/https?:\/\/[^\s<>()\]}'\"]+/gi, "[URL REDACTED]")
  if (home && home !== path.parse(home).root) text = text.replaceAll(home, "~")
  text = text.trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}… [truncated ${text.length - maxLength} chars]`
}

export function githubBody(report: StoredIssueReport): string {
  const sections = [
    `<!-- browserrig-agent-report:v1 ${`browserrig-report:${report.fingerprint}`} -->`,
    "This issue was created from a structured BrowserRig agent report. Sensitive values and URLs are excluded or redacted.",
    "## Summary",
    report.summary,
    "## Classification",
    `- Component: ${report.component}`,
    `- Error code: ${report.errorCode ?? "not available"}`,
    `- Occurrences on the reporting installation: ${report.occurrences}`,
    "## Actual behavior",
    report.actual,
  ]
  appendSection(sections, "Exact error", report.error)
  appendSection(sections, "Reproduction", report.reproduction)
  appendSection(sections, "Expected behavior", report.expected)
  appendSection(sections, "Recovery attempted", report.recovery)
  sections.push(
    "## BrowserRig environment",
    `- Version: ${report.runtime.browserRigVersion}`,
    `- Build ID: ${report.runtime.buildId}`,
    `- Surface: ${report.runtime.surfaces.join(", ")}`,
    `- Platform: ${report.runtime.platform} ${report.runtime.architecture}`,
    `- Node: ${report.runtime.nodeVersion}`,
  )
  if (report.primarySessionId || report.relatedSessionIds.length > 0) {
    sections.push(
      "## Session correlation",
      ...(report.primarySessionId ? [`- Primary session: ${report.primarySessionId}`] : []),
      ...report.relatedSessionIds.map((id) => `- Related session: ${id}`),
    )
  }
  if (report.journalReferences.length > 0) {
    sections.push(
      "## Local journal references",
      ...report.journalReferences.map((reference) => `- ${reference.sessionId} at ${reference.timestamp}`),
    )
  }
  return `${sections.join("\n\n")}\n`
}

function normalizeInput(input: IssueReportInput): NormalizedIssueInput {
  const classification = decodeLiteral(IssueClassification, input.classification, "classification")
  const surface = decodeLiteral(IssueSurface, input.surface, "surface")
  const component = requiredText("component", input.component, 64).toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]*$/.test(component)) {
    throw new Error("component must use lowercase letters, numbers, and hyphens")
  }
  const primarySessionId = optionalSessionId(input.primarySessionId, "primarySessionId")
  const relatedSessionIds = [...new Set((input.relatedSessionIds ?? []).map((id) => {
    const valid = optionalSessionId(id, "relatedSessionIds")
    if (!valid) throw new Error("relatedSessionIds must not contain empty values")
    return valid
  }))].filter((id) => id !== primarySessionId)
  if (relatedSessionIds.length > 20) throw new Error("relatedSessionIds must contain at most 20 sessions")
  return {
    classification,
    component,
    summary: requiredText("summary", input.summary, 240),
    actual: requiredText("actual", input.actual, 4_000),
    ...(optionalText(input.error, 2_000) ? { error: optionalText(input.error, 2_000) } : {}),
    ...(optionalErrorCode(input.errorCode) ? { errorCode: optionalErrorCode(input.errorCode) } : {}),
    ...(optionalText(input.reproduction, 4_000) ? { reproduction: optionalText(input.reproduction, 4_000) } : {}),
    ...(optionalText(input.expected, 4_000) ? { expected: optionalText(input.expected, 4_000) } : {}),
    ...(optionalText(input.recovery, 4_000) ? { recovery: optionalText(input.recovery, 4_000) } : {}),
    ...(primarySessionId ? { primarySessionId } : {}),
    relatedSessionIds,
    surface,
  }
}

function requiredText(field: string, value: string, maxLength: number): string {
  const sanitized = optionalText(value, maxLength)
  if (!sanitized) throw new Error(`${field} is required`)
  return sanitized
}

function optionalText(value: string | undefined, maxLength: number): string | undefined {
  if (value === undefined) return undefined
  const sanitized = sanitizeIssueText(value, maxLength)
  return sanitized || undefined
}

function optionalErrorCode(value: string | undefined): string | undefined {
  if (value === undefined || !value.trim()) return undefined
  const code = value.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9/_.-]{0,119}$/.test(code)) {
    throw new Error("errorCode must be a stable lowercase code")
  }
  return code
}

function optionalSessionId(value: string | undefined, field: string): string | undefined {
  if (value === undefined || !value.trim()) return undefined
  const id = value.trim()
  if (!isValidSessionId(id)) throw new Error(`${field} contains an invalid BrowserRig session id`)
  return id
}

function decodeLiteral<S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown, field: string): S["Type"] {
  try {
    return Schema.decodeUnknownSync(schema)(value)
  } catch (cause) {
    throw new Error(`Invalid ${field}`, { cause })
  }
}

async function collectJournalReferences(
  input: NormalizedIssueInput,
  journalBaseDir: string,
): Promise<readonly Schema.Schema.Type<typeof JournalReference>[]> {
  const ids = [input.primarySessionId, ...input.relatedSessionIds].filter((id): id is string => Boolean(id))
  const references: Array<Schema.Schema.Type<typeof JournalReference>> = []
  for (const sessionId of ids) {
    const entries = await readJournalEntries({ baseDir: journalBaseDir, sessionId, limit: 20 }).catch(() => [])
    const relevant = entries.filter((entry) => entry.isError || Boolean(entry.diagnostic) || Boolean(entry.warnings?.length))
    const selected = (relevant.length > 0 ? relevant : entries.slice(-1)).slice(-3)
    for (const entry of selected) references.push({ sessionId, timestamp: entry.ts })
  }
  return references
}

async function upsertReport(options: {
  readonly baseDir: string
  readonly input: NormalizedIssueInput
  readonly journalReferences: readonly Schema.Schema.Type<typeof JournalReference>[]
  readonly autoSubmit: boolean
  readonly now: () => Date
  readonly randomUUID: () => string
}): Promise<StorageDecision> {
  const timestamp = options.now().toISOString()
  const fingerprint = issueFingerprint(options.input)
  const reports = await readAllReports(options.baseDir)
  const existing = reports.find((report) => report.fingerprint === fingerprint)
  const classification = existing
    ? mergeClassification(existing.classification, options.input.classification)
    : options.input.classification
  const submissionDecision = nextSubmission(existing?.submission, classification, options.autoSubmit, timestamp)
  const report: StoredIssueReport = existing
    ? {
        ...existing,
        updatedAt: timestamp,
        lastSeenAt: timestamp,
        occurrences: existing.occurrences + 1,
        classification,
        component: options.input.component,
        summary: options.input.summary,
        actual: options.input.actual,
        ...(options.input.error ? { error: options.input.error } : {}),
        ...(options.input.errorCode ? { errorCode: options.input.errorCode } : {}),
        ...(options.input.reproduction ? { reproduction: options.input.reproduction } : {}),
        ...(options.input.expected ? { expected: options.input.expected } : {}),
        ...(options.input.recovery ? { recovery: options.input.recovery } : {}),
        ...(options.input.primarySessionId ? { primarySessionId: options.input.primarySessionId } : {}),
        relatedSessionIds: [...new Set([...existing.relatedSessionIds, ...options.input.relatedSessionIds])],
        journalReferences: mergeJournalReferences(existing.journalReferences, options.journalReferences),
        runtime: {
          browserRigVersion,
          buildId: browserRigBuildId,
          surfaces: [...new Set([...existing.runtime.surfaces, options.input.surface])],
          platform: process.platform,
          architecture: process.arch,
          nodeVersion: process.version,
        },
        submission: submissionDecision.submission,
      }
    : {
        version: 1,
        id: issueId(timestamp, options.randomUUID()),
        fingerprint,
        createdAt: timestamp,
        updatedAt: timestamp,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        occurrences: 1,
        classification,
        component: options.input.component,
        summary: options.input.summary,
        actual: options.input.actual,
        ...(options.input.error ? { error: options.input.error } : {}),
        ...(options.input.errorCode ? { errorCode: options.input.errorCode } : {}),
        ...(options.input.reproduction ? { reproduction: options.input.reproduction } : {}),
        ...(options.input.expected ? { expected: options.input.expected } : {}),
        ...(options.input.recovery ? { recovery: options.input.recovery } : {}),
        ...(options.input.primarySessionId ? { primarySessionId: options.input.primarySessionId } : {}),
        relatedSessionIds: [...options.input.relatedSessionIds],
        journalReferences: [...options.journalReferences],
        runtime: {
          browserRigVersion,
          buildId: browserRigBuildId,
          surfaces: [options.input.surface],
          platform: process.platform,
          architecture: process.arch,
          nodeVersion: process.version,
        },
        submission: submissionDecision.submission,
      }
  Schema.decodeUnknownSync(StoredIssueReport)(report)
  await writeReport(options.baseDir, report)
  return { report, created: existing === undefined, shouldSubmit: submissionDecision.shouldSubmit }
}

function nextSubmission(
  current: IssueSubmission | undefined,
  classification: IssueClassification,
  autoSubmit: boolean,
  attemptedAt: string,
): { readonly submission: IssueSubmission; readonly shouldSubmit: boolean } {
  if (current?.status === "submitted" || current?.status === "unknown" || current?.status === "pending") {
    return { submission: current, shouldSubmit: false }
  }
  if (classification !== "suspected-bug") {
    return { submission: { status: "not-eligible" }, shouldSubmit: false }
  }
  if (!autoSubmit) return { submission: { status: "disabled" }, shouldSubmit: false }
  return { submission: { status: "pending", attemptedAt }, shouldSubmit: true }
}

function mergeClassification(left: IssueClassification, right: IssueClassification): IssueClassification {
  if (left === "security" || right === "security") return "security"
  if (left === "suspected-bug" || right === "suspected-bug") return "suspected-bug"
  return "operational"
}

function mergeJournalReferences(
  left: readonly Schema.Schema.Type<typeof JournalReference>[],
  right: readonly Schema.Schema.Type<typeof JournalReference>[],
): Array<Schema.Schema.Type<typeof JournalReference>> {
  const references = new Map<string, Schema.Schema.Type<typeof JournalReference>>()
  for (const reference of [...left, ...right]) references.set(`${reference.sessionId}\0${reference.timestamp}`, reference)
  return [...references.values()].slice(-20)
}

function issueFingerprint(input: NormalizedIssueInput): string {
  const hash = crypto.createHash("sha256")
  hash.update(input.classification === "security" ? "security\0" : "issue\0")
  hash.update(input.component)
  hash.update("\0")
  hash.update(input.errorCode ?? "")
  hash.update("\0")
  hash.update(input.summary.toLowerCase().replace(/\s+/g, " "))
  return hash.digest("hex").slice(0, 24)
}

function issueId(timestamp: string, randomUUID: string): string {
  const compact = timestamp.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
  return `browserrig--${compact}--${randomUUID.replaceAll("-", "").slice(0, 6)}`
}

async function readAllReports(baseDir: string): Promise<StoredIssueReport[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(baseDir)
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ENOENT") return []
    throw cause
  }
  const reports: StoredIssueReport[] = []
  for (const entry of entries.sort()) {
    if (!entry.endsWith(".json")) continue
    try {
      reports.push(await readReport(path.join(baseDir, entry)))
    } catch {
      // Preserve unreadable reports but do not let one corrupt file disable the sink.
    }
  }
  return reports
}

async function readReport(filePath: string): Promise<StoredIssueReport> {
  const text = await fs.readFile(filePath, "utf8")
  return Schema.decodeUnknownSync(StoredIssueReport)(JSON.parse(text))
}

async function writeReport(baseDir: string, report: StoredIssueReport): Promise<void> {
  const filePath = reportPath(baseDir, report.id)
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  await fs.mkdir(baseDir, { recursive: true, mode: 0o700 })
  await fs.chmod(baseDir, 0o700)
  let handle: fs.FileHandle | undefined
  try {
    handle = await fs.open(temporaryPath, "wx", 0o600)
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, "utf8")
    await handle.sync()
    await handle.close()
    handle = undefined
    await fs.rename(temporaryPath, filePath)
    await fs.chmod(filePath, 0o600)
  } finally {
    await handle?.close().catch(() => {})
    await fs.rm(temporaryPath, { force: true }).catch(() => {})
  }
}

async function withIssueStoreLock<T>(baseDir: string, operation: () => Promise<T>): Promise<T> {
  await fs.mkdir(baseDir, { recursive: true, mode: 0o700 })
  await fs.chmod(baseDir, 0o700)
  const lockPath = path.join(baseDir, ".store.lock")
  const deadline = Date.now() + 30_000
  let handle: fs.FileHandle | undefined
  while (handle === undefined) {
    try {
      handle = await fs.open(lockPath, "wx", 0o600)
    } catch (cause) {
      if (!isNodeError(cause) || cause.code !== "EEXIST") throw cause
      const stat = await fs.stat(lockPath).catch(() => undefined)
      if (stat && Date.now() - stat.mtimeMs > 60_000) {
        await fs.unlink(lockPath).catch(() => {})
        continue
      }
      if (Date.now() >= deadline) throw new Error("Timed out waiting for the BrowserRig issue store lock")
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }
  try {
    return await operation()
  } finally {
    await handle.close().catch(() => {})
    await fs.unlink(lockPath).catch(() => {})
  }
}

function reportPath(baseDir: string, id: string): string {
  return path.join(baseDir, `${id}.json`)
}

function resultFor(baseDir: string, decision: StorageDecision): IssueReportResult {
  return {
    reportId: decision.report.id,
    created: decision.created,
    localPath: reportPath(baseDir, decision.report.id),
    classification: decision.report.classification,
    occurrences: decision.report.occurrences,
    submission: decision.report.submission,
  }
}

function submission(status: IssueSubmission["status"], attemptedAt: string, reason: string): IssueSubmission {
  return { status, attemptedAt, reason }
}

function githubTitle(report: StoredIssueReport): string {
  const prefix = report.primarySessionId ? `[${report.primarySessionId}] ` : ""
  return `${prefix}${report.summary}`.slice(0, 120)
}

function appendSection(sections: string[], title: string, body: string | undefined): void {
  if (body) sections.push(`## ${title}`, body)
}

function parseExistingIssueUrl(stdout: string): string | undefined {
  try {
    const value = JSON.parse(stdout) as unknown
    if (!Array.isArray(value)) return undefined
    for (const entry of value) {
      if (typeof entry !== "object" || entry === null || !("url" in entry)) continue
      if (typeof entry.url === "string" && isBrowserRigIssueUrl(entry.url)) return entry.url
    }
  } catch {}
  return undefined
}

function parseCreatedIssueUrl(stdout: string): string | undefined {
  const match = stdout.match(/https:\/\/github\.com\/Castor6\/BrowserRig\/issues\/[1-9][0-9]*/i)?.[0]
  return match && isBrowserRigIssueUrl(match) ? match : undefined
}

function isBrowserRigIssueUrl(value: string): boolean {
  return /^https:\/\/github\.com\/Castor6\/BrowserRig\/issues\/[1-9][0-9]*$/i.test(value)
}

type GhResult =
  | { readonly kind: "completed"; readonly exitCode: number | null; readonly stdout: string }
  | { readonly kind: "spawn-error"; readonly notFound: boolean }
  | { readonly kind: "timeout" }

async function runGh(args: readonly string[], stdin?: string, signal?: AbortSignal): Promise<GhResult> {
  return new Promise((resolve) => {
    const child = spawn("gh", [...args], {
      env: githubEnvironment(),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    })
    const stdout: Buffer[] = []
    let stdoutBytes = 0
    let settled = false
    const finish = (result: GhResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener("abort", onAbort)
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill("SIGTERM")
      finish({ kind: "timeout" })
    }, 30_000)
    timer.unref()
    const onAbort = (): void => {
      child.kill("SIGTERM")
      finish({ kind: "timeout" })
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    if (signal?.aborted) onAbort()
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutBytes >= 64_000) return
      const retained = chunk.subarray(0, 64_000 - stdoutBytes)
      stdout.push(retained)
      stdoutBytes += retained.length
    })
    child.stderr.resume()
    child.stdin.on("error", () => {})
    child.once("error", (cause: NodeJS.ErrnoException) => {
      finish({ kind: "spawn-error", notFound: cause.code === "ENOENT" })
    })
    child.once("close", (exitCode) => {
      finish({ kind: "completed", exitCode, stdout: Buffer.concat(stdout).toString("utf8") })
    })
    child.stdin.end(stdin)
  })
}

function githubEnvironment(): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !/^BROWSERRIG_SECRET_[1-9][0-9]*$/.test(name)),
    ),
    GH_PROMPT_DISABLED: "1",
    NO_COLOR: "1",
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
