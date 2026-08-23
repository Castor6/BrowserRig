import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { readExtensionVersions } from "./extension-version.js"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

export async function syncExtensionVersion(workspaceRoot: string): Promise<boolean> {
  const versions = await readExtensionVersions(workspaceRoot)
  if (versions.manifest === versions.package) return false

  const manifestPath = path.join(workspaceRoot, "extension", "manifest.json")
  const manifest = await fs.readFile(manifestPath, "utf8")
  const versionPattern = /(\"version\"\s*:\s*\")[^\"]+(\")/
  if (!versionPattern.test(manifest)) {
    throw new Error("Extension manifest version field was not found")
  }
  await fs.writeFile(manifestPath, manifest.replace(versionPattern, `$1${versions.package}$2`))
  return true
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const changed = await syncExtensionVersion(root)
  const versions = await readExtensionVersions(root)
  console.log(`Extension manifest version ${changed ? "updated to" : "already matches"} ${versions.package}`)
}
