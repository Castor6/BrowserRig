import { describe, expect, it } from "vitest"
import { zipSync } from "fflate"
import {
  finalizeGitHubRelease,
  parseReleaseManifest,
  readReleaseCandidateArchive,
  releaseBody,
  sha256,
  sha512Integrity,
  type FetchLike,
  type ReleaseCandidate,
  type ReleaseManifest,
} from "../scripts/finalize-github-release.ts"

const encoder = new TextEncoder()
const apiBaseUrl = "https://api.example.test"
const uploadsBaseUrl = "https://uploads.example.test"
const registryBaseUrl = "https://registry.example.test"
const repository = "Castor6/BrowserRig"

const exactArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const jsonResponse = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
})

const bytesResponse = (value: Uint8Array, status = 200): Response =>
  new Response(exactArrayBuffer(value), { status })

interface CandidateFixture {
  readonly archive: Uint8Array
  readonly candidate: ReleaseCandidate
}

const makeCandidate = (): CandidateFixture => {
  const npmBytes = encoder.encode("browserrig npm tarball bytes")
  const extensionBytes = encoder.encode("browserrig extension zip bytes")
  const npmFile = "browserrig-0.2.1.tgz"
  const extensionFile = "browserrig-extension-0.1.1.zip"
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    commit: "0123456789abcdef0123456789abcdef01234567",
    tag: "v0.2.1",
    npm: {
      name: "browserrig",
      version: "0.2.1",
      file: npmFile,
      sha256: sha256(npmBytes),
      integrity: sha512Integrity(npmBytes),
    },
    extension: {
      name: "browserrig-extension",
      version: "0.1.1",
      protocolVersion: 3,
      file: extensionFile,
      sha256: sha256(extensionBytes),
    },
  }
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`)
  const checksumBytes = encoder.encode([
    `${manifest.npm.sha256}  ${npmFile}`,
    `${manifest.extension.sha256}  ${extensionFile}`,
    "",
  ].join("\n"))
  const archive = zipSync({
    [npmFile]: npmBytes,
    [extensionFile]: extensionBytes,
    "release-manifest.json": manifestBytes,
    SHA256SUMS: checksumBytes,
  })
  return { archive, candidate: readReleaseCandidateArchive(archive) }
}

interface StoredAsset {
  readonly id: number
  readonly name: string
  readonly bytes: Uint8Array
}

class ReleaseApiMock {
  readonly fixture: CandidateFixture
  npmStatus = 200
  npmIntegrity: string
  npmTarballBytes: Uint8Array
  tagCommit: string | undefined
  release: {
    id: number
    tag_name: string
    target_commitish: string
    name: string
    body: string
    draft: boolean
    prerelease: boolean
  } | undefined
  pendingTargetCommit: string | undefined
  artifactName: string
  workflowRuns: Array<{ id: number; status: string; conclusion: string; event: string }>
  readonly assets = new Map<string, StoredAsset>()
  readonly mutations: Array<{ readonly method: string; readonly path: string; readonly body?: unknown }> = []
  readonly requests: Array<{ readonly method: string; readonly url: string }> = []
  nextAssetId = 100

  constructor(fixture: CandidateFixture) {
    this.fixture = fixture
    this.npmIntegrity = fixture.candidate.manifest.npm.integrity
    const npmTarballBytes = fixture.candidate.files.get(fixture.candidate.manifest.npm.file)
    if (npmTarballBytes === undefined) throw new Error("fixture is missing npm bytes")
    this.npmTarballBytes = npmTarballBytes
    this.artifactName = `browserrig-release-candidate-v1-${fixture.candidate.manifest.commit}`
    this.workflowRuns = [{ id: 42, status: "completed", conclusion: "success", event: "pull_request" }]
  }

  installPublishedRelease(): void {
    this.tagCommit = this.fixture.candidate.manifest.commit
    this.release = {
      id: 7,
      tag_name: this.fixture.candidate.manifest.tag,
      target_commitish: this.fixture.candidate.manifest.commit,
      name: `BrowserRig ${this.fixture.candidate.manifest.tag}`,
      body: releaseBody(this.fixture.candidate.manifest),
      draft: false,
      prerelease: false,
    }
    for (const [name, bytes] of this.fixture.candidate.files) {
      this.assets.set(name, { id: this.nextAssetId++, name, bytes })
    }
  }

  readonly fetch: FetchLike = async (input, init = {}) => {
    const url = new URL(String(input))
    const method = init.method ?? "GET"
    const path = `${url.pathname}${url.search}`
    this.requests.push({ method, url: url.href })

    if (url.origin === registryBaseUrl) {
      if (url.pathname === "/browserrig/-/browserrig-0.2.1.tgz") {
        return bytesResponse(this.npmTarballBytes)
      }
      if (url.pathname !== "/browserrig/0.2.1") return jsonResponse({}, 404)
      if (this.npmStatus === 404) return jsonResponse({}, 404)
      return jsonResponse({
        name: "browserrig",
        version: "0.2.1",
        dist: {
          integrity: this.npmIntegrity,
          tarball: `${registryBaseUrl}/browserrig/-/browserrig-0.2.1.tgz`,
        },
      }, this.npmStatus)
    }

    if (url.origin === uploadsBaseUrl) {
      if (method !== "POST" || url.pathname !== "/repos/Castor6/BrowserRig/releases/7/assets") {
        return jsonResponse({}, 404)
      }
      const name = url.searchParams.get("name")
      if (name === null || this.assets.has(name)) return jsonResponse({}, 422)
      const bytes = await requestBodyBytes(init.body)
      const asset = { id: this.nextAssetId++, name, bytes }
      this.assets.set(name, asset)
      this.mutations.push({ method, path, body: bytes })
      return jsonResponse({ id: asset.id, name, size: bytes.byteLength })
    }

    if (url.origin !== apiBaseUrl) return jsonResponse({}, 404)

    if (method === "GET" && url.pathname === "/repos/Castor6/BrowserRig/actions/workflows/release.yml/runs") {
      return jsonResponse({ workflow_runs: this.workflowRuns })
    }
    if (method === "GET" && url.pathname === "/repos/Castor6/BrowserRig/actions/runs/42/artifacts") {
      return jsonResponse({
        artifacts: [{
          id: 55,
          name: this.artifactName,
          expired: false,
          size_in_bytes: this.fixture.archive.byteLength,
        }],
      })
    }
    if (method === "GET" && url.pathname === "/repos/Castor6/BrowserRig/actions/artifacts/55/zip") {
      const accept = new Headers(init.headers).get("Accept")
      if (accept !== "application/vnd.github+json") return jsonResponse({}, 415)
      return bytesResponse(this.fixture.archive)
    }
    if (method === "GET" && url.pathname === "/repos/Castor6/BrowserRig/releases") {
      return jsonResponse(this.release === undefined ? [] : [this.release])
    }
    if (method === "GET" && url.pathname === "/repos/Castor6/BrowserRig/git/ref/tags/v0.2.1") {
      return this.tagCommit === undefined
        ? jsonResponse({}, 404)
        : jsonResponse({ ref: "refs/tags/v0.2.1", object: { type: "commit", sha: this.tagCommit } })
    }
    if (method === "POST" && url.pathname === "/repos/Castor6/BrowserRig/releases") {
      const body = parseJsonBody(init.body)
      this.mutations.push({ method, path, body })
      this.pendingTargetCommit = String(body.target_commitish)
      this.release = {
        id: 7,
        tag_name: String(body.tag_name),
        target_commitish: String(body.target_commitish),
        name: String(body.name),
        body: String(body.body),
        draft: Boolean(body.draft),
        prerelease: Boolean(body.prerelease),
      }
      return jsonResponse(this.release)
    }
    if (method === "GET" && url.pathname === "/repos/Castor6/BrowserRig/releases/7/assets") {
      return jsonResponse([...this.assets.values()].map((asset) => ({
        id: asset.id,
        name: asset.name,
        size: asset.bytes.byteLength,
      })))
    }
    const assetMatch = /^\/repos\/Castor6\/BrowserRig\/releases\/assets\/(\d+)$/.exec(url.pathname)
    if (method === "GET" && assetMatch?.[1] !== undefined) {
      const id = Number(assetMatch[1])
      const asset = [...this.assets.values()].find((candidate) => candidate.id === id)
      return asset === undefined ? jsonResponse({}, 404) : bytesResponse(asset.bytes)
    }
    if (method === "PATCH" && url.pathname === "/repos/Castor6/BrowserRig/releases/7") {
      if (this.release === undefined) return jsonResponse({}, 404)
      const body = parseJsonBody(init.body)
      this.mutations.push({ method, path, body })
      this.release = { ...this.release, draft: Boolean(body.draft) }
      if (!this.release.draft) {
        this.tagCommit = this.pendingTargetCommit ?? this.fixture.candidate.manifest.commit
      }
      return jsonResponse(this.release)
    }
    return jsonResponse({}, 404)
  }
}

const parseJsonBody = (body: BodyInit | null | undefined): Record<string, unknown> => {
  if (typeof body !== "string") throw new Error("expected a JSON string body")
  return JSON.parse(body) as Record<string, unknown>
}

const requestBodyBytes = async (body: BodyInit | null | undefined): Promise<Uint8Array> => {
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength))
  }
  if (typeof body === "string") return encoder.encode(body)
  throw new Error("expected a byte request body")
}

const finalize = (api: ReleaseApiMock) => finalizeGitHubRelease({
  repository,
  token: "test-token",
  workflow: "release.yml",
  githubApiBaseUrl: apiBaseUrl,
  githubUploadsBaseUrl: uploadsBaseUrl,
  npmRegistryBaseUrl: registryBaseUrl,
  fetch: api.fetch,
})

describe("GitHub Release finalizer", () => {
  it("creates a draft, uploads the exact candidate assets, then publishes it", async () => {
    const api = new ReleaseApiMock(makeCandidate())

    await expect(finalize(api)).resolves.toEqual({
      status: "created",
      tag: "v0.2.1",
      version: "0.2.1",
      runId: 42,
    })

    expect(api.release?.draft).toBe(false)
    expect([...api.assets.keys()].sort()).toEqual([
      "SHA256SUMS",
      "browserrig-0.2.1.tgz",
      "browserrig-extension-0.1.1.zip",
      "release-manifest.json",
    ])
    for (const [name, bytes] of api.fixture.candidate.files) {
      expect(sha256(api.assets.get(name)?.bytes ?? new Uint8Array())).toBe(sha256(bytes))
    }

    const create = api.mutations.find((mutation) => mutation.method === "POST" && mutation.path.endsWith("/releases"))
    expect(create?.body).toMatchObject({
      tag_name: "v0.2.1",
      target_commitish: "0123456789abcdef0123456789abcdef01234567",
      draft: true,
      prerelease: false,
      generate_release_notes: true,
    })
    expect(String((create?.body as Record<string, unknown> | undefined)?.body)).toContain("browserrig@0.2.1")
    expect(String((create?.body as Record<string, unknown> | undefined)?.body)).toContain("0.1.1")
    expect(String((create?.body as Record<string, unknown> | undefined)?.body)).toContain("Extension protocol: `3`")
    expect(api.mutations.at(-1)).toMatchObject({ method: "PATCH", body: { draft: false } })
  })

  it("returns no-op for a fully matching published release", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.installPublishedRelease()

    await expect(finalize(api)).resolves.toEqual({
      status: "no-op",
      tag: "v0.2.1",
      version: "0.2.1",
      runId: 42,
    })
    expect(api.mutations).toEqual([])
  })

  it("resumes an incomplete draft that does not have a tag yet", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.release = {
      id: 7,
      tag_name: api.fixture.candidate.manifest.tag,
      target_commitish: api.fixture.candidate.manifest.commit,
      name: `BrowserRig ${api.fixture.candidate.manifest.tag}`,
      body: releaseBody(api.fixture.candidate.manifest),
      draft: true,
      prerelease: false,
    }
    const [existingName, existingBytes] = [...api.fixture.candidate.files][0] ?? []
    if (existingName === undefined || existingBytes === undefined) throw new Error("missing fixture asset")
    api.assets.set(existingName, { id: 99, name: existingName, bytes: existingBytes })

    await expect(finalize(api)).resolves.toMatchObject({ status: "created", tag: "v0.2.1" })
    expect(api.release.draft).toBe(false)
    expect(api.tagCommit).toBe(api.fixture.candidate.manifest.commit)
    expect(api.mutations.filter((mutation) => mutation.method === "POST")).toHaveLength(3)
    expect(api.mutations.some((mutation) => mutation.path.endsWith("/releases"))).toBe(false)
  })

  it("waits without mutating GitHub while the exact npm version is not public", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.npmStatus = 404

    await expect(finalize(api)).resolves.toEqual({
      status: "waiting",
      reason: "no-published-candidate",
    })
    expect(api.mutations).toEqual([])
    expect(api.release).toBeUndefined()
  })

  it("requests only pull-request workflow runs and defensively ignores manual runs", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.workflowRuns = [{ id: 42, status: "completed", conclusion: "success", event: "workflow_dispatch" }]

    await expect(finalize(api)).resolves.toEqual({
      status: "waiting",
      reason: "no-published-candidate",
    })
    const runsRequest = api.requests.find((request) => request.url.includes("/actions/workflows/"))
    expect(runsRequest?.url).toContain("event=pull_request")
    expect(api.requests.some((request) => request.url.includes("/actions/runs/42/artifacts"))).toBe(false)
  })

  it("rejects an artifact whose name does not bind to the manifest commit", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.artifactName = `browserrig-release-candidate-v1-${"f".repeat(40)}`

    await expect(finalize(api)).rejects.toThrow("artifact name does not match its release commit")
    expect(api.mutations).toEqual([])
  })

  it("fails closed when npm publishes different tarball bytes", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.npmIntegrity = sha512Integrity(encoder.encode("different tarball"))

    await expect(finalize(api)).rejects.toThrow("npm registry integrity conflicts")
    expect(api.mutations).toEqual([])
  })

  it("downloads npm's public tarball and rejects bytes that differ from the candidate", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.npmTarballBytes = encoder.encode("different public tarball bytes")

    await expect(finalize(api)).rejects.toThrow("npm registry tarball bytes conflict")
    expect(api.requests.some((request) => request.url.endsWith("/browserrig/-/browserrig-0.2.1.tgz"))).toBe(true)
    expect(api.mutations).toEqual([])
  })

  it("fails closed when an existing tag targets another commit", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.tagCommit = "ffffffffffffffffffffffffffffffffffffffff"

    await expect(finalize(api)).rejects.toThrow("targets a conflicting commit")
    expect(api.mutations).toEqual([])
  })

  it("fails closed when an existing release omits the component metadata", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.installPublishedRelease()
    if (api.release === undefined) throw new Error("missing fixture release")
    api.release = { ...api.release, body: "Different release notes" }

    await expect(finalize(api)).rejects.toThrow("Release body conflicts")
    expect(api.mutations).toEqual([])
  })

  it("fails closed instead of replacing a conflicting existing asset", async () => {
    const api = new ReleaseApiMock(makeCandidate())
    api.tagCommit = api.fixture.candidate.manifest.commit
    api.release = {
      id: 7,
      tag_name: api.fixture.candidate.manifest.tag,
      target_commitish: api.fixture.candidate.manifest.commit,
      name: `BrowserRig ${api.fixture.candidate.manifest.tag}`,
      body: releaseBody(api.fixture.candidate.manifest),
      draft: true,
      prerelease: false,
    }
    api.assets.set(api.fixture.candidate.manifest.npm.file, {
      id: 99,
      name: api.fixture.candidate.manifest.npm.file,
      bytes: encoder.encode("conflicting bytes"),
    })

    await expect(finalize(api)).rejects.toThrow(/asset .* (size|content) conflicts/)
    expect(api.assets.get(api.fixture.candidate.manifest.npm.file)?.id).toBe(99)
    expect(api.mutations).toEqual([])
  })

  it("rejects prerelease versions before making network requests", () => {
    const manifest = {
      ...makeCandidate().candidate.manifest,
      npm: { ...makeCandidate().candidate.manifest.npm, version: "0.2.1-rc.1" },
    }
    expect(() => parseReleaseManifest(manifest)).toThrow("stable x.y.z")
  })

  it("rejects oversized candidate archives before accepting their entries", () => {
    const crowded = zipSync(Object.fromEntries(
      Array.from({ length: 17 }, (_, index) => [`entry-${index}.txt`, encoder.encode("x")]),
    ))

    expect(() => readReleaseCandidateArchive(crowded)).toThrow("too many entries")
  })
})
