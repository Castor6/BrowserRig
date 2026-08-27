import { describe, expect, it, vi } from "vitest"
import { finalizeBrowserRigGrouping, isBrowserRigGroupTitle, isCurrentBrowserRigGroupTitle, isLegacyBrowserRigGroupTitle, shouldUngroupBrowserRigTab, tabGroupTitle, tabGroupVisibleTitle } from "../extension/src/tab-groups.ts"

describe("isBrowserRigGroupTitle", () => {
  it("matches the current and legacy BrowserRig group titles", () => {
    expect(tabGroupVisibleTitle).toBe("BrowserRig")
    expect(tabGroupTitle.replace("\u2063", "")).toBe("BrowserRig")
    expect(isBrowserRigGroupTitle(tabGroupTitle)).toBe(true)
    expect(isBrowserRigGroupTitle("control")).toBe(false)
    expect(isBrowserRigGroupTitle("browser-control")).toBe(true)
    expect(isBrowserRigGroupTitle("bc:cosmic-otter-866")).toBe(true)
    expect(isBrowserRigGroupTitle("bc · cos-ott-866")).toBe(true)
    expect(isCurrentBrowserRigGroupTitle(tabGroupTitle)).toBe(true)
    expect(isCurrentBrowserRigGroupTitle("control")).toBe(false)
    expect(isCurrentBrowserRigGroupTitle("browser-control")).toBe(false)
    expect(isLegacyBrowserRigGroupTitle(tabGroupTitle)).toBe(false)
    expect(isLegacyBrowserRigGroupTitle("browser-control")).toBe(true)
  })

  it("does not match unrelated groups", () => {
    expect(isBrowserRigGroupTitle(undefined)).toBe(false)
    expect(isBrowserRigGroupTitle("Control")).toBe(false)
    expect(isBrowserRigGroupTitle("abc:cosmic-otter-866")).toBe(false)
  })

})

describe("shouldUngroupBrowserRigTab", () => {
  it("ungroups detached tabs in BrowserRig groups", () => {
    expect(shouldUngroupBrowserRigTab("browser-control")).toBe(true)
    expect(shouldUngroupBrowserRigTab(tabGroupTitle)).toBe(true)
    expect(shouldUngroupBrowserRigTab("bc:cosmic-otter-866")).toBe(true)
    expect(shouldUngroupBrowserRigTab("bc · cos-ott-866")).toBe(true)
  })

  it("ungroups still-attached tabs from legacy BrowserRig groups", () => {
    expect(shouldUngroupBrowserRigTab("browser-control")).toBe(true)
    expect(shouldUngroupBrowserRigTab("bc:cosmic-otter-866")).toBe(true)
  })

  it("ignores non-BrowserRig groups even when detached", () => {
    expect(shouldUngroupBrowserRigTab("reading-list")).toBe(false)
    expect(shouldUngroupBrowserRigTab("control")).toBe(false)
    expect(shouldUngroupBrowserRigTab(undefined)).toBe(false)
  })
})

describe("finalizeBrowserRigGrouping", () => {
  it("updates a group while the originating connection is current", async () => {
    const update = vi.fn(async () => {})
    const rollback = vi.fn(async () => {})

    await finalizeBrowserRigGrouping({ assertCurrent: () => {}, update, rollback })

    expect(update).toHaveBeenCalledOnce()
    expect(rollback).not.toHaveBeenCalled()
  })

  it("rolls back a group created by a replaced connection", async () => {
    const replacement = new Error("connection replaced")
    const update = vi.fn(async () => {})
    const rollback = vi.fn(async () => {})

    await expect(finalizeBrowserRigGrouping({
      assertCurrent: () => { throw replacement },
      update,
      rollback,
    })).rejects.toBe(replacement)

    expect(rollback).toHaveBeenCalledOnce()
    expect(update).not.toHaveBeenCalled()
  })
})
