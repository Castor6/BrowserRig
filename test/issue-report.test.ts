import { Effect } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  githubBody,
  recordIssueReport,
  sanitizeIssueText,
  submitIssueToGitHub,
  type StoredIssueReport,
} from "../src/issue-report.ts"
import { appendJournalEntry, makeJournalEntry } from "../src/session-journal.ts"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function temporaryStore(): Promise<{ readonly baseDir: string; readonly journalBaseDir: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "browserrig-issue-report-"))
  temporaryDirectories.push(root)
  return {
    baseDir: path.join(root, "issues"),
    journalBaseDir: path.join(root, "sessions"),
  }
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    classification: "operational" as const,
    component: "relay",
    summary: "Relay recovered after a failed start",
    actual: "The first start failed and the second start succeeded.",
    surface: "cli" as const,
    ...overrides,
  }
}

describe("BrowserRig issue reports", () => {
  it("persists a sanitized operational report with restrictive permissions", async () => {
    const store = await temporaryStore()
    const result = await Effect.runPromise(recordIssueReport(baseInput({
      error: "Authorization: Bearer secret-token\nAt https://private.example/account?token=secret for user@example.com",
    }), {
      ...store,
      now: () => new Date("2026-08-24T12:24:00.000Z"),
      randomUUID: () => "abcdef00-0000-0000-0000-000000000000",
    }))

    expect(result).toMatchObject({
      created: true,
      classification: "operational",
      occurrences: 1,
      submission: { status: "not-eligible" },
    })
    const report = JSON.parse(await fs.readFile(result.localPath, "utf8")) as StoredIssueReport
    expect(report.error).toContain("Authorization=[REDACTED]")
    expect(report.error).toContain("[URL REDACTED]")
    expect(report.error).toContain("[EMAIL REDACTED]")
    expect(report.error).not.toMatch(/secret-token|private\.example|user@example\.com/)
    if (process.platform !== "win32") {
      expect((await fs.stat(store.baseDir)).mode & 0o777).toBe(0o700)
      expect((await fs.stat(result.localPath)).mode & 0o777).toBe(0o600)
    }
  })

  it("aggregates one fingerprint and submits only after suspected-bug escalation", async () => {
    const store = await temporaryStore()
    const submitter = vi.fn((report: StoredIssueReport) => Effect.succeed({
      status: "submitted" as const,
      attemptedAt: report.updatedAt,
      githubUrl: "https://github.com/Castor6/BrowserRig/issues/99",
    }))
    const times = [
      new Date("2026-08-24T12:24:00.000Z"),
      new Date("2026-08-24T12:25:00.000Z"),
      new Date("2026-08-24T12:26:00.000Z"),
    ]
    const now = () => times.shift() ?? new Date("2026-08-24T12:27:00.000Z")

    const first = await Effect.runPromise(recordIssueReport(baseInput(), {
      ...store,
      now,
      randomUUID: () => "abcdef00-0000-0000-0000-000000000000",
      autoSubmit: true,
      githubSubmitter: submitter,
    }))
    const second = await Effect.runPromise(recordIssueReport(baseInput({
      classification: "suspected-bug",
      recovery: "Restarting the relay failed twice.",
    }), {
      ...store,
      now,
      randomUUID: () => "ignored",
      autoSubmit: true,
      githubSubmitter: submitter,
    }))
    const third = await Effect.runPromise(recordIssueReport(baseInput({
      classification: "suspected-bug",
    }), {
      ...store,
      now,
      randomUUID: () => "ignored",
      autoSubmit: true,
      githubSubmitter: submitter,
    }))

    expect(first.submission.status).toBe("not-eligible")
    expect(second).toMatchObject({
      reportId: first.reportId,
      created: false,
      classification: "suspected-bug",
      occurrences: 2,
      submission: { status: "submitted", githubUrl: "https://github.com/Castor6/BrowserRig/issues/99" },
    })
    expect(third).toMatchObject({ reportId: first.reportId, occurrences: 3, submission: { status: "submitted" } })
    expect(submitter).toHaveBeenCalledTimes(1)
  })

  it("never submits security reports even when automatic submission is enabled", async () => {
    const store = await temporaryStore()
    const submitter = vi.fn(() => Effect.succeed({ status: "submitted" as const }))

    const result = await Effect.runPromise(recordIssueReport(baseInput({
      classification: "security",
      summary: "Potential credential disclosure",
    }), {
      ...store,
      autoSubmit: true,
      githubSubmitter: submitter,
    }))

    expect(result.submission.status).toBe("not-eligible")
    expect(submitter).not.toHaveBeenCalled()
  })

  it("references relevant journal timestamps without copying execute material", async () => {
    const store = await temporaryStore()
    await appendJournalEntry({
      baseDir: store.journalBaseDir,
      entry: makeJournalEntry({
        sessionId: "calm-falcon-667",
        code: "return 'private execute material'",
        isError: true,
        durationMs: 10,
        resultText: "private result material",
        logCount: 0,
        diagnostic: "execution-context/context-destroyed",
      }),
    })

    const result = await Effect.runPromise(recordIssueReport(baseInput({
      primarySessionId: "calm-falcon-667",
      relatedSessionIds: ["recovery-session"],
    }), store))
    const report = JSON.parse(await fs.readFile(result.localPath, "utf8")) as StoredIssueReport

    expect(report.journalReferences).toEqual([{
      sessionId: "calm-falcon-667",
      timestamp: expect.any(String),
    }])
    expect(report.relatedSessionIds).toEqual(["recovery-session"])
    expect(JSON.stringify(report)).not.toMatch(/private execute material|private result material/)
  })

  it("renders only the sanitized structured report into the GitHub body", async () => {
    const store = await temporaryStore()
    let submitted: StoredIssueReport | undefined
    await Effect.runPromise(recordIssueReport(baseInput({
      classification: "suspected-bug",
      error: "Cookie: session=private at https://example.com/account",
    }), {
      ...store,
      autoSubmit: true,
      githubSubmitter: (report) => {
        submitted = report
        return Effect.succeed({ status: "unavailable" as const, reason: "test" })
      },
    }))

    const body = githubBody(submitted!)
    expect(body).toContain("browserrig-agent-report:v1")
    expect(body).toContain("Cookie=[REDACTED]")
    expect(body).not.toMatch(/session=private|example\.com/)
  })

  it("rejects invalid report metadata before writing", async () => {
    const store = await temporaryStore()
    await expect(Effect.runPromise(recordIssueReport(baseInput({
      component: "Relay Core",
    }), store))).rejects.toThrow("component must use lowercase")
    await expect(fs.readdir(store.baseDir)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it.skipIf(process.platform === "win32")("checks gh auth, deduplicates, and creates with fixed argv plus stdin", async () => {
    const store = await temporaryStore()
    const binDir = path.join(path.dirname(store.baseDir), "bin")
    const capturePath = path.join(path.dirname(store.baseDir), "capture.json")
    await fs.mkdir(binDir)
    const fakeGh = path.join(binDir, "gh")
    await fs.writeFile(fakeGh, [
      `#!${process.execPath}`,
      "const fs = require('node:fs')",
      "const args = process.argv.slice(2)",
      "if (args[0] === 'auth') process.exit(0)",
      "if (args[0] === 'issue' && args[1] === 'list') { process.stdout.write(process.env.GH_FAKE_EXISTING ? JSON.stringify([{ number: 77, url: 'https://github.com/Castor6/BrowserRig/issues/77' }]) : '[]'); process.exit(0) }",
      "let body = ''",
      "process.stdin.setEncoding('utf8')",
      "process.stdin.on('data', chunk => { body += chunk })",
      "process.stdin.on('end', () => {",
      "  fs.writeFileSync(process.env.GH_FAKE_CAPTURE, JSON.stringify({ args, body }))",
      "  process.stdout.write('https://github.com/Castor6/BrowserRig/issues/123\\n')",
      "})",
    ].join("\n"), { mode: 0o700 })
    vi.stubEnv("PATH", binDir)
    vi.stubEnv("GH_FAKE_CAPTURE", capturePath)
    try {
      const local = await Effect.runPromise(recordIssueReport(baseInput({
        classification: "suspected-bug",
        error: "Bearer private-token",
      }), store))
      const report = JSON.parse(await fs.readFile(local.localPath, "utf8")) as StoredIssueReport
      const submission = await Effect.runPromise(submitIssueToGitHub(report))
      const capture = JSON.parse(await fs.readFile(capturePath, "utf8")) as { args: string[]; body: string }

      expect(submission).toEqual({
        status: "submitted",
        attemptedAt: report.updatedAt,
        githubUrl: "https://github.com/Castor6/BrowserRig/issues/123",
      })
      expect(capture.args).toEqual([
        "issue",
        "create",
        "--repo",
        "Castor6/BrowserRig",
        "--title",
        report.summary,
        "--body-file",
        "-",
      ])
      expect(capture.body).toContain(`browserrig-report:${report.fingerprint}`)
      expect(capture.body).not.toContain("private-token")

      await fs.unlink(capturePath)
      vi.stubEnv("GH_FAKE_EXISTING", "true")
      await expect(Effect.runPromise(submitIssueToGitHub(report))).resolves.toEqual({
        status: "submitted",
        attemptedAt: report.updatedAt,
        githubUrl: "https://github.com/Castor6/BrowserRig/issues/77",
      })
      await expect(fs.access(capturePath)).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("keeps the local report when gh is unavailable", async () => {
    const store = await temporaryStore()
    const emptyPath = path.join(path.dirname(store.baseDir), "empty-path")
    await fs.mkdir(emptyPath)
    const local = await Effect.runPromise(recordIssueReport(baseInput({
      classification: "suspected-bug",
    }), store))
    const report = JSON.parse(await fs.readFile(local.localPath, "utf8")) as StoredIssueReport
    vi.stubEnv("PATH", emptyPath)
    try {
      await expect(Effect.runPromise(submitIssueToGitHub(report))).resolves.toMatchObject({
        status: "unavailable",
        reason: "gh-not-found",
      })
      await expect(fs.access(local.localPath)).resolves.toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe("issue report redaction", () => {
  it("bounds retained text", () => {
    expect(sanitizeIssueText("x".repeat(10), 5)).toBe("xxxxx… [truncated 5 chars]")
  })
})

describe("issue report agent guidance", () => {
  it("uses the BrowserRig-owned sink instead of caller workspace tracking files", async () => {
    const skill = await fs.readFile(path.join(process.cwd(), "skills", "browserrig", "SKILL.md"), "utf8")
    expect(skill).toContain("browserrig issue report")
    expect(skill).toContain("Never create or modify files in the caller workspace")
    expect(skill).not.toContain("project todo")
  })
})
