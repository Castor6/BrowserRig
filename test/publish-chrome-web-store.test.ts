import { describe, expect, it } from "vitest"

import {
  browserRigChromeWebStoreItemId,
  ChromeWebStoreRequestError,
  publishChromeWebStore,
  releaseDisposition,
  type ChromeWebStoreFetch,
  type ChromeWebStoreStatus,
} from "../scripts/publish-chrome-web-store.ts"

const publisherId = "browserrig-publisher"
const accessToken = "short-lived-access-token"
const extensionBytes = new TextEncoder().encode("extension zip")

const revision = (state: string, version: string) => ({
  state,
  distributionChannels: [{ deployPercentage: 100, crxVersion: version }],
})

const statusResponse = (options: {
  readonly publishedVersion?: string
  readonly submittedVersion?: string
  readonly submittedState?: string
  readonly lastAsyncUploadState?: string
  readonly takenDown?: boolean
  readonly warned?: boolean
} = {}): Record<string, unknown> => ({
  name: `publishers/${publisherId}/items/${browserRigChromeWebStoreItemId}`,
  itemId: browserRigChromeWebStoreItemId,
  ...(options.publishedVersion
    ? { publishedItemRevisionStatus: revision("PUBLISHED", options.publishedVersion) }
    : {}),
  ...(options.submittedVersion
    ? {
        submittedItemRevisionStatus: revision(
          options.submittedState ?? "PENDING_REVIEW",
          options.submittedVersion,
        ),
      }
    : {}),
  ...(options.lastAsyncUploadState ? { lastAsyncUploadState: options.lastAsyncUploadState } : {}),
  takenDown: options.takenDown ?? false,
  warned: options.warned ?? false,
})

const jsonResponse = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status,
  headers: { "Content-Type": "application/json" },
})

type RecordedRequest = {
  readonly method: string
  readonly url: string
  readonly headers: Headers
  body?: Uint8Array
  json?: unknown
}

class ChromeWebStoreApiMock {
  readonly requests: RecordedRequest[] = []
  readonly statuses: Record<string, unknown>[]
  uploadResponse: Record<string, unknown> = {
    itemId: browserRigChromeWebStoreItemId,
    crxVersion: "0.2.0",
    uploadState: "SUCCEEDED",
  }
  publishResponse: Record<string, unknown> = {
    itemId: browserRigChromeWebStoreItemId,
    state: "PENDING_REVIEW",
  }
  failure: { readonly path: string; readonly status: number; readonly message: string } | undefined

  constructor(statuses: Record<string, unknown>[]) {
    this.statuses = [...statuses]
  }

  readonly fetch: ChromeWebStoreFetch = async (input, init = {}) => {
    const url = String(input)
    const method = init.method ?? "GET"
    const headers = new Headers(init.headers)
    const request: RecordedRequest = { method, url, headers }
    if (init.body instanceof ArrayBuffer) request.body = new Uint8Array(init.body)
    if (typeof init.body === "string") request.json = JSON.parse(init.body) as unknown
    this.requests.push(request)

    if (this.failure && url.endsWith(this.failure.path)) {
      return jsonResponse({ error: { message: this.failure.message } }, this.failure.status)
    }
    if (url.endsWith(":fetchStatus")) {
      const status = this.statuses.shift()
      if (!status) throw new Error("Unexpected status request")
      return jsonResponse(status)
    }
    if (url.includes("/upload/v2/") && url.endsWith(":upload")) return jsonResponse(this.uploadResponse)
    if (url.endsWith(":publish")) return jsonResponse(this.publishResponse)
    throw new Error(`Unexpected Chrome Web Store request: ${method} ${url}`)
  }
}

describe("Chrome Web Store publishing", () => {
  it("does not upload a candidate that is already public", async () => {
    const api = new ChromeWebStoreApiMock([statusResponse({ publishedVersion: "0.2.0" })])

    await expect(publishChromeWebStore({
      accessToken,
      publisherId,
      itemId: browserRigChromeWebStoreItemId,
      extensionVersion: "0.2.0",
      extensionBytes,
      fetcher: api.fetch,
    })).resolves.toEqual({
      status: "already-published",
      itemId: browserRigChromeWebStoreItemId,
      version: "0.2.0",
      state: "PUBLISHED",
      warnings: [],
    })
    expect(api.requests).toHaveLength(1)
    expect(api.requests[0]?.headers.get("Authorization")).toBe(`Bearer ${accessToken}`)
  })

  it("uploads the exact ZIP and submits DEFAULT_PUBLISH with warning blocking", async () => {
    const api = new ChromeWebStoreApiMock([statusResponse({ publishedVersion: "0.1.1" })])

    await expect(publishChromeWebStore({
      accessToken,
      publisherId,
      itemId: browserRigChromeWebStoreItemId,
      extensionVersion: "0.2.0",
      extensionBytes,
      fetcher: api.fetch,
    })).resolves.toEqual({
      status: "submitted",
      itemId: browserRigChromeWebStoreItemId,
      version: "0.2.0",
      state: "PENDING_REVIEW",
      warnings: [],
    })

    expect(api.requests.map(({ method, url }) => ({ method, path: new URL(url).pathname + new URL(url).search })))
      .toEqual([
        {
          method: "GET",
          path: `/v2/publishers/${publisherId}/items/${browserRigChromeWebStoreItemId}:fetchStatus`,
        },
        {
          method: "POST",
          path: `/upload/v2/publishers/${publisherId}/items/${browserRigChromeWebStoreItemId}:upload`,
        },
        {
          method: "POST",
          path: `/v2/publishers/${publisherId}/items/${browserRigChromeWebStoreItemId}:publish`,
        },
      ])
    expect(api.requests[1]?.headers.get("Content-Type")).toBe("application/zip")
    expect(api.requests[1]?.body).toEqual(extensionBytes)
    expect(api.requests[2]?.json).toEqual({
      publishType: "DEFAULT_PUBLISH",
      skipReview: false,
      blockOnWarnings: true,
    })
  })

  it("waits for an asynchronous upload before submitting", async () => {
    const api = new ChromeWebStoreApiMock([
      statusResponse({ publishedVersion: "0.1.1" }),
      statusResponse({ publishedVersion: "0.1.1", lastAsyncUploadState: "IN_PROGRESS" }),
      statusResponse({ publishedVersion: "0.1.1", lastAsyncUploadState: "SUCCEEDED" }),
    ])
    api.uploadResponse = {
      itemId: browserRigChromeWebStoreItemId,
      uploadState: "IN_PROGRESS",
    }
    const sleeps: number[] = []

    const result = await publishChromeWebStore({
      accessToken,
      publisherId,
      itemId: browserRigChromeWebStoreItemId,
      extensionVersion: "0.2.0",
      extensionBytes,
      fetcher: api.fetch,
      sleep: async (milliseconds) => { sleeps.push(milliseconds) },
      uploadPollIntervalMs: 25,
    })

    expect(result.status).toBe("submitted")
    expect(sleeps).toEqual([25, 25])
    expect(api.requests.filter(({ url }) => url.endsWith(":fetchStatus"))).toHaveLength(3)
  })

  it("treats the same pending submission as a successful retry", async () => {
    const api = new ChromeWebStoreApiMock([
      statusResponse({
        publishedVersion: "0.1.1",
        submittedVersion: "0.2.0",
        submittedState: "PENDING_REVIEW",
      }),
    ])

    const result = await publishChromeWebStore({
      accessToken,
      publisherId,
      itemId: browserRigChromeWebStoreItemId,
      extensionVersion: "0.2.0",
      extensionBytes,
      fetcher: api.fetch,
    })

    expect(result.status).toBe("already-submitted")
    expect(api.requests).toHaveLength(1)
  })

  it("fails closed on conflicting submissions, policy warnings, and staged releases", () => {
    const base: ChromeWebStoreStatus = {
      itemId: browserRigChromeWebStoreItemId,
      published: { state: "PUBLISHED", versions: ["0.1.1"] },
      takenDown: false,
      warned: false,
    }
    expect(() => releaseDisposition({
      ...base,
      submitted: { state: "PENDING_REVIEW", versions: ["0.2.0"] },
    }, "0.3.0")).toThrow("active PENDING_REVIEW submission")
    expect(() => releaseDisposition({ ...base, warned: true }, "0.2.0")).toThrow("policy warning")
    expect(() => releaseDisposition({
      ...base,
      submitted: { state: "STAGED", versions: ["0.2.0"] },
    }, "0.2.0")).toThrow("staged instead of configured for automatic publishing")
  })

  it("keeps the API message at the top level without exposing the access token", async () => {
    const api = new ChromeWebStoreApiMock([])
    api.failure = {
      path: ":fetchStatus",
      status: 403,
      message: `Publisher is not authorized with ${accessToken}`,
    }

    const failure = publishChromeWebStore({
      accessToken,
      publisherId,
      itemId: browserRigChromeWebStoreItemId,
      extensionVersion: "0.2.0",
      extensionBytes,
      fetcher: api.fetch,
    })
    await expect(failure).rejects.toBeInstanceOf(ChromeWebStoreRequestError)
    await expect(failure).rejects.toThrow("Publisher is not authorized")
    await expect(failure).rejects.toThrow("[REDACTED]")
    await expect(failure).rejects.not.toThrow(accessToken)
  })
})
