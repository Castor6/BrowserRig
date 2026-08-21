import { describe, expect, it } from "vitest"
import { tabCaptureGrantRequiredFailure } from "../extension/src/tab-capture-error.ts"
import { tabCaptureGrantRequiredErrorCode } from "../src/recording-protocol.ts"

describe("tab capture start errors", () => {
  it.each([
    "Extension has not been invoked for the current page",
    "Cannot capture this tab without the activeTab permission",
  ])("classifies Chrome user-invocation failures for the relay: %s", (message) => {
    expect(tabCaptureGrantRequiredFailure(new Error(message))).toEqual({
      success: false,
      code: tabCaptureGrantRequiredErrorCode,
      error: expect.stringContaining("Click the extension toolbar icon on this tab once"),
    })
  })

  it("does not misclassify unrelated tabCapture failures", () => {
    expect(tabCaptureGrantRequiredFailure(new Error("The tab has no content to capture"))).toBeUndefined()
  })
})
