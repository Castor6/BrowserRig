import fs from "node:fs/promises"
import path from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

let candidateWorkflow = ""
let finalizerWorkflow = ""

beforeAll(async () => {
  const workflows = path.join(process.cwd(), ".github", "workflows")
  const [candidate, finalizer] = await Promise.all([
    fs.readFile(path.join(workflows, "release.yml"), "utf8"),
    fs.readFile(path.join(workflows, "publish-github-release.yml"), "utf8"),
  ])
  candidateWorkflow = candidate
  finalizerWorkflow = finalizer
})

describe("release workflows", () => {
  it("stages only an immutable candidate from a merged Version Packages pull request", () => {
    const stageJob = candidateWorkflow.slice(candidateWorkflow.indexOf("  stage-npm:"))

    expect(stageJob).toContain("github.event_name == 'pull_request'")
    expect(stageJob).toContain("github.event.pull_request.merged == true")
    expect(stageJob).toContain("github.event.pull_request.head.ref == 'changeset-release/main'")
    expect(stageJob).toContain("github.event.pull_request.head.repo.full_name == github.repository")
    expect(stageJob).toContain("needs: package")
    expect(stageJob).toContain("environment: npm-staging")
    expect(stageJob).toContain("id-token: write")
    expect(stageJob).toContain("actions/download-artifact@v8")
    expect(candidateWorkflow.match(/browserrig-release-candidate-v1-/g)).toHaveLength(2)
    expect(stageJob).toContain("node scripts/release-manifest.ts --verify --artifacts artifacts")
    expect(stageJob).toContain("value.manifest.commit !== process.argv[2]")
    expect(stageJob).not.toContain("pnpm install")
    expect(stageJob).toContain("npm stage publish")
    expect(stageJob).not.toMatch(/\bnpm publish\b/)
    expect(stageJob.trimEnd()).toMatch(/--registry=https:\/\/registry\.npmjs\.org$/)
  })

  it("retains the complete candidate without staging a manual rebuild", () => {
    expect(candidateWorkflow).toContain("retention-days: 90")
    expect(candidateWorkflow).toContain("artifacts/release-manifest.json")
    expect(candidateWorkflow).toContain("artifacts/SHA256SUMS")
    expect(candidateWorkflow).toContain("github.event_name == 'workflow_dispatch'")

    const stageJob = candidateWorkflow.slice(candidateWorkflow.indexOf("  stage-npm:"))
    expect(stageJob).not.toContain("github.event_name == 'workflow_dispatch'")
  })

  it("finalizes from main with GitHub-only least privilege", () => {
    expect(finalizerWorkflow).toContain("cron: \"17,47 * * * *\"")
    expect(finalizerWorkflow).toContain("workflow_dispatch:")
    expect(finalizerWorkflow).toContain("actions: read")
    expect(finalizerWorkflow).toContain("contents: write")
    expect(finalizerWorkflow).not.toContain("id-token:")
    expect(finalizerWorkflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/)
    expect(finalizerWorkflow).toContain("github.repository == 'Castor6/BrowserRig'")
    expect(finalizerWorkflow).toContain("github.ref == 'refs/heads/main'")
    expect(finalizerWorkflow).toContain("ref: ${{ github.sha }}")
    expect(finalizerWorkflow).toContain("pnpm release:github --workflow release.yml")
  })
})
