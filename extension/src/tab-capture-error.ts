import { tabCaptureGrantRequiredErrorCode } from "../../src/recording-protocol.ts"

export type TabCaptureGrantRequiredFailure = {
  readonly success: false
  readonly code: typeof tabCaptureGrantRequiredErrorCode
  readonly error: string
}

export function tabCaptureGrantRequiredFailure(error: unknown): TabCaptureGrantRequiredFailure | undefined {
  const chromeMessage = error instanceof Error ? error.message : String(error)
  const normalized = chromeMessage.toLowerCase()
  if (!normalized.includes("extension has not been invoked") && !normalized.includes("activetab")) {
    return undefined
  }
  return {
    success: false,
    code: tabCaptureGrantRequiredErrorCode,
    error: `Chrome denied tab capture because this tab lacks the activeTab grant created by a user invocation. Click the extension toolbar icon on this tab once; if that detaches the tab, run session adopt --active again before retrying. Chrome error: ${chromeMessage}`,
  }
}
