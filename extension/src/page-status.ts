import type { JsonObject, PageStatus } from "../../src/protocol.ts"

export type PageStatusView = {
  readonly label: string
  readonly title: string
  readonly tone: "active" | "running" | "waiting"
  readonly message?: string
  readonly completion?: {
    readonly handoffId: string
    readonly label: string
  }
}

const stateLabels = {
  attached: "ON",
  running: "RUN",
  waiting: "WAIT",
} as const

const stateTitles = {
  attached: "BrowserRig is attached",
  running: "BrowserRig is running a script",
  waiting: "BrowserRig is waiting for you",
} as const

export function pageStatusView(status: PageStatus): PageStatusView {
  const label = status.state === "waiting"
    ? `BR · ${stateLabels.waiting}`
    : status.readOnly
    ? "BR · RO"
    : status.state === "running"
    ? `BR · ${stateLabels.running}`
    : "BR"

  const details = [
    stateTitles[status.state],
    status.owner === "session" ? "Session-owned tab" : "User-owned tab",
    status.sessionId ? `Session: ${status.sessionId}` : undefined,
    status.readOnly ? "Read-only" : undefined,
    status.message,
  ].filter((part): part is string => Boolean(part))

  return {
    label,
    title: details.join(". "),
    tone: status.state === "waiting" ? "waiting" : status.state === "attached" || status.readOnly ? "active" : "running",
    ...(status.state === "waiting" && status.message ? { message: status.message } : {}),
    ...(status.state === "waiting" && status.handoffId
      ? { completion: { handoffId: status.handoffId, label: "Continue" } }
      : {}),
  }
}

export function pageStatusFromJson(value: JsonObject | undefined): PageStatus | undefined {
  const state = value?.state
  const owner = value?.owner
  if ((state !== "attached" && state !== "running" && state !== "waiting") || (owner !== "session" && owner !== "user")) {
    return undefined
  }
  const message = value?.message
  const handoffId = value?.handoffId
  if (state === "waiting" && (typeof message !== "string" || typeof handoffId !== "string")) {
    return undefined
  }
  return {
    state,
    owner,
    ...(typeof value?.sessionId === "string" ? { sessionId: value.sessionId } : {}),
    ...(value?.readOnly === true ? { readOnly: true } : {}),
    ...(typeof message === "string" ? { message } : {}),
    ...(typeof handoffId === "string" ? { handoffId } : {}),
  }
}
