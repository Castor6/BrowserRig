import fs from "node:fs/promises"
import path from "node:path"

import { isChromeExtensionVersion } from "./package-extension.js"

export const extensionPackageName = "browserrig-extension"

export interface ExtensionVersions {
  readonly manifest: string
  readonly package: string
}

export async function readExtensionVersions(root: string): Promise<ExtensionVersions> {
  const [manifest, packageJson] = await Promise.all([
    readJsonObject(path.join(root, "extension", "manifest.json")),
    readJsonObject(path.join(root, "extension", "package.json")),
  ])
  const manifestVersion = Reflect.get(manifest, "version")
  const packageName = Reflect.get(packageJson, "name")
  const packageVersion = Reflect.get(packageJson, "version")
  const isPrivate = Reflect.get(packageJson, "private")
  if (packageName !== extensionPackageName || isPrivate !== true) {
    throw new Error(`Extension package must be the private ${extensionPackageName} Changesets package`)
  }
  if (typeof manifestVersion !== "string" || !isChromeExtensionVersion(manifestVersion)) {
    throw new Error("Extension manifest has an invalid Chrome version")
  }
  if (typeof packageVersion !== "string" || !isChromeExtensionVersion(packageVersion)) {
    throw new Error("Extension package has an invalid Chrome version")
  }
  return { manifest: manifestVersion, package: packageVersion }
}

export function compareExtensionVersions(left: string, right: string): number {
  if (!isChromeExtensionVersion(left) || !isChromeExtensionVersion(right)) {
    throw new Error("Cannot compare invalid Chrome extension versions")
  }
  const leftParts = left.split(".").map(Number)
  const rightParts = right.split(".").map(Number)
  for (let index = 0; index < 4; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return 0
}

export function jsonWithoutVersion(text: string): string {
  const parsed: unknown = JSON.parse(text)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Versioned JSON file must contain an object")
  }
  const copy = { ...parsed }
  Reflect.deleteProperty(copy, "version")
  return JSON.stringify(copy)
}

async function readJsonObject(file: string): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"))
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path.basename(file)} must contain an object`)
  }
  return parsed as Record<string, unknown>
}
