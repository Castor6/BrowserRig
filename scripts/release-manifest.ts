import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { extensionProtocolVersion } from "../src/protocol.ts"

const defaultRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const manifestFileName = "release-manifest.json"
const checksumsFileName = "SHA256SUMS"
const npmPackageName = "browserrig"
const extensionPackageName = "browserrig-extension"
const stableVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/
const commitPattern = /^[0-9a-f]{40}$/
const sha256Pattern = /^[0-9a-f]{64}$/
const sha512IntegrityPattern = /^sha512-[A-Za-z0-9+/]{86}==$/

export type ReleaseManifestArtifact = {
  readonly file: string
  readonly sha256: string
}

export type ReleaseManifest = {
  readonly schemaVersion: 1
  readonly tag: string
  readonly commit: string
  readonly npm: ReleaseManifestArtifact & {
    readonly name: typeof npmPackageName
    readonly version: string
    readonly integrity: string
  }
  readonly extension: ReleaseManifestArtifact & {
    readonly name: typeof extensionPackageName
    readonly version: string
    readonly protocolVersion: number
  }
}

export type CreateReleaseManifestOptions = {
  readonly root: string
  readonly artifactsDirectory: string
  readonly commit: string
}

export type VerifiedReleaseArtifacts = {
  readonly manifest: ReleaseManifest
  readonly npmArtifactPath: string
  readonly extensionArtifactPath: string
}

export function isStableVersion(value: string): boolean {
  return stableVersionPattern.test(value)
}

export function validateReleaseManifest(value: unknown): ReleaseManifest {
  const manifest = expectObject(value, "Release manifest")
  expectExactKeys(manifest, ["commit", "extension", "npm", "schemaVersion", "tag"], "Release manifest")
  if (manifest.schemaVersion !== 1) throw new Error("Release manifest schemaVersion must be 1")

  const commit = expectString(manifest.commit, "Release manifest commit")
  if (!commitPattern.test(commit)) throw new Error("Release manifest commit must be a lowercase 40-character SHA")

  const npm = expectObject(manifest.npm, "Release manifest npm entry")
  expectExactKeys(npm, ["file", "integrity", "name", "sha256", "version"], "Release manifest npm entry")
  if (npm.name !== npmPackageName) throw new Error(`Release manifest npm name must be ${npmPackageName}`)
  const npmVersion = expectStableVersion(npm.version, "Release manifest npm version")
  const npmFile = expectSafeFileName(npm.file, "Release manifest npm file")
  if (npmFile !== npmArtifactFileName(npmVersion)) {
    throw new Error(`Release manifest npm file must be ${npmArtifactFileName(npmVersion)}`)
  }
  const npmSha256 = expectSha256(npm.sha256, "Release manifest npm sha256")
  const npmIntegrity = expectString(npm.integrity, "Release manifest npm integrity")
  if (!sha512IntegrityPattern.test(npmIntegrity)) {
    throw new Error("Release manifest npm integrity must be a sha512 SRI digest")
  }

  const extension = expectObject(manifest.extension, "Release manifest extension entry")
  expectExactKeys(
    extension,
    ["file", "name", "protocolVersion", "sha256", "version"],
    "Release manifest extension entry",
  )
  if (extension.name !== extensionPackageName) {
    throw new Error(`Release manifest extension name must be ${extensionPackageName}`)
  }
  const extensionVersion = expectStableVersion(extension.version, "Release manifest extension version")
  const extensionFile = expectSafeFileName(extension.file, "Release manifest extension file")
  if (extensionFile !== extensionArtifactFileName(extensionVersion)) {
    throw new Error(`Release manifest extension file must be ${extensionArtifactFileName(extensionVersion)}`)
  }
  const extensionSha256 = expectSha256(extension.sha256, "Release manifest extension sha256")
  if (!Number.isSafeInteger(extension.protocolVersion) || Number(extension.protocolVersion) <= 0) {
    throw new Error("Release manifest extension protocolVersion must be a positive safe integer")
  }

  const tag = expectString(manifest.tag, "Release manifest tag")
  if (tag !== `v${npmVersion}`) throw new Error(`Release manifest tag must be v${npmVersion}`)

  return {
    schemaVersion: 1,
    tag,
    commit,
    npm: {
      name: npmPackageName,
      version: npmVersion,
      file: npmFile,
      sha256: npmSha256,
      integrity: npmIntegrity,
    },
    extension: {
      name: extensionPackageName,
      version: extensionVersion,
      protocolVersion: Number(extension.protocolVersion),
      file: extensionFile,
      sha256: extensionSha256,
    },
  }
}

export function parseReleaseManifest(text: string): ReleaseManifest {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new Error("Release manifest must contain valid JSON", { cause: error })
  }
  return validateReleaseManifest(value)
}

export function serializeReleaseManifest(manifest: ReleaseManifest): string {
  return `${JSON.stringify(validateReleaseManifest(manifest), null, 2)}\n`
}

export function renderSha256Sums(manifest: ReleaseManifest): string {
  const valid = validateReleaseManifest(manifest)
  return [
    { file: valid.npm.file, sha256: valid.npm.sha256 },
    { file: valid.extension.file, sha256: valid.extension.sha256 },
  ]
    .sort((left, right) => compareText(left.file, right.file))
    .map(({ file, sha256 }) => `${sha256}  ${file}\n`)
    .join("")
}

export async function createReleaseManifest(options: CreateReleaseManifestOptions): Promise<ReleaseManifest> {
  const root = path.resolve(options.root)
  const artifactsDirectory = path.resolve(options.artifactsDirectory)
  if (!commitPattern.test(options.commit)) {
    throw new Error("Release commit must be a lowercase 40-character SHA")
  }

  const rootPackage = await readPackageMetadata(path.join(root, "package.json"), "Root package")
  if (rootPackage.name !== npmPackageName) throw new Error(`Root package name must be ${npmPackageName}`)
  const npmVersion = expectStableVersion(rootPackage.version, "Root package version")

  const extensionPackage = await readPackageMetadata(
    path.join(root, "extension", "package.json"),
    "Extension package",
  )
  if (extensionPackage.name !== extensionPackageName) {
    throw new Error(`Extension package name must be ${extensionPackageName}`)
  }
  const extensionVersion = expectStableVersion(extensionPackage.version, "Extension package version")
  const extensionManifestVersion = await readManifestVersion(path.join(root, "extension", "manifest.json"))
  if (extensionManifestVersion !== extensionVersion) {
    throw new Error(
      `Extension package and manifest versions differ: ${extensionVersion} != ${extensionManifestVersion}`,
    )
  }

  const npmFile = npmArtifactFileName(npmVersion)
  const extensionFile = extensionArtifactFileName(extensionVersion)
  await assertArtifactDirectory(
    artifactsDirectory,
    new Set([npmFile, extensionFile]),
    new Set([manifestFileName, checksumsFileName]),
  )

  const npmBytes = await fs.readFile(resolveArtifactPath(artifactsDirectory, npmFile))
  const extensionBytes = await fs.readFile(resolveArtifactPath(artifactsDirectory, extensionFile))
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    tag: `v${npmVersion}`,
    commit: options.commit,
    npm: {
      name: npmPackageName,
      version: npmVersion,
      file: npmFile,
      sha256: digestHex("sha256", npmBytes),
      integrity: `sha512-${createHash("sha512").update(npmBytes).digest("base64")}`,
    },
    extension: {
      name: extensionPackageName,
      version: extensionVersion,
      protocolVersion: extensionProtocolVersion,
      file: extensionFile,
      sha256: digestHex("sha256", extensionBytes),
    },
  }
  validateReleaseManifest(manifest)

  await fs.writeFile(
    resolveArtifactPath(artifactsDirectory, manifestFileName),
    serializeReleaseManifest(manifest),
  )
  await fs.writeFile(
    resolveArtifactPath(artifactsDirectory, checksumsFileName),
    renderSha256Sums(manifest),
  )
  return manifest
}

export async function verifyReleaseArtifacts(artifactsDirectoryInput: string): Promise<VerifiedReleaseArtifacts> {
  const artifactsDirectory = path.resolve(artifactsDirectoryInput)
  const manifestPath = resolveArtifactPath(artifactsDirectory, manifestFileName)
  await assertRegularFile(manifestPath, manifestFileName)
  const manifest = parseReleaseManifest(await fs.readFile(manifestPath, "utf8"))
  await assertArtifactDirectory(
    artifactsDirectory,
    new Set([manifest.npm.file, manifest.extension.file, manifestFileName, checksumsFileName]),
    new Set(),
  )

  const npmArtifactPath = resolveArtifactPath(artifactsDirectory, manifest.npm.file)
  const extensionArtifactPath = resolveArtifactPath(artifactsDirectory, manifest.extension.file)
  const [npmBytes, extensionBytes, checksums] = await Promise.all([
    fs.readFile(npmArtifactPath),
    fs.readFile(extensionArtifactPath),
    fs.readFile(resolveArtifactPath(artifactsDirectory, checksumsFileName), "utf8"),
  ])
  if (digestHex("sha256", npmBytes) !== manifest.npm.sha256) {
    throw new Error(`Release artifact sha256 mismatch: ${manifest.npm.file}`)
  }
  const npmIntegrity = `sha512-${createHash("sha512").update(npmBytes).digest("base64")}`
  if (npmIntegrity !== manifest.npm.integrity) {
    throw new Error(`Release artifact sha512 integrity mismatch: ${manifest.npm.file}`)
  }
  if (digestHex("sha256", extensionBytes) !== manifest.extension.sha256) {
    throw new Error(`Release artifact sha256 mismatch: ${manifest.extension.file}`)
  }
  if (checksums !== renderSha256Sums(manifest)) {
    throw new Error(`${checksumsFileName} does not exactly match the release manifest`)
  }
  return { manifest, npmArtifactPath, extensionArtifactPath }
}

async function assertRegularFile(file: string, displayName: string): Promise<void> {
  let stats
  try {
    stats = await fs.lstat(file)
  } catch (error) {
    throw new Error(`Release artifacts directory is missing: ${displayName}`, { cause: error })
  }
  if (!stats.isFile()) throw new Error(`Release artifacts directory contains an unsupported entry: ${displayName}`)
}

function expectObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function expectExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort(compareText)
  const sortedExpected = [...expected].sort(compareText)
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} has unexpected fields: ${actual.join(", ")}`)
  }
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`)
  return value
}

function expectStableVersion(value: unknown, label: string): string {
  const version = expectString(value, label)
  if (!isStableVersion(version)) throw new Error(`${label} must be a stable x.y.z version`)
  return version
}

function expectSha256(value: unknown, label: string): string {
  const digest = expectString(value, label)
  if (!sha256Pattern.test(digest)) throw new Error(`${label} must be a lowercase sha256 digest`)
  return digest
}

function expectSafeFileName(value: unknown, label: string): string {
  const file = expectString(value, label)
  if (file === "" || file === "." || file === ".." || path.basename(file) !== file || file.includes("\\")) {
    throw new Error(`${label} must be a plain file name without path components`)
  }
  return file
}

async function readPackageMetadata(file: string, label: string): Promise<{ readonly name: string; readonly version: string }> {
  const parsed = expectObject(await readJson(file, label), label)
  return {
    name: expectString(parsed.name, `${label} name`),
    version: expectString(parsed.version, `${label} version`),
  }
}

async function readManifestVersion(file: string): Promise<string> {
  const parsed = expectObject(await readJson(file, "Extension manifest"), "Extension manifest")
  return expectStableVersion(parsed.version, "Extension manifest version")
}

async function readJson(file: string, label: string): Promise<unknown> {
  const text = await fs.readFile(file, "utf8")
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} must contain valid JSON`, { cause: error })
  }
}

async function assertArtifactDirectory(
  directory: string,
  requiredFiles: ReadonlySet<string>,
  optionalFiles: ReadonlySet<string>,
): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const actualFiles = new Set<string>()
  for (const entry of entries) {
    if (!entry.isFile()) {
      throw new Error(`Release artifacts directory contains an unsupported entry: ${entry.name}`)
    }
    expectSafeFileName(entry.name, "Release artifact entry")
    if (!requiredFiles.has(entry.name) && !optionalFiles.has(entry.name)) {
      throw new Error(`Release artifacts directory contains an unexpected file: ${entry.name}`)
    }
    actualFiles.add(entry.name)
  }
  const missing = [...requiredFiles].filter((file) => !actualFiles.has(file)).sort(compareText)
  if (missing.length > 0) throw new Error(`Release artifacts directory is missing: ${missing.join(", ")}`)
}

function resolveArtifactPath(directory: string, file: string): string {
  const safeFile = expectSafeFileName(file, "Release artifact file")
  const root = path.resolve(directory)
  const resolved = path.resolve(root, safeFile)
  if (path.dirname(resolved) !== root) throw new Error(`Release artifact path escapes its directory: ${file}`)
  return resolved
}

function npmArtifactFileName(version: string): string {
  return `${npmPackageName}-${version}.tgz`
}

function extensionArtifactFileName(version: string): string {
  return `${extensionPackageName}-${version}.zip`
}

function digestHex(algorithm: "sha256", bytes: Uint8Array): string {
  return createHash(algorithm).update(bytes).digest("hex")
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

async function main(args: readonly string[]): Promise<void> {
  const parsed = parseCliArguments(args)
  if (parsed.mode === "verify") {
    const verified = await verifyReleaseArtifacts(parsed.artifactsDirectory)
    console.log(JSON.stringify(verified))
    return
  }
  const manifest = await createReleaseManifest(parsed.options)
  console.log(JSON.stringify(manifest))
}

type ParsedCliArguments =
  | { readonly mode: "create"; readonly options: CreateReleaseManifestOptions }
  | { readonly mode: "verify"; readonly artifactsDirectory: string }

function parseCliArguments(args: readonly string[]): ParsedCliArguments {
  let verify = false
  let commit: string | undefined
  let root: string | undefined
  let artifactsDirectory: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--verify") {
      if (verify) throw new Error("--verify may only be provided once")
      verify = true
      continue
    }
    if (argument !== "--commit" && argument !== "--root" && argument !== "--artifacts") {
      throw new Error(`Unknown release manifest argument: ${argument ?? ""}`)
    }
    const value = args[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`)
    index += 1
    if (argument === "--commit") {
      if (commit !== undefined) throw new Error("--commit may only be provided once")
      commit = value
    } else if (argument === "--root") {
      if (root !== undefined) throw new Error("--root may only be provided once")
      root = value
    } else {
      if (artifactsDirectory !== undefined) throw new Error("--artifacts may only be provided once")
      artifactsDirectory = value
    }
  }

  if (verify) {
    if (commit !== undefined || root !== undefined || artifactsDirectory === undefined) {
      throw new Error("Usage: release-manifest --verify --artifacts <directory>")
    }
    return { mode: "verify", artifactsDirectory }
  }
  if (commit === undefined) {
    throw new Error("Usage: release-manifest --commit <sha> [--root <directory>] [--artifacts <directory>]")
  }
  const resolvedRoot = path.resolve(root ?? defaultRoot)
  return {
    mode: "create",
    options: {
      root: resolvedRoot,
      artifactsDirectory: path.resolve(artifactsDirectory ?? path.join(resolvedRoot, "artifacts")),
      commit,
    },
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main(process.argv.slice(2))
}
