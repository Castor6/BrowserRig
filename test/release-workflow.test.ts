import fs from "node:fs/promises"
import path from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

let candidateWorkflow = ""
let finalizerWorkflow = ""

beforeAll(async () => {
  const workflows = path.join(process.cwd(), ".github", "workflows")
  ;[candidateWorkflow, finalizerWorkflow] = await Promise.all([
    fs.readFile(path.join(workflows, "release.yml"), "utf8"),
    fs.readFile(path.join(workflows, "publish-github-release.yml"), "utf8"),
  ])
})

describe("release workflows", () => {
  it("stages the immutable candidate with OIDC and leaves approval to the maintainer", () => {
    const job = candidateWorkflow.slice(candidateWorkflow.indexOf("  publish-npm:"))
    expect(job).toContain("github.event.pull_request.merged == true")
    expect(job).toContain("github.event.pull_request.head.ref == 'changeset-release/main'")
    expect(job).toContain("github.event.pull_request.head.repo.full_name == github.repository")
    expect(job).toContain("needs: package")
    expect(job).toContain("environment: npm-publishing")
    expect(job).toContain("id-token: write")
    expect(job).toContain("name: ${{ needs.package.outputs.artifact-name }}")
    expect(job).toContain("node scripts/release-manifest.ts --verify --artifacts artifacts")
    expect(job).toContain("value.manifest.commit !== process.argv[2]")
    expect(job).toContain('npm stage publish "${{ steps.candidate.outputs.npm-artifact }}"')
    expect(job).toContain("--provenance")
    expect(job).toContain("GITHUB_STEP_SUMMARY")
    expect(job).not.toContain("pnpm install")
    expect(job).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|npm publish /)
    expect(candidateWorkflow).not.toContain("publish-extension:")
    expect(candidateWorkflow).not.toContain("google-github-actions/auth")
  })

  it("requires exact version confirmation for manual staging and isolates build-only artifacts", () => {
    expect(candidateWorkflow).toContain("inputs.confirm_package == 'BrowserRig'")
    expect(candidateWorkflow).toContain("inputs.stage_version != ''")
    expect(candidateWorkflow).toContain("github.ref == 'refs/heads/main'")
    expect(candidateWorkflow).toContain("STAGE_VERSION: ${{ inputs.stage_version }}")
    expect(candidateWorkflow).toContain("requested !== version")
    expect(candidateWorkflow).toContain("'browserrig-release-candidate-v2-' : 'browserrig-build-only-'")
    expect(candidateWorkflow).toContain("retention-days: 90")
    expect(candidateWorkflow).toContain("artifacts/release-manifest.json")
    expect(candidateWorkflow).toContain("artifacts/SHA256SUMS")
  })

  it("checks every five minutes or manually and gates Store submission on verified npm publication", () => {
    expect(finalizerWorkflow).toContain('cron: "*/5 * * * *"')
    expect(finalizerWorkflow).toContain("workflow_dispatch:")
    expect(finalizerWorkflow).toContain("actions: read")
    expect(finalizerWorkflow).toContain("contents: write")
    expect(finalizerWorkflow).toContain("id-token: write")
    expect(finalizerWorkflow).toContain("environment: chrome-web-store-publishing")
    expect(finalizerWorkflow).toContain("github.repository == 'Castor6/BrowserRig'")
    expect(finalizerWorkflow).toContain("github.ref == 'refs/heads/main'")
    expect(finalizerWorkflow).toContain("ref: ${{ github.sha }}")
    expect(finalizerWorkflow).toContain("pnpm release:github --workflow release.yml --publish-extension")
    expect(finalizerWorkflow).toContain("google-github-actions/auth@v3")
    expect(finalizerWorkflow).toContain("create_credentials_file: false")
    expect(finalizerWorkflow).toContain("access_token_scopes: https://www.googleapis.com/auth/chromewebstore")
    expect(finalizerWorkflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN|credentials_json|SERVICE_ACCOUNT_KEY|REFRESH_TOKEN|CLIENT_SECRET/)
  })
})
