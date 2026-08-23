import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { fileURLToPath, pathToFileURL } from "node:url"

import {
  compareExtensionVersions,
  extensionPackageName,
  jsonWithoutVersion,
  readExtensionVersions,
} from "./extension-version.js"

const execFileAsync = promisify(execFile)
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const npmPackageName = "browserrig"

export function changesetDeclaresRelease(text: string, packageName: string): boolean {
  const frontmatter = /^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/.exec(text)?.[1]
  return frontmatter?.split("\n").some((line) => {
    const match = /^\s*[\"']?([^\"']+)[\"']?\s*:\s*(patch|minor|major)\s*$/.exec(line)
    return match?.[1] === packageName
  }) ?? false
}

export function missingExtensionChangesetPackages(changesets: readonly string[]): string[] {
  return [npmPackageName, extensionPackageName].filter((packageName) =>
    !changesets.some((changeset) => changesetDeclaresRelease(changeset, packageName))
  )
}

export function hasExtensionPayloadChanges(
  changedFiles: readonly string[],
  baseManifest: string,
  currentManifest: string,
  basePackage: string | null,
  currentPackage: string,
): boolean {
  if (jsonWithoutVersion(baseManifest) !== jsonWithoutVersion(currentManifest)) return true
  if (basePackage && jsonWithoutVersion(basePackage) !== jsonWithoutVersion(currentPackage)) return true
  return changedFiles.some((file) =>
    (
      file.startsWith("extension/") &&
        file !== "extension/CHANGELOG.md" &&
        file !== "extension/manifest.json" &&
        file !== "extension/package.json" &&
        !file.startsWith("extension/dist/")
    ) || file === "scripts/build-extension.ts" || file === "scripts/package-extension.ts"
  )
}

async function checkExtensionRelease(base: string, allowVersionUpdate: boolean): Promise<void> {
  const versions = await readExtensionVersions(root)
  if (versions.manifest !== versions.package) {
    throw new Error(
      `Extension manifest ${versions.manifest} must match private package ${versions.package}. ` +
      "Run pnpm sync:extension-version after applying Changesets.",
    )
  }

  const [changedOutput, baseManifest, basePackage, currentManifest, currentPackage] = await Promise.all([
    git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]),
    git(["show", `${base}:extension/manifest.json`]),
    gitOptional(["show", `${base}:extension/package.json`]),
    fs.readFile(path.join(root, "extension", "manifest.json"), "utf8"),
    fs.readFile(path.join(root, "extension", "package.json"), "utf8"),
  ])
  const changedFiles = changedOutput.split("\n").filter(Boolean)
  const baseVersion = basePackage ? packageVersion(basePackage) : versions.package
  const versionChanged = basePackage !== null && versions.package !== baseVersion
  if (versionChanged && !allowVersionUpdate) {
    throw new Error("Extension versions are updated only by the Version Packages pull request")
  }
  if (versionChanged && compareExtensionVersions(versions.package, baseVersion) <= 0) {
    throw new Error(`Extension version ${versions.package} must be greater than ${baseVersion}`)
  }

  const payloadChanged = hasExtensionPayloadChanges(
    changedFiles,
    baseManifest,
    currentManifest,
    basePackage,
    currentPackage,
  )
  if (allowVersionUpdate) {
    if (payloadChanged) throw new Error("Version Packages pull requests must contain only generated extension metadata")
    return
  }
  if (!payloadChanged) return

  const changesetFiles = changedFiles.filter((file) => /^\.changeset\/[^/]+\.md$/.test(file))
  const changesets = await Promise.all(changesetFiles.map((file) => fs.readFile(path.join(root, file), "utf8")))
  const missingPackages = missingExtensionChangesetPackages(changesets)
  if (missingPackages.length > 0) {
    throw new Error(
      `Extension package content changed without Changeset entries for ${missingPackages.join(" and ")}. ` +
      "Run pnpm changeset and select patch, minor, or major for both shipped packages.",
    )
  }
}

function packageVersion(text: string): string {
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Extension package must contain an object")
  }
  const version = Reflect.get(parsed, "version")
  if (typeof version !== "string") throw new Error("Extension package version must be a string")
  return version
}

async function git(args: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" })
  return result.stdout.trim()
}

async function gitOptional(args: readonly string[]): Promise<string | null> {
  try {
    return await git(args)
  } catch {
    return null
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2)
  const baseIndex = args.indexOf("--base")
  const base = baseIndex >= 0 ? args[baseIndex + 1] : undefined
  if (!base) throw new Error("Usage: check-extension-release --base <commit> [--allow-version-update]")
  await checkExtensionRelease(base, args.includes("--allow-version-update"))
  console.log("Extension release intent is valid")
}
