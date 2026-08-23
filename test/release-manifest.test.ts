import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  createReleaseManifest,
  isStableVersion,
  parseReleaseManifest,
  renderSha256Sums,
  serializeReleaseManifest,
  validateReleaseManifest,
  verifyReleaseArtifacts,
  type ReleaseManifest,
} from "../scripts/release-manifest.js"
import { extensionProtocolVersion } from "../src/protocol.js"

const temporaryDirectories: string[] = []
const commit = "0123456789abcdef0123456789abcdef01234567"

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe("release candidate manifest", () => {
  it("records independent stable versions, source protocol, and deterministic digests", async () => {
    const fixture = await makeFixture()
    const first = await createReleaseManifest({
      root: fixture.root,
      artifactsDirectory: fixture.artifacts,
      commit,
    })
    const manifestText = await fs.readFile(path.join(fixture.artifacts, "release-manifest.json"), "utf8")
    const checksums = await fs.readFile(path.join(fixture.artifacts, "SHA256SUMS"), "utf8")

    expect(first).toEqual({
      schemaVersion: 1,
      tag: "v1.2.3",
      commit,
      npm: {
        name: "browserrig",
        version: "1.2.3",
        file: "browserrig-1.2.3.tgz",
        sha256: digest("sha256", fixture.npmBytes, "hex"),
        integrity: `sha512-${digest("sha512", fixture.npmBytes, "base64")}`,
      },
      extension: {
        name: "browserrig-extension",
        version: "0.4.5",
        protocolVersion: extensionProtocolVersion,
        file: "browserrig-extension-0.4.5.zip",
        sha256: digest("sha256", fixture.extensionBytes, "hex"),
      },
    })
    expect(manifestText).toBe(serializeReleaseManifest(first))
    expect(parseReleaseManifest(manifestText)).toEqual(first)
    expect(checksums).toBe(renderSha256Sums(first))
    expect(checksums).toBe([
      `${first.npm.sha256}  ${first.npm.file}\n`,
      `${first.extension.sha256}  ${first.extension.file}\n`,
    ].join(""))

    const second = await createReleaseManifest({
      root: fixture.root,
      artifactsDirectory: fixture.artifacts,
      commit,
    })
    expect(second).toEqual(first)
    expect(await fs.readFile(path.join(fixture.artifacts, "release-manifest.json"), "utf8")).toBe(manifestText)
    expect(await fs.readFile(path.join(fixture.artifacts, "SHA256SUMS"), "utf8")).toBe(checksums)
  })

  it("verifies the exact four-file candidate and returns safe resolved paths", async () => {
    const fixture = await makeFixture()
    const manifest = await createReleaseManifest({
      root: fixture.root,
      artifactsDirectory: fixture.artifacts,
      commit,
    })

    await expect(verifyReleaseArtifacts(fixture.artifacts)).resolves.toEqual({
      manifest,
      npmArtifactPath: path.join(fixture.artifacts, manifest.npm.file),
      extensionArtifactPath: path.join(fixture.artifacts, manifest.extension.file),
    })
  })

  it("rejects unstable or inconsistent source versions and invalid commits", async () => {
    expect(isStableVersion("1.2.3")).toBe(true)
    expect(isStableVersion("1.2.3-rc.1")).toBe(false)
    expect(isStableVersion("01.2.3")).toBe(false)

    const mismatched = await makeFixture({ extensionManifestVersion: "0.4.6" })
    await expect(createReleaseManifest({
      root: mismatched.root,
      artifactsDirectory: mismatched.artifacts,
      commit,
    })).rejects.toThrow("Extension package and manifest versions differ")

    const prerelease = await makeFixture({ rootVersion: "1.2.3-rc.1" })
    await expect(createReleaseManifest({
      root: prerelease.root,
      artifactsDirectory: prerelease.artifacts,
      commit,
    })).rejects.toThrow("stable x.y.z")

    const valid = await makeFixture()
    await expect(createReleaseManifest({
      root: valid.root,
      artifactsDirectory: valid.artifacts,
      commit: "ABC",
    })).rejects.toThrow("lowercase 40-character SHA")
  })

  it("rejects missing, extra, and non-regular candidate entries", async () => {
    const missing = await makeFixture()
    await fs.rm(path.join(missing.artifacts, "browserrig-extension-0.4.5.zip"))
    await expect(createReleaseManifest({
      root: missing.root,
      artifactsDirectory: missing.artifacts,
      commit,
    })).rejects.toThrow("is missing")

    const extra = await makeFixture()
    await fs.writeFile(path.join(extra.artifacts, "browserrig-9.9.9.tgz"), "old candidate")
    await expect(createReleaseManifest({
      root: extra.root,
      artifactsDirectory: extra.artifacts,
      commit,
    })).rejects.toThrow("unexpected file")

    const linked = await makeFixture()
    const extensionPath = path.join(linked.artifacts, "browserrig-extension-0.4.5.zip")
    await fs.rm(extensionPath)
    await fs.symlink(path.join(linked.root, "extension", "manifest.json"), extensionPath)
    await expect(createReleaseManifest({
      root: linked.root,
      artifactsDirectory: linked.artifacts,
      commit,
    })).rejects.toThrow("unsupported entry")

    const linkedManifest = await makeFixture()
    await createReleaseManifest({
      root: linkedManifest.root,
      artifactsDirectory: linkedManifest.artifacts,
      commit,
    })
    const manifestPath = path.join(linkedManifest.artifacts, "release-manifest.json")
    await fs.rm(manifestPath)
    await fs.symlink(path.join(linkedManifest.root, "package.json"), manifestPath)
    await expect(verifyReleaseArtifacts(linkedManifest.artifacts)).rejects.toThrow("unsupported entry")
  })

  it("strictly validates manifest fields, file names, bytes, and SHA256SUMS", async () => {
    const unsafe = validManifest()
    const unsafeValue = JSON.parse(serializeReleaseManifest(unsafe)) as Record<string, unknown>
    const npm = unsafeValue.npm as Record<string, unknown>
    npm.file = "../browserrig-1.2.3.tgz"
    expect(() => validateReleaseManifest(unsafeValue)).toThrow("without path components")

    const unknownField = JSON.parse(serializeReleaseManifest(unsafe)) as Record<string, unknown>
    unknownField.extra = true
    expect(() => validateReleaseManifest(unknownField)).toThrow("unexpected fields")

    const tamperedArtifact = await makeFixture()
    await createReleaseManifest({
      root: tamperedArtifact.root,
      artifactsDirectory: tamperedArtifact.artifacts,
      commit,
    })
    await fs.appendFile(path.join(tamperedArtifact.artifacts, "browserrig-1.2.3.tgz"), "tampered")
    await expect(verifyReleaseArtifacts(tamperedArtifact.artifacts)).rejects.toThrow("sha256 mismatch")

    const tamperedChecksums = await makeFixture()
    await createReleaseManifest({
      root: tamperedChecksums.root,
      artifactsDirectory: tamperedChecksums.artifacts,
      commit,
    })
    await fs.appendFile(path.join(tamperedChecksums.artifacts, "SHA256SUMS"), "\n")
    await expect(verifyReleaseArtifacts(tamperedChecksums.artifacts)).rejects.toThrow("does not exactly match")

    const extraAfterCreation = await makeFixture()
    await createReleaseManifest({
      root: extraAfterCreation.root,
      artifactsDirectory: extraAfterCreation.artifacts,
      commit,
    })
    await fs.writeFile(path.join(extraAfterCreation.artifacts, "notes.txt"), "unexpected")
    await expect(verifyReleaseArtifacts(extraAfterCreation.artifacts)).rejects.toThrow("unexpected file")
  })
})

type FixtureOptions = {
  readonly rootVersion?: string
  readonly extensionPackageVersion?: string
  readonly extensionManifestVersion?: string
}

async function makeFixture(options: FixtureOptions = {}): Promise<{
  readonly root: string
  readonly artifacts: string
  readonly npmBytes: Buffer
  readonly extensionBytes: Buffer
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "browserrig-release-manifest-"))
  temporaryDirectories.push(root)
  const artifacts = path.join(root, "artifacts")
  const extension = path.join(root, "extension")
  const rootVersion = options.rootVersion ?? "1.2.3"
  const extensionPackageVersion = options.extensionPackageVersion ?? "0.4.5"
  const extensionManifestVersion = options.extensionManifestVersion ?? extensionPackageVersion
  const npmBytes = Buffer.from("deterministic npm candidate\n")
  const extensionBytes = Buffer.from("deterministic extension candidate\n")
  await Promise.all([fs.mkdir(artifacts), fs.mkdir(extension)])
  await Promise.all([
    fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "browserrig", version: rootVersion })),
    fs.writeFile(
      path.join(extension, "package.json"),
      JSON.stringify({ name: "browserrig-extension", version: extensionPackageVersion, private: true }),
    ),
    fs.writeFile(
      path.join(extension, "manifest.json"),
      JSON.stringify({ manifest_version: 3, name: "BrowserRig", version: extensionManifestVersion }),
    ),
    fs.writeFile(path.join(artifacts, `browserrig-${rootVersion}.tgz`), npmBytes),
    fs.writeFile(path.join(artifacts, `browserrig-extension-${extensionPackageVersion}.zip`), extensionBytes),
  ])
  return { root, artifacts, npmBytes, extensionBytes }
}

function validManifest(): ReleaseManifest {
  return {
    schemaVersion: 1,
    tag: "v1.2.3",
    commit,
    npm: {
      name: "browserrig",
      version: "1.2.3",
      file: "browserrig-1.2.3.tgz",
      sha256: "a".repeat(64),
      integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
    },
    extension: {
      name: "browserrig-extension",
      version: "0.4.5",
      protocolVersion: extensionProtocolVersion,
      file: "browserrig-extension-0.4.5.zip",
      sha256: "b".repeat(64),
    },
  }
}

function digest(algorithm: "sha256" | "sha512", bytes: Uint8Array, encoding: "hex" | "base64"): string {
  return createHash(algorithm).update(bytes).digest(encoding)
}
