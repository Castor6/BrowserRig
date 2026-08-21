import { describe, expect, it } from "vitest"
import { isBrowserRigGroupTitle, isCurrentBrowserRigGroupTitle, isLegacyBrowserRigGroupTitle, shouldUngroupBrowserRigTab, tabGroupTitle, tabGroupVisibleTitle } from "../extension/src/tab-groups.ts"

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
