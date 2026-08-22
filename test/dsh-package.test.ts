import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { Context } from "@deepseek-ai/cordis"
import { apply, inject, name } from "../src/dsh-plugin.ts"

describe("BrowserRig DSH bundle", () => {
  it("declares the official bundle patch and package subpath", async () => {
    const packageJson = JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), "utf8")) as {
      readonly dsh?: { readonly bundle?: { readonly patch?: string } }
      readonly exports?: Record<string, unknown>
      readonly files?: readonly string[]
      readonly peerDependenciesMeta?: Record<string, { readonly optional?: boolean }>
      readonly scripts?: Record<string, string>
    }
    const patch = await fs.readFile(path.join(process.cwd(), "cordis.patch.yml"), "utf8")

    expect(packageJson.dsh?.bundle?.patch).toBe("./cordis.patch.yml")
    expect(packageJson.exports).toHaveProperty("./dsh")
    expect(packageJson.files).toContain("cordis.patch.yml")
    expect(packageJson.peerDependenciesMeta?.effect?.optional).toBe(true)
    expect(packageJson.scripts).not.toHaveProperty("install")
    expect(packageJson.scripts).not.toHaveProperty("postinstall")
    expect(packageJson.scripts).not.toHaveProperty("prepare")
    expect(patch).toBe("- insert:\n    - id: browserrig\n      name: browserrig/dsh\n")
  })

  it("registers five native tools and scoped DSH guidance", () => {
    const register = vi.fn()
    const section = vi.fn()
    let dispose: (() => void) | undefined
    const ctx = {
      tools: { register },
      systemPrompt: { section },
      get: vi.fn(() => undefined),
      effect: vi.fn((factory: () => () => void) => {
        dispose = factory()
      }),
    } as unknown as Context

    apply(ctx, {
      timeoutMs: 180_000,
      maxOutputBytes: 8 * 1024 * 1024,
      sessionMapPath: "/tmp/browserrig-dsh-package-test/sessions.json",
    })

    expect(name).toBe("browserrig-dsh")
    expect(inject).toEqual(["tools", "systemPrompt"])
    expect(register.mock.calls.map(call => call[0].name)).toEqual([
      "browserrig_execute",
      "browserrig_adopt_active",
      "browserrig_status",
      "browserrig_reset",
      "browserrig_journal",
    ])
    expect(section).toHaveBeenCalledWith(expect.objectContaining({
      name: "tool:browserrig",
      order: 145,
      text: expect.stringMatching(/inspect → act → verify[\s\S]*do not install a separate BrowserRig skill/),
    }))

    expect(dispose).toBeTypeOf("function")
    dispose?.()
  })
})
