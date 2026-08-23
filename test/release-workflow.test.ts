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
  it("publishes only an immutable candidate from a merged Version Packages pull request", () => {
    const publishJob = candidateWorkflow.slice(candidateWorkflow.indexOf("  publish-npm:"))

    expect(publishJob).toContain("github.event_name == 'pull_request'")
    expect(publishJob).toContain("github.event.pull_request.merged == true")
    expect(publishJob).toContain("github.event.pull_request.head.ref == 'changeset-release/main'")
    expect(publishJob).toContain("github.event.pull_request.head.repo.full_name == github.repository")
    expect(publishJob).toContain("needs: package")
    expect(publishJob).toContain("environment: npm-publishing")
    expect(publishJob).toContain("id-token: write")
    expect(publishJob).toContain("actions/download-artifact@v8")
    expect(publishJob).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/)
    expect(candidateWorkflow.match(/browserrig-release-candidate-v1-/g)).toHaveLength(2)
    expect(publishJob).toContain("node scripts/release-manifest.ts --verify --artifacts artifacts")
    expect(publishJob).toContain("value.manifest.commit !== process.argv[2]")
    expect(publishJob).not.toContain("pnpm install")
    expect(publishJob).toContain("npm publish")
    expect(publishJob).not.toContain("npm stage publish")
    expect(publishJob.trimEnd()).toMatch(/--registry=https:\/\/registry\.npmjs\.org$/)
  })

  it("retains the complete candidate without publishing a manual rebuild", () => {
    expect(candidateWorkflow).toContain("retention-days: 90")
    expect(candidateWorkflow).toContain("artifacts/release-manifest.json")
    expect(candidateWorkflow).toContain("artifacts/SHA256SUMS")
    expect(candidateWorkflow).toContain("github.event_name == 'workflow_dispatch'")

    const publishJob = candidateWorkflow.slice(candidateWorkflow.indexOf("  publish-npm:"))
    expect(publishJob).not.toContain("github.event_name == 'workflow_dispatch'")
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
