export const tabGroupVisibleTitle = "BrowserRig"
// Keep BrowserRig's visible group distinct from a user's own group with the
// same title. Chrome renders U+2063 without visible width.
export const tabGroupTitle = `${tabGroupVisibleTitle}\u2063`
export const legacyTabGroupTitle = "browser-control"
export const legacySessionTabGroupTitlePrefix = "bc:"
export const legacyCompactSessionTabGroupTitlePrefix = "bc · "
export const tabGroupColor = "purple" as const

export function isCurrentBrowserRigGroupTitle(title: string | undefined): boolean {
  return title === tabGroupTitle
}

export function isLegacyBrowserRigGroupTitle(title: string | undefined): boolean {
  return title === legacyTabGroupTitle || title?.startsWith(legacySessionTabGroupTitlePrefix) === true || title?.startsWith(legacyCompactSessionTabGroupTitlePrefix) === true
}

export function isBrowserRigGroupTitle(title: string | undefined): boolean {
  return isCurrentBrowserRigGroupTitle(title) || isLegacyBrowserRigGroupTitle(title)
}

export function shouldUngroupBrowserRigTab(groupTitle: string | undefined): boolean {
  return isBrowserRigGroupTitle(groupTitle)
}
