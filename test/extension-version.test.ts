import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  changesetReleaseType,
  hasExtensionPayloadChanges,
  highestChangesetReleaseType,
  missingExtensionChangesetPackages,
  releaseTypeAtLeast,
} from "../scripts/check-extension-release.js"
import { compareExtensionVersions, jsonWithoutVersion, readExtensionVersions } from "../scripts/extension-version.js"
import { syncExtensionVersion } from "../scripts/sync-extension-version.js"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe("extension Changesets versioning", () => {
  it("compares Chrome extension versions with missing components treated as zero", () => {
    expect(compareExtensionVersions("0.1.1", "0.1.0")).toBe(1)
    expect(compareExtensionVersions("0.1", "0.1.0")).toBe(0)
    expect(compareExtensionVersions("1.0.0", "2.0.0")).toBe(-1)
  })

  it("ignores only the version field when comparing JSON metadata", () => {
    expect(jsonWithoutVersion('{"name":"BrowserRig","version":"0.1.0"}')).toBe(
      jsonWithoutVersion('{"name":"BrowserRig","version":"0.1.1"}'),
    )
    expect(jsonWithoutVersion('{"name":"BrowserRig","version":"0.1.0"}')).not.toBe(
      jsonWithoutVersion('{"name":"New name","version":"0.1.0"}'),
    )
  })

  it("recognizes independent package release intent in Changeset frontmatter", () => {
    const changeset = '---\n"browserrig": minor\n"browserrig-extension": patch\n---\n\nRefresh icons.\n'
    expect(changesetReleaseType(changeset, "browserrig-extension")).toBe("patch")
    expect(changesetReleaseType(changeset, "browserrig")).toBe("minor")
    expect(changesetReleaseType(changeset, "another-package")).toBeNull()
    expect(highestChangesetReleaseType([changeset], "browserrig")).toBe("minor")
    expect(releaseTypeAtLeast("minor", "patch")).toBe(true)
    expect(releaseTypeAtLeast("patch", "minor")).toBe(false)
    expect(missingExtensionChangesetPackages([changeset])).toEqual([])
    expect(missingExtensionChangesetPackages(['---\n"browserrig-extension": patch\n---\n'])).toEqual(["browserrig"])
  })

  it("distinguishes generated version metadata from packaged extension changes", () => {
    const baseManifest = '{"name":"BrowserRig","version":"0.1.0"}'
    const currentManifest = '{"name":"BrowserRig","version":"0.1.1"}'
    const basePackage = '{"name":"browserrig-extension","version":"0.1.0","private":true}'
    const currentPackage = '{"name":"browserrig-extension","version":"0.1.1","private":true}'
    expect(hasExtensionPayloadChanges(
      ["extension/CHANGELOG.md", "extension/manifest.json", "extension/package.json"],
      baseManifest,
      currentManifest,
      basePackage,
      currentPackage,
    )).toBe(false)
    expect(hasExtensionPayloadChanges(
      ["extension/icons/icon-128.png"],
      baseManifest,
      currentManifest,
      basePackage,
      currentPackage,
    )).toBe(true)
  })

  it("synchronizes the private package version into the Chrome manifest", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "browserrig-extension-version-"))
    temporaryDirectories.push(directory)
    await fs.mkdir(path.join(directory, "extension"))
    await Promise.all([
      fs.writeFile(
        path.join(directory, "extension", "package.json"),
        '{\n  "name": "browserrig-extension",\n  "version": "0.1.1",\n  "private": true\n}\n',
      ),
      fs.writeFile(
        path.join(directory, "extension", "manifest.json"),
        '{\n  "manifest_version": 3,\n  "name": "BrowserRig",\n  "version": "0.1.0"\n}\n',
      ),
    ])

    await expect(syncExtensionVersion(directory)).resolves.toBe(true)
    await expect(readExtensionVersions(directory)).resolves.toEqual({ manifest: "0.1.1", package: "0.1.1" })
    await expect(syncExtensionVersion(directory)).resolves.toBe(false)
  })
})
