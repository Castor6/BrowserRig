import fs from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { verifyReleaseArtifacts } from "./release-manifest.ts"

export const browserRigChromeWebStoreItemId = "dbobcmjamjdknplkplgdihdnmdjklpin"
export const chromeWebStoreScope = "https://www.googleapis.com/auth/chromewebstore"

const chromeWebStoreApiBaseUrl = "https://chromewebstore.googleapis.com"
const itemIdPattern = /^[a-p]{32}$/
const publisherIdPattern = /^[A-Za-z0-9._~-]+$/
const commitPattern = /^[0-9a-f]{40}$/
const extensionVersionPattern = /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/
const acceptedItemStates = new Set([
  "PENDING_REVIEW",
  "STAGED",
  "PUBLISHED",
  "PUBLISHED_TO_TESTERS",
  "REJECTED",
  "CANCELLED",
])
const acceptedUploadStates = new Set(["SUCCEEDED", "IN_PROGRESS", "FAILED", "NOT_FOUND"])

export type ChromeWebStoreFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type ChromeWebStoreSleep = (milliseconds: number) => Promise<void>

export type ChromeWebStoreRevision = {
  readonly state: string
  readonly versions: readonly string[]
}

export type ChromeWebStoreStatus = {
  readonly itemId: string
  readonly published?: ChromeWebStoreRevision
  readonly submitted?: ChromeWebStoreRevision
  readonly lastAsyncUploadState?: string
  readonly takenDown: boolean
  readonly warned: boolean
}

export type ChromeWebStorePublishResult = {
  readonly status: "already-published" | "already-submitted" | "submitted"
  readonly itemId: string
  readonly version: string
  readonly state: string
  readonly warnings: readonly string[]
}

export type PublishChromeWebStoreOptions = {
  readonly accessToken: string
  readonly publisherId: string
  readonly itemId: string
  readonly extensionVersion: string
  readonly extensionBytes: Uint8Array
  readonly fetcher?: ChromeWebStoreFetch
  readonly sleep?: ChromeWebStoreSleep
  readonly uploadPollIntervalMs?: number
  readonly uploadPollLimit?: number
}

type ReleaseDisposition =
  | { readonly action: "upload" }
  | { readonly action: "complete"; readonly result: ChromeWebStorePublishResult }

export class ChromeWebStoreRequestError extends Error {
  readonly method: string
  readonly path: string
  readonly status: number

  constructor(method: string, path: string, status: number, apiMessage?: string) {
    const detail = apiMessage ? `: ${apiMessage}` : ""
    super(`Chrome Web Store ${method} ${path} failed with HTTP ${status}${detail}`)
    this.name = "ChromeWebStoreRequestError"
    this.method = method
    this.path = path
    this.status = status
  }
}

export function releaseDisposition(
  status: ChromeWebStoreStatus,
  targetVersion: string,
): ReleaseDisposition {
  validateExtensionVersion(targetVersion, "Target extension version")
  if (status.takenDown) {
    throw new Error("Chrome Web Store item is taken down; resolve the policy violation before publishing")
  }
  if (status.warned) {
    throw new Error("Chrome Web Store item has a policy warning; resolve it before publishing")
  }

  const submitted = status.submitted
  if (submitted) {
    const matchesTarget = submitted.versions.includes(targetVersion)
    if (matchesTarget) {
      if (submitted.state === "PENDING_REVIEW") {
        return {
          action: "complete",
          result: completedResult("already-submitted", status.itemId, targetVersion, submitted.state),
        }
      }
      if (submitted.state === "PUBLISHED") {
        return {
          action: "complete",
          result: completedResult("already-published", status.itemId, targetVersion, submitted.state),
        }
      }
      if (submitted.state === "STAGED") {
        throw new Error(
          `Chrome Web Store version ${targetVersion} is staged instead of configured for automatic publishing`,
        )
      }
      throw new Error(
        `Chrome Web Store version ${targetVersion} has terminal submission state ${submitted.state}; ` +
        "publish a new extension version",
      )
    }
    if (submitted.state === "PENDING_REVIEW" || submitted.state === "STAGED") {
      throw new Error(
        `Chrome Web Store has active ${submitted.state} submission ${displayVersions(submitted.versions)} ` +
        `while this candidate contains ${targetVersion}`,
      )
    }
    assertTargetNewerThan(targetVersion, submitted.versions, "submitted")
  }

  const published = status.published
  if (published?.versions.includes(targetVersion)) {
    return {
      action: "complete",
      result: completedResult("already-published", status.itemId, targetVersion, published.state),
    }
  }
  if (published) assertTargetNewerThan(targetVersion, published.versions, "published")
  return { action: "upload" }
}

export async function publishChromeWebStore(
  options: PublishChromeWebStoreOptions,
): Promise<ChromeWebStorePublishResult> {
  validateAccessToken(options.accessToken)
  validatePublisherId(options.publisherId)
  validateItemId(options.itemId)
  validateExtensionVersion(options.extensionVersion, "Target extension version")
  if (options.extensionBytes.byteLength === 0) throw new Error("Chrome Web Store extension ZIP is empty")

  const fetcher = options.fetcher ?? globalThis.fetch
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const uploadPollIntervalMs = options.uploadPollIntervalMs ?? 3_000
  const uploadPollLimit = options.uploadPollLimit ?? 20
  if (!Number.isSafeInteger(uploadPollIntervalMs) || uploadPollIntervalMs < 0 || uploadPollIntervalMs > 30_000) {
    throw new Error("Chrome Web Store upload poll interval must be between 0 and 30000 milliseconds")
  }
  if (!Number.isSafeInteger(uploadPollLimit) || uploadPollLimit < 1 || uploadPollLimit > 100) {
    throw new Error("Chrome Web Store upload poll limit must be between 1 and 100")
  }

  const client = makeChromeWebStoreClient(fetcher, options.accessToken, options.publisherId, options.itemId)
  const initialStatus = await client.fetchStatus()
  const initialDisposition = releaseDisposition(initialStatus, options.extensionVersion)
  if (initialDisposition.action === "complete") return initialDisposition.result

  const upload = parseUploadResponse(
    await client.upload(options.extensionBytes),
    options.itemId,
  )
  let uploadState = upload.uploadState
  if (uploadState === "SUCCEEDED") {
    if (upload.crxVersion !== options.extensionVersion) {
      throw new Error(
        `Chrome Web Store accepted unexpected extension version ${upload.crxVersion ?? "<missing>"}; ` +
        `expected ${options.extensionVersion}`,
      )
    }
  } else if (uploadState === "IN_PROGRESS") {
    for (let attempt = 0; attempt < uploadPollLimit; attempt += 1) {
      await sleep(uploadPollIntervalMs)
      const status = await client.fetchStatus()
      const disposition = releaseDisposition(status, options.extensionVersion)
      if (disposition.action === "complete") return disposition.result
      uploadState = status.lastAsyncUploadState ?? "IN_PROGRESS"
      if (uploadState === "SUCCEEDED") break
      if (uploadState === "FAILED" || uploadState === "NOT_FOUND") {
        throw new Error(`Chrome Web Store asynchronous upload ended in state ${uploadState}`)
      }
      if (uploadState !== "IN_PROGRESS") {
        throw new Error(`Chrome Web Store returned unknown asynchronous upload state ${uploadState}`)
      }
    }
    if (uploadState !== "SUCCEEDED") {
      throw new Error("Chrome Web Store asynchronous upload did not finish before the polling limit")
    }
  } else {
    throw new Error(`Chrome Web Store upload ended in state ${uploadState}`)
  }

  const published = parsePublishResponse(await client.publish(), options.itemId)
  if (published.state !== "PENDING_REVIEW" && published.state !== "PUBLISHED") {
    throw new Error(
      `Chrome Web Store DEFAULT_PUBLISH returned unexpected item state ${published.state}`,
    )
  }
  return {
    status: "submitted",
    itemId: options.itemId,
    version: options.extensionVersion,
    state: published.state,
    warnings: published.warnings,
  }
}

type ChromeWebStoreClient = {
  readonly fetchStatus: () => Promise<ChromeWebStoreStatus>
  readonly upload: (bytes: Uint8Array) => Promise<unknown>
  readonly publish: () => Promise<unknown>
}

function makeChromeWebStoreClient(
  fetcher: ChromeWebStoreFetch,
  accessToken: string,
  publisherId: string,
  itemId: string,
): ChromeWebStoreClient {
  const resourcePath = `publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(itemId)}`
  const send = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${accessToken}`)
    const response = await fetcher(`${chromeWebStoreApiBaseUrl}${path}`, { ...init, headers })
    const value = await responseJson(response, `Chrome Web Store ${init.method ?? "GET"} ${path}`)
    if (!response.ok) {
      throw new ChromeWebStoreRequestError(
        init.method ?? "GET",
        path,
        response.status,
        sanitizeApiMessage(googleApiErrorMessage(value), accessToken),
      )
    }
    return value
  }

  return {
    fetchStatus: async () => parseStatusResponse(
      await send(`/v2/${resourcePath}:fetchStatus`),
      itemId,
    ),
    upload: (bytes) => send(`/upload/v2/${resourcePath}:upload`, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: exactArrayBuffer(bytes),
    }),
    publish: () => send(`/v2/${resourcePath}:publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publishType: "DEFAULT_PUBLISH",
        skipReview: false,
        blockOnWarnings: true,
      }),
    }),
  }
}

function parseStatusResponse(value: unknown, expectedItemId: string): ChromeWebStoreStatus {
  const record = requireRecord(value, "Chrome Web Store status response")
  const itemId = requireString(record.itemId, "Chrome Web Store status itemId")
  if (itemId !== expectedItemId) {
    throw new Error(`Chrome Web Store status returned item ${itemId}; expected ${expectedItemId}`)
  }
  const lastAsyncUploadState = record.lastAsyncUploadState === undefined
    ? undefined
    : normalizeUploadState(record.lastAsyncUploadState, "Chrome Web Store last async upload state")
  const published = optionalRevision(record.publishedItemRevisionStatus, "published")
  const submitted = optionalRevision(record.submittedItemRevisionStatus, "submitted")
  return {
    itemId,
    ...(published === undefined ? {} : { published }),
    ...(submitted === undefined ? {} : { submitted }),
    ...(lastAsyncUploadState === undefined ? {} : { lastAsyncUploadState }),
    takenDown: optionalBoolean(record.takenDown, "Chrome Web Store takenDown"),
    warned: optionalBoolean(record.warned, "Chrome Web Store warned"),
  }
}

function optionalRevision(value: unknown, label: string): ChromeWebStoreRevision | undefined {
  if (value === undefined || value === null) return undefined
  const record = requireRecord(value, `Chrome Web Store ${label} revision`)
  const state = requireString(record.state, `Chrome Web Store ${label} revision state`)
  if (!acceptedItemStates.has(state)) {
    throw new Error(`Chrome Web Store ${label} revision has unknown state ${state}`)
  }
  if (!Array.isArray(record.distributionChannels)) {
    throw new Error(`Chrome Web Store ${label} revision is missing distributionChannels`)
  }
  const versions = [...new Set(record.distributionChannels.map((channel, index) => {
    const parsed = requireRecord(channel, `Chrome Web Store ${label} distribution channel ${index}`)
    const version = requireString(
      parsed.crxVersion,
      `Chrome Web Store ${label} distribution channel ${index} crxVersion`,
    )
    validateExtensionVersion(version, `Chrome Web Store ${label} version`)
    return version
  }))].sort(compareExtensionVersions)
  if (versions.length === 0) {
    throw new Error(`Chrome Web Store ${label} revision has no extension version`)
  }
  return { state, versions }
}

function parseUploadResponse(
  value: unknown,
  expectedItemId: string,
): { readonly uploadState: string; readonly crxVersion?: string } {
  const record = requireRecord(value, "Chrome Web Store upload response")
  const itemId = requireString(record.itemId, "Chrome Web Store upload itemId")
  if (itemId !== expectedItemId) {
    throw new Error(`Chrome Web Store upload returned item ${itemId}; expected ${expectedItemId}`)
  }
  const uploadState = normalizeUploadState(record.uploadState, "Chrome Web Store upload state")
  const crxVersion = record.crxVersion === undefined
    ? undefined
    : requireString(record.crxVersion, "Chrome Web Store upload crxVersion")
  if (crxVersion !== undefined) validateExtensionVersion(crxVersion, "Chrome Web Store uploaded version")
  return { uploadState, ...(crxVersion === undefined ? {} : { crxVersion }) }
}

function parsePublishResponse(
  value: unknown,
  expectedItemId: string,
): { readonly state: string; readonly warnings: readonly string[] } {
  const record = requireRecord(value, "Chrome Web Store publish response")
  const itemId = requireString(record.itemId, "Chrome Web Store publish itemId")
  if (itemId !== expectedItemId) {
    throw new Error(`Chrome Web Store publish returned item ${itemId}; expected ${expectedItemId}`)
  }
  const state = requireString(record.state, "Chrome Web Store publish state")
  if (!acceptedItemStates.has(state)) throw new Error(`Chrome Web Store publish returned unknown state ${state}`)
  const warnings = parseWarnings(record.warningInfo)
  return { state, warnings }
}

function parseWarnings(value: unknown): readonly string[] {
  if (value === undefined || value === null) return []
  const record = requireRecord(value, "Chrome Web Store warningInfo")
  if (!Array.isArray(record.warnings)) throw new Error("Chrome Web Store warningInfo is missing warnings")
  return record.warnings.map((warning, index) => {
    const parsed = requireRecord(warning, `Chrome Web Store warning ${index}`)
    return `${requireString(parsed.reason, `Chrome Web Store warning ${index} reason`)}: ` +
      requireString(parsed.description, `Chrome Web Store warning ${index} description`)
  })
}

function completedResult(
  status: "already-published" | "already-submitted",
  itemId: string,
  version: string,
  state: string,
): ChromeWebStorePublishResult {
  return { status, itemId, version, state, warnings: [] }
}

function assertTargetNewerThan(target: string, existing: readonly string[], label: string): void {
  for (const version of existing) {
    if (compareExtensionVersions(target, version) <= 0) {
      throw new Error(
        `Chrome Web Store candidate ${target} must be newer than ${label} version ${version}`,
      )
    }
  }
}

function compareExtensionVersions(left: string, right: string): number {
  validateExtensionVersion(left, "Extension version")
  validateExtensionVersion(right, "Extension version")
  const leftParts = left.split(".").map(Number)
  const rightParts = right.split(".").map(Number)
  for (let index = 0; index < 4; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return 0
}

function validateExtensionVersion(value: string, label: string): void {
  if (!extensionVersionPattern.test(value)) throw new Error(`${label} is not a valid Chrome extension version`)
  for (const component of value.split(".")) {
    if (Number(component) > 65_535) throw new Error(`${label} has a component greater than 65535`)
  }
}

function validatePublisherId(value: string): void {
  if (!publisherIdPattern.test(value) || value.length > 256) {
    throw new Error("Chrome Web Store publisher ID is invalid")
  }
}

function validateItemId(value: string): void {
  if (!itemIdPattern.test(value)) throw new Error("Chrome Web Store item ID is invalid")
}

function validateAccessToken(value: string): void {
  if (value === "" || value !== value.trim() || /[\r\n]/.test(value)) {
    throw new Error("Chrome Web Store access token is invalid")
  }
}

function normalizeUploadState(value: unknown, label: string): string {
  const state = requireString(value, label)
  const normalized = state === "UPLOAD_IN_PROGRESS" ? "IN_PROGRESS" : state
  if (!acceptedUploadStates.has(normalized)) throw new Error(`${label} is unknown: ${state}`)
  return normalized
}

function displayVersions(versions: readonly string[]): string {
  return versions.length === 0 ? "<unknown version>" : versions.join(", ")
}

function optionalBoolean(value: unknown, label: string): boolean {
  if (value === undefined) return false
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`)
  return value
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`${label} must be a non-empty string`)
  return value
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function responseJson(response: Response, label: string): Promise<unknown> {
  try {
    return await response.json() as unknown
  } catch {
    throw new Error(`${label} returned invalid JSON`)
  }
}

function googleApiErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const error = Reflect.get(value, "error")
  if (!error || typeof error !== "object" || Array.isArray(error)) return undefined
  const message = Reflect.get(error, "message")
  return typeof message === "string" && message !== "" ? message.slice(0, 1_000) : undefined
}

function sanitizeApiMessage(message: string | undefined, accessToken: string): string | undefined {
  return message?.replaceAll(accessToken, "[REDACTED]")
}

type CliOptions = {
  readonly artifactsDirectory: string
  readonly commit: string
  readonly publisherId: string
  readonly itemId: string
}

function parseCliArguments(args: readonly string[]): CliOptions {
  const values = new Map<string, string>()
  const accepted = new Set(["--artifacts", "--commit", "--publisher-id", "--item-id"])
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument || !accepted.has(argument)) {
      throw new Error(`Unknown Chrome Web Store publish argument: ${argument ?? ""}`)
    }
    if (values.has(argument)) throw new Error(`${argument} may only be provided once`)
    const value = args[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`)
    values.set(argument, value)
    index += 1
  }
  const artifactsDirectory = values.get("--artifacts")
  const commit = values.get("--commit")
  const publisherId = values.get("--publisher-id")
  const itemId = values.get("--item-id")
  if (!artifactsDirectory || !commit || !publisherId || !itemId) {
    throw new Error(
      "Usage: publish-chrome-web-store --artifacts <directory> --commit <sha> " +
      "--publisher-id <id> --item-id <id>",
    )
  }
  if (!commitPattern.test(commit)) throw new Error("Release commit must be a lowercase 40-character SHA")
  validatePublisherId(publisherId)
  validateItemId(itemId)
  return { artifactsDirectory: path.resolve(artifactsDirectory), commit, publisherId, itemId }
}

async function main(args: readonly string[]): Promise<void> {
  const options = parseCliArguments(args)
  const candidate = await verifyReleaseArtifacts(options.artifactsDirectory)
  if (candidate.manifest.commit !== options.commit) {
    throw new Error("Release manifest commit does not match this workflow")
  }
  const accessToken = process.env.CHROME_WEB_STORE_ACCESS_TOKEN
  if (!accessToken) throw new Error("CHROME_WEB_STORE_ACCESS_TOKEN is required")
  const result = await publishChromeWebStore({
    accessToken,
    publisherId: options.publisherId,
    itemId: options.itemId,
    extensionVersion: candidate.manifest.extension.version,
    extensionBytes: new Uint8Array(await fs.readFile(candidate.extensionArtifactPath)),
  })
  console.log(JSON.stringify(result))
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main(process.argv.slice(2))
}
