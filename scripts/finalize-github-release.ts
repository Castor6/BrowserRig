import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"
import { unzipSync } from "fflate"
import {
  renderSha256Sums,
  validateReleaseManifest,
  type ReleaseManifest as CandidateReleaseManifest,
} from "./release-manifest.js"

const candidateArtifactPrefix = "browserrig-release-candidate-v1-"
const manifestFilename = "release-manifest.json"
const checksumsFilename = "SHA256SUMS"
const maxCandidateEntries = 16
const maxCandidateUncompressedBytes = 256 * 1024 * 1024

export type ReleaseManifest = CandidateReleaseManifest

export interface ReleaseCandidate {
  readonly manifest: ReleaseManifest
  readonly files: ReadonlyMap<string, Uint8Array>
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>

export interface FinalizeGitHubReleaseOptions {
  readonly repository: string
  readonly token: string
  readonly workflow?: string
  readonly githubApiBaseUrl?: string
  readonly githubUploadsBaseUrl?: string
  readonly npmRegistryBaseUrl?: string
  readonly maxRuns?: number
  readonly fetch?: FetchLike
}

export type FinalizeGitHubReleaseResult =
  | {
      readonly status: "created"
      readonly tag: string
      readonly version: string
      readonly runId: number
    }
  | {
      readonly status: "no-op"
      readonly tag: string
      readonly version: string
      readonly runId: number
    }
  | {
      readonly status: "waiting"
      readonly reason: "no-published-candidate"
    }

interface GitHubWorkflowRun {
  readonly id: number
  readonly status: string
  readonly conclusion: string | null
  readonly event: string
}

interface GitHubArtifact {
  readonly id: number
  readonly name: string
  readonly expired: boolean
  readonly size_in_bytes: number
}

interface GitHubRelease {
  readonly id: number
  readonly tag_name: string
  readonly target_commitish: string
  readonly name: string
  readonly body: string
  readonly draft: boolean
  readonly prerelease: boolean
}

interface GitHubReleaseAsset {
  readonly id: number
  readonly name: string
  readonly size: number
}

interface GitHubObjectReference {
  readonly type: string
  readonly sha: string
}

interface GitHubClient {
  readonly request: (path: string, init?: RequestInit) => Promise<Response>
  readonly upload: (path: string, init?: RequestInit) => Promise<Response>
}

class GitHubRequestError extends Error {
  readonly status: number

  constructor(method: string, path: string, status: number) {
    super(`GitHub API ${method} ${path.split("?")[0]} failed with ${status}`)
    this.name = "GitHubRequestError"
    this.status = status
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const requireRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

const requireString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

const requireInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`)
  }
  return value as number
}

export const parseReleaseManifest = validateReleaseManifest

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

export const sha512Integrity = (bytes: Uint8Array): string =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`

const decodeUtf8 = (bytes: Uint8Array, label: string): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`${label} is not valid UTF-8`)
  }
}

const findArchiveFile = (
  archive: Readonly<Record<string, Uint8Array>>,
  basename: string,
): Uint8Array => {
  const matches = Object.entries(archive).filter(([name]) => {
    const normalized = name.replace(/\\/g, "/").replace(/\/$/, "")
    return normalized.split("/").at(-1) === basename
  })
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error(`release candidate must contain exactly one ${basename}`)
  }
  return matches[0][1]
}

export const readReleaseCandidateArchive = (archiveBytes: Uint8Array): ReleaseCandidate => {
  let archive: Record<string, Uint8Array>
  let archiveEntries = 0
  let uncompressedBytes = 0
  let unsafeArchiveReason: string | undefined
  try {
    archive = unzipSync(archiveBytes, {
      filter: (file) => {
        archiveEntries += 1
        if (!Number.isSafeInteger(file.originalSize) || file.originalSize < 0) {
          unsafeArchiveReason = "release candidate artifact contains an invalid entry size"
        } else {
          uncompressedBytes += file.originalSize
        }
        if (archiveEntries > maxCandidateEntries) {
          unsafeArchiveReason = "release candidate artifact contains too many entries"
        } else if (uncompressedBytes > maxCandidateUncompressedBytes) {
          unsafeArchiveReason = "release candidate artifact is too large after decompression"
        }
        return unsafeArchiveReason === undefined
      },
    })
  } catch {
    throw new Error("release candidate artifact is not a valid ZIP archive")
  }
  if (unsafeArchiveReason !== undefined) throw new Error(unsafeArchiveReason)

  const manifestBytes = findArchiveFile(archive, manifestFilename)
  let manifestValue: unknown
  try {
    manifestValue = JSON.parse(decodeUtf8(manifestBytes, manifestFilename)) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${manifestFilename} is not valid JSON`)
    }
    throw error
  }
  const manifest = parseReleaseManifest(manifestValue)
  if (manifest.npm.file === manifest.extension.file) {
    throw new Error("npm and extension artifact filenames must differ")
  }

  const npmBytes = findArchiveFile(archive, manifest.npm.file)
  const extensionBytes = findArchiveFile(archive, manifest.extension.file)
  const checksumsBytes = findArchiveFile(archive, checksumsFilename)
  const expectedBasenames = new Set([
    manifestFilename,
    checksumsFilename,
    manifest.npm.file,
    manifest.extension.file,
  ])
  const actualFiles = Object.keys(archive).filter((name) => !name.endsWith("/"))
  for (const name of actualFiles) {
    const normalized = name.replace(/\\/g, "/")
    const basename = normalized.split("/").at(-1)
    if (basename === undefined || normalized !== basename || !expectedBasenames.has(basename)) {
      throw new Error(`release candidate contains unexpected file ${name}`)
    }
  }
  if (actualFiles.length !== expectedBasenames.size) {
    throw new Error("release candidate contains duplicate release files")
  }

  if (sha256(npmBytes) !== manifest.npm.sha256) {
    throw new Error("npm artifact SHA-256 does not match the release manifest")
  }
  if (sha512Integrity(npmBytes) !== manifest.npm.integrity) {
    throw new Error("npm artifact SHA-512 integrity does not match the release manifest")
  }
  if (sha256(extensionBytes) !== manifest.extension.sha256) {
    throw new Error("extension artifact SHA-256 does not match the release manifest")
  }

  if (decodeUtf8(checksumsBytes, checksumsFilename) !== renderSha256Sums(manifest)) {
    throw new Error(`${checksumsFilename} does not exactly match the release manifest`)
  }

  return {
    manifest,
    files: new Map([
      [manifest.npm.file, npmBytes],
      [manifest.extension.file, extensionBytes],
      [manifestFilename, manifestBytes],
      [checksumsFilename, checksumsBytes],
    ]),
  }
}

const joinUrl = (base: string, path: string): string =>
  `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`

const responseJson = async (response: Response, label: string): Promise<unknown> => {
  try {
    return await response.json() as unknown
  } catch {
    throw new Error(`${label} returned invalid JSON`)
  }
}

const exactArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const makeGitHubClient = (
  fetcher: FetchLike,
  token: string,
  apiBaseUrl: string,
  uploadsBaseUrl: string,
): GitHubClient => {
  const send = async (
    baseUrl: string,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const headers = new Headers(init.headers)
    headers.set("Accept", headers.get("Accept") ?? "application/vnd.github+json")
    headers.set("Authorization", `Bearer ${token}`)
    headers.set("X-GitHub-Api-Version", "2022-11-28")
    const response = await fetcher(joinUrl(baseUrl, path), { ...init, headers })
    if (!response.ok) {
      throw new GitHubRequestError(init.method ?? "GET", path, response.status)
    }
    return response
  }

  return {
    request: (path, init) => send(apiBaseUrl, path, init),
    upload: (path, init) => send(uploadsBaseUrl, path, init),
  }
}

const parseWorkflowRuns = (value: unknown): ReadonlyArray<GitHubWorkflowRun> => {
  const record = requireRecord(value, "GitHub workflow runs response")
  if (!Array.isArray(record.workflow_runs)) {
    throw new Error("GitHub workflow runs response is missing workflow_runs")
  }
  return record.workflow_runs.map((item, index) => {
    const run = requireRecord(item, `GitHub workflow run ${index}`)
    const id = requireInteger(run.id, `GitHub workflow run ${index} id`)
    const status = requireString(run.status, `GitHub workflow run ${index} status`)
    const conclusion = run.conclusion === null
      ? null
      : requireString(run.conclusion, `GitHub workflow run ${index} conclusion`)
    const event = requireString(run.event, `GitHub workflow run ${index} event`)
    return { id, status, conclusion, event }
  })
}

const parseArtifacts = (value: unknown): ReadonlyArray<GitHubArtifact> => {
  const record = requireRecord(value, "GitHub artifacts response")
  if (!Array.isArray(record.artifacts)) {
    throw new Error("GitHub artifacts response is missing artifacts")
  }
  return record.artifacts.map((item, index) => {
    const artifact = requireRecord(item, `GitHub artifact ${index}`)
    if (typeof artifact.expired !== "boolean") {
      throw new Error(`GitHub artifact ${index} expired must be boolean`)
    }
    return {
      id: requireInteger(artifact.id, `GitHub artifact ${index} id`),
      name: requireString(artifact.name, `GitHub artifact ${index} name`),
      expired: artifact.expired,
      size_in_bytes: requireInteger(artifact.size_in_bytes, `GitHub artifact ${index} size_in_bytes`),
    }
  })
}

const parseRelease = (value: unknown, label: string): GitHubRelease => {
  const release = requireRecord(value, label)
  if (typeof release.draft !== "boolean" || typeof release.prerelease !== "boolean") {
    throw new Error(`${label} has invalid release flags`)
  }
  return {
    id: requireInteger(release.id, `${label} id`),
    tag_name: requireString(release.tag_name, `${label} tag_name`),
    target_commitish: requireString(release.target_commitish, `${label} target_commitish`),
    name: requireString(release.name, `${label} name`),
    body: requireString(release.body, `${label} body`),
    draft: release.draft,
    prerelease: release.prerelease,
  }
}

const parseReleases = (value: unknown): ReadonlyArray<GitHubRelease> => {
  if (!Array.isArray(value)) {
    throw new Error("GitHub Releases response must be an array")
  }
  return value.map((release, index) => parseRelease(release, `GitHub Release ${index}`))
}

const parseReleaseAssets = (value: unknown): ReadonlyArray<GitHubReleaseAsset> => {
  if (!Array.isArray(value)) {
    throw new Error("GitHub release assets response must be an array")
  }
  return value.map((item, index) => {
    const asset = requireRecord(item, `GitHub release asset ${index}`)
    return {
      id: requireInteger(asset.id, `GitHub release asset ${index} id`),
      name: requireString(asset.name, `GitHub release asset ${index} name`),
      size: requireInteger(asset.size, `GitHub release asset ${index} size`),
    }
  })
}

const parseObjectReference = (value: unknown, label: string): GitHubObjectReference => {
  const record = requireRecord(value, label)
  const object = requireRecord(record.object, `${label} object`)
  return {
    type: requireString(object.type, `${label} object.type`),
    sha: requireString(object.sha, `${label} object.sha`),
  }
}

const resolveTagCommit = async (
  client: GitHubClient,
  repositoryPath: string,
  tag: string,
): Promise<string | undefined> => {
  let response: Response
  try {
    response = await client.request(`${repositoryPath}/git/ref/tags/${encodeURIComponent(tag)}`)
  } catch (error) {
    if (error instanceof GitHubRequestError && error.status === 404) return undefined
    throw error
  }
  let object = parseObjectReference(await responseJson(response, "GitHub tag reference"), "GitHub tag reference")
  for (let depth = 0; depth < 5; depth += 1) {
    if (object.type === "commit") return object.sha
    if (object.type !== "tag") {
      throw new Error(`GitHub tag ${tag} points to unsupported object type ${object.type}`)
    }
    const tagResponse = await client.request(`${repositoryPath}/git/tags/${object.sha}`)
    object = parseObjectReference(await responseJson(tagResponse, "GitHub annotated tag"), "GitHub annotated tag")
  }
  throw new Error(`GitHub tag ${tag} has too many annotation levels`)
}

const contentTypeFor = (filename: string): string => {
  if (filename.endsWith(".tgz")) return "application/gzip"
  if (filename.endsWith(".zip")) return "application/zip"
  if (filename.endsWith(".json")) return "application/json"
  return "text/plain; charset=utf-8"
}

export const releaseBody = (manifest: ReleaseManifest): string => [
  "## Components",
  "",
  `- npm: \`${manifest.npm.name}@${manifest.npm.version}\``,
  `- Chrome extension: \`${manifest.extension.version}\``,
  `- Extension protocol: \`${manifest.extension.protocolVersion}\``,
].join("\n")

const verifyPublishedNpmArtifact = async (
  fetcher: FetchLike,
  npmRegistryBaseUrl: string,
  candidate: ReleaseCandidate,
): Promise<"published" | "not-published"> => {
  const { manifest } = candidate
  const npmPath = `${encodeURIComponent(manifest.npm.name)}/${encodeURIComponent(manifest.npm.version)}`
  const registryResponse = await fetcher(joinUrl(npmRegistryBaseUrl, npmPath), {
    headers: { Accept: "application/json" },
  })
  if (registryResponse.status === 404) return "not-published"
  if (!registryResponse.ok) {
    throw new Error(`npm registry lookup failed with ${registryResponse.status}`)
  }
  const registry = requireRecord(await responseJson(registryResponse, "npm registry"), "npm registry")
  if (registry.version !== manifest.npm.version) {
    throw new Error("npm registry returned a conflicting package version")
  }
  const dist = requireRecord(registry.dist, "npm registry dist")
  if (dist.integrity !== manifest.npm.integrity) {
    throw new Error("npm registry integrity conflicts with the release candidate")
  }

  const registryBase = new URL(npmRegistryBaseUrl)
  const tarballValue = requireString(dist.tarball, "npm registry dist.tarball")
  let tarballUrl: URL
  try {
    tarballUrl = new URL(tarballValue)
  } catch {
    throw new Error("npm registry dist.tarball must be an absolute URL")
  }
  const allowedProtocol = registryBase.protocol === "http:" ? "http:" : "https:"
  if (tarballUrl.protocol !== allowedProtocol || tarballUrl.origin !== registryBase.origin) {
    throw new Error("npm registry dist.tarball must use the registry origin and a secure protocol")
  }
  if (tarballUrl.username !== "" || tarballUrl.password !== "" || tarballUrl.hash !== "") {
    throw new Error("npm registry dist.tarball contains unsafe URL components")
  }

  const tarballResponse = await fetcher(tarballUrl, {
    headers: { Accept: "application/octet-stream" },
    redirect: "error",
  })
  if (!tarballResponse.ok) {
    throw new Error(`npm registry tarball download failed with ${tarballResponse.status}`)
  }
  const tarballBytes = new Uint8Array(await tarballResponse.arrayBuffer())
  const candidateBytes = candidate.files.get(manifest.npm.file)
  if (candidateBytes === undefined) {
    throw new Error("release candidate is missing its npm artifact")
  }
  if (
    tarballBytes.byteLength !== candidateBytes.byteLength ||
    sha256(tarballBytes) !== manifest.npm.sha256 ||
    sha512Integrity(tarballBytes) !== manifest.npm.integrity
  ) {
    throw new Error("npm registry tarball bytes conflict with the release candidate")
  }
  return "published"
}

const assertRepository = (repository: string): void => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("repository must use owner/name format")
  }
}

const assertAssetSet = async (
  client: GitHubClient,
  repositoryPath: string,
  release: GitHubRelease,
  candidate: ReleaseCandidate,
): Promise<ReadonlyMap<string, GitHubReleaseAsset>> => {
  const response = await client.request(`${repositoryPath}/releases/${release.id}/assets?per_page=100`)
  const assets = parseReleaseAssets(await responseJson(response, "GitHub release assets"))
  const expectedNames = new Set(candidate.files.keys())
  const assetsByName = new Map<string, GitHubReleaseAsset>()
  for (const asset of assets) {
    if (!expectedNames.has(asset.name)) {
      throw new Error(`GitHub Release contains unexpected asset ${asset.name}`)
    }
    if (assetsByName.has(asset.name)) {
      throw new Error(`GitHub Release contains duplicate asset ${asset.name}`)
    }
    assetsByName.set(asset.name, asset)
  }
  return assetsByName
}

const verifyAsset = async (
  client: GitHubClient,
  repositoryPath: string,
  asset: GitHubReleaseAsset,
  expectedBytes: Uint8Array,
): Promise<void> => {
  if (asset.size !== expectedBytes.byteLength) {
    throw new Error(`GitHub Release asset ${asset.name} size conflicts with the release candidate`)
  }
  const response = await client.request(`${repositoryPath}/releases/assets/${asset.id}`, {
    headers: { Accept: "application/octet-stream" },
  })
  const actualBytes = new Uint8Array(await response.arrayBuffer())
  if (sha256(actualBytes) !== sha256(expectedBytes)) {
    throw new Error(`GitHub Release asset ${asset.name} content conflicts with the release candidate`)
  }
}

const finalizeCandidateRelease = async (
  client: GitHubClient,
  repositoryPath: string,
  candidate: ReleaseCandidate,
): Promise<"created" | "no-op"> => {
  const { manifest } = candidate
  const releasesResponse = await client.request(`${repositoryPath}/releases?per_page=100`)
  const matchingReleases = parseReleases(await responseJson(releasesResponse, "GitHub Releases"))
    .filter((release) => release.tag_name === manifest.tag)
  if (matchingReleases.length > 1) {
    throw new Error(`multiple GitHub Releases exist for ${manifest.tag}`)
  }
  let release = matchingReleases[0]

  const existingTagCommit = await resolveTagCommit(client, repositoryPath, manifest.tag)
  if (existingTagCommit !== undefined && existingTagCommit !== manifest.commit) {
    throw new Error(`GitHub tag ${manifest.tag} targets a conflicting commit`)
  }
  if (release !== undefined && !release.draft && existingTagCommit === undefined) {
    throw new Error(`published GitHub Release ${manifest.tag} has no matching tag`)
  }

  if (release === undefined) {
    const response = await client.request(`${repositoryPath}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tag_name: manifest.tag,
        target_commitish: manifest.commit,
        name: `BrowserRig ${manifest.tag}`,
        body: releaseBody(manifest),
        draft: true,
        prerelease: false,
        generate_release_notes: true,
      }),
    })
    release = parseRelease(await responseJson(response, "created GitHub Release"), "created GitHub Release")
    if (!release.draft) {
      throw new Error("new GitHub Release was not created as a draft")
    }
  }

  if (release.tag_name !== manifest.tag) {
    throw new Error("GitHub Release tag conflicts with the release candidate")
  }
  if (release.name !== `BrowserRig ${manifest.tag}`) {
    throw new Error("GitHub Release name conflicts with the release candidate")
  }
  if (!release.body.startsWith(releaseBody(manifest))) {
    throw new Error("GitHub Release body conflicts with the release candidate")
  }
  if (release.prerelease) {
    throw new Error("GitHub Release unexpectedly exists as a prerelease")
  }
  if (release.draft && existingTagCommit === undefined && release.target_commitish !== manifest.commit) {
    throw new Error("draft GitHub Release targets a conflicting commit")
  }

  let assetsByName = await assertAssetSet(client, repositoryPath, release, candidate)
  for (const [filename, bytes] of candidate.files) {
    const asset = assetsByName.get(filename)
    if (asset !== undefined) {
      await verifyAsset(client, repositoryPath, asset, bytes)
      continue
    }
    if (!release.draft) {
      throw new Error(`published GitHub Release is missing asset ${filename}`)
    }
    const uploadResponse = await client.upload(
      `${repositoryPath}/releases/${release.id}/assets?name=${encodeURIComponent(filename)}`,
      {
        method: "POST",
        headers: { "Content-Type": contentTypeFor(filename) },
        body: exactArrayBuffer(bytes),
      },
    )
    const uploaded = parseReleaseAssets([await responseJson(uploadResponse, `uploaded asset ${filename}`)])[0]
    if (uploaded === undefined || uploaded.name !== filename) {
      throw new Error(`GitHub uploaded asset response conflicts for ${filename}`)
    }
    await verifyAsset(client, repositoryPath, uploaded, bytes)
  }

  assetsByName = await assertAssetSet(client, repositoryPath, release, candidate)
  if (assetsByName.size !== candidate.files.size) {
    throw new Error("GitHub Release asset set is incomplete after upload")
  }
  for (const [filename, bytes] of candidate.files) {
    const asset = assetsByName.get(filename)
    if (asset === undefined) {
      throw new Error(`GitHub Release is missing asset ${filename}`)
    }
    await verifyAsset(client, repositoryPath, asset, bytes)
  }

  if (!release.draft) return "no-op"
  const publishResponse = await client.request(`${repositoryPath}/releases/${release.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft: false }),
  })
  release = parseRelease(await responseJson(publishResponse, "published GitHub Release"), "published GitHub Release")
  if (release.draft || release.tag_name !== manifest.tag) {
    throw new Error("GitHub Release did not publish with the expected tag")
  }
  const publishedTagCommit = await resolveTagCommit(client, repositoryPath, manifest.tag)
  if (publishedTagCommit === undefined || publishedTagCommit !== manifest.commit) {
    throw new Error(`GitHub tag ${manifest.tag} does not target the release candidate commit`)
  }
  return "created"
}

export const finalizeGitHubRelease = async (
  options: FinalizeGitHubReleaseOptions,
): Promise<FinalizeGitHubReleaseResult> => {
  assertRepository(options.repository)
  if (options.token.length === 0) throw new Error("GitHub token is required")
  const workflow = options.workflow ?? "release.yml"
  if (workflow.length === 0 || workflow.includes("/") || workflow.includes("\\")) {
    throw new Error("workflow must be a workflow filename")
  }
  const maxRuns = options.maxRuns ?? 20
  if (!Number.isSafeInteger(maxRuns) || maxRuns < 1 || maxRuns > 100) {
    throw new Error("maxRuns must be an integer from 1 to 100")
  }

  const fetcher = options.fetch ?? fetch
  const apiBaseUrl = options.githubApiBaseUrl ?? "https://api.github.com"
  const uploadsBaseUrl = options.githubUploadsBaseUrl ?? "https://uploads.github.com"
  const npmRegistryBaseUrl = options.npmRegistryBaseUrl ?? "https://registry.npmjs.org"
  const client = makeGitHubClient(fetcher, options.token, apiBaseUrl, uploadsBaseUrl)
  const repositoryPath = `repos/${options.repository}`
  const runsResponse = await client.request(
    `${repositoryPath}/actions/workflows/${encodeURIComponent(workflow)}/runs?status=success&event=pull_request&per_page=${maxRuns}`,
  )
  const runs = parseWorkflowRuns(await responseJson(runsResponse, "GitHub workflow runs"))
    .filter((run) => run.status === "completed" && run.conclusion === "success" && run.event === "pull_request")
    .sort((left, right) => right.id - left.id)

  for (const run of runs) {
    const artifactsResponse = await client.request(`${repositoryPath}/actions/runs/${run.id}/artifacts?per_page=100`)
    const candidateArtifacts = parseArtifacts(await responseJson(artifactsResponse, "GitHub artifacts"))
      .filter((artifact) => !artifact.expired && artifact.name.startsWith(candidateArtifactPrefix))
    if (candidateArtifacts.length > 1) {
      throw new Error(`workflow run ${run.id} contains multiple release candidate artifacts`)
    }
    const artifact = candidateArtifacts[0]
    if (artifact === undefined) continue
    if (artifact.size_in_bytes < 1 || artifact.size_in_bytes > 512 * 1024 * 1024) {
      throw new Error(`workflow run ${run.id} release candidate artifact has an unsafe size`)
    }

    const archiveResponse = await client.request(`${repositoryPath}/actions/artifacts/${artifact.id}/zip`)
    const candidate = readReleaseCandidateArchive(new Uint8Array(await archiveResponse.arrayBuffer()))
    const expectedArtifactName = `${candidateArtifactPrefix}${candidate.manifest.commit}`
    if (artifact.name !== expectedArtifactName) {
      throw new Error(`workflow run ${run.id} artifact name does not match its release commit`)
    }
    if (await verifyPublishedNpmArtifact(fetcher, npmRegistryBaseUrl, candidate) === "not-published") continue

    const status = await finalizeCandidateRelease(client, repositoryPath, candidate)
    return {
      status,
      tag: candidate.manifest.tag,
      version: candidate.manifest.npm.version,
      runId: run.id,
    }
  }

  return { status: "waiting", reason: "no-published-candidate" }
}

interface CliOptions {
  readonly repository: string
  readonly token: string
  readonly workflow: string
  readonly githubApiBaseUrl: string
  readonly githubUploadsBaseUrl: string
  readonly npmRegistryBaseUrl: string
  readonly maxRuns: number
}

const argumentValue = (args: ReadonlyArray<string>, index: number, name: string): string => {
  const value = args[index + 1]
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

export const parseFinalizeCliOptions = (
  args: ReadonlyArray<string>,
  environment: Readonly<Record<string, string | undefined>>,
): CliOptions => {
  let repository = environment.GITHUB_REPOSITORY
  let tokenEnvironmentName = "GITHUB_TOKEN"
  let workflow = "release.yml"
  let githubApiBaseUrl = environment.GITHUB_API_URL ?? "https://api.github.com"
  let githubUploadsBaseUrl = "https://uploads.github.com"
  let npmRegistryBaseUrl = "https://registry.npmjs.org"
  let maxRuns = 20

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--repository") repository = argumentValue(args, index++, argument)
    else if (argument === "--token-env") tokenEnvironmentName = argumentValue(args, index++, argument)
    else if (argument === "--workflow") workflow = argumentValue(args, index++, argument)
    else if (argument === "--github-api-url") githubApiBaseUrl = argumentValue(args, index++, argument)
    else if (argument === "--github-uploads-url") githubUploadsBaseUrl = argumentValue(args, index++, argument)
    else if (argument === "--npm-registry-url") npmRegistryBaseUrl = argumentValue(args, index++, argument)
    else if (argument === "--max-runs") {
      const value = argumentValue(args, index++, argument)
      maxRuns = Number(value)
    } else {
      throw new Error(`unknown argument ${argument}`)
    }
  }

  if (repository === undefined || repository.length === 0) {
    throw new Error("repository is required via --repository or GITHUB_REPOSITORY")
  }
  const token = environment[tokenEnvironmentName]
  if (token === undefined || token.length === 0) {
    throw new Error(`GitHub token is required in ${tokenEnvironmentName}`)
  }
  return {
    repository,
    token,
    workflow,
    githubApiBaseUrl,
    githubUploadsBaseUrl,
    npmRegistryBaseUrl,
    maxRuns,
  }
}

export const runFinalizeCli = async (
  args: ReadonlyArray<string>,
  environment: Readonly<Record<string, string | undefined>>,
  fetcher: FetchLike = fetch,
): Promise<FinalizeGitHubReleaseResult> => {
  const options = parseFinalizeCliOptions(args, environment)
  return finalizeGitHubRelease({ ...options, fetch: fetcher })
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runFinalizeCli(process.argv.slice(2), process.env).then(
    (result) => {
      if (result.status === "waiting") {
        console.log("GitHub Release finalizer: waiting; no npm-published candidate was found.")
      } else if (result.status === "no-op") {
        console.log(`GitHub Release finalizer: no-op; ${result.tag} is already complete.`)
      } else {
        console.log(`GitHub Release finalizer: created and published ${result.tag}.`)
      }
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    },
  )
}
