import path from "node:path"
import type { Context } from "@deepseek-ai/cordis"
import type {} from "@deepseek-ai/dsh-attachment"
import type {} from "@deepseek-ai/dsh-system-prompt"
import Schema from "@deepseek-ai/schemastery"
import {
  BrowserRigDshAdapter,
  createBrowserRigDshTools,
  PackageBrowserRigCliRunner,
} from "./dsh-adapter.ts"
import { defaultDshSessionMapPath, DshSessionMap } from "./dsh-session-map.ts"

export const name = "browserrig-dsh"
export const inject = ["tools", "systemPrompt"]

export interface Config {
  /** Cooperative timeout advertised to DSH's tool timeout policy. */
  timeoutMs: number
  /** Per-stream stdout/stderr capture bound for the package-local CLI. */
  maxOutputBytes: number
  /** Durable DSH-session to BrowserRig-session mapping file. */
  sessionMapPath: string
}

export const Config: Schema<Config> = Schema.object({
  timeoutMs: Schema.natural().min(1_000).default(180_000),
  maxOutputBytes: Schema.natural().min(1_024).default(8 * 1024 * 1024),
  sessionMapPath: Schema.string().default(defaultDshSessionMapPath()),
})

export function apply(ctx: Context, config: Config): void {
  const lifetime = new AbortController()
  const runner = new PackageBrowserRigCliRunner(config.maxOutputBytes)
  const sessionMap = new DshSessionMap(path.resolve(config.sessionMapPath))
  const adapter = new BrowserRigDshAdapter(runner, sessionMap, lifetime.signal)

  for (const tool of createBrowserRigDshTools({
    adapter,
    config,
    attachments: () => ctx.get("attachments"),
  })) {
    ctx.tools.register(tool)
  }

  ctx.systemPrompt.section({
    name: "tool:browserrig",
    order: 145,
    text: [
      "BrowserRig controls the user's existing signed-in Chromium browser through a local extension; it is a driver, so you still decide and verify every action.",
      "Use browserrig_execute with Playwright code and follow inspect → act → verify. Prefer snapshot() before choosing locators, keep transient dependent interactions in one call, and return URL or page evidence rather than treating a click as success.",
      "Use browserrig_adopt_active when the task needs the user's current authenticated tab. For passkeys, 2FA, CAPTCHAs, payment confirmation, or other human-only steps, register handoff() before triggering the prompt and verify the result afterward.",
      "The plugin binds one persistent BrowserRig session to each DSH agent session. Never ask for, expose, or manage BrowserRig session ids, and do not install a separate BrowserRig skill for this DSH workflow.",
    ].join("\n\n"),
  })

  ctx.effect(() => () => {
    lifetime.abort(new DOMException("BrowserRig DSH plugin unloaded", "AbortError"))
  })
}
