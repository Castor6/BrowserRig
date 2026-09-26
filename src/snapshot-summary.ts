// This reader is serialized into both capture and the selector engine so that
// native summary refs compare exactly the identity shown in the snapshot.
export function snapshotSummaryName(element: Element): string {
  const normalize = (value: string): string => value.replace(/\s+/g, " ").trim()
  const ariaLabel = element.getAttribute("aria-label")
  if (ariaLabel) return normalize(ariaLabel)
  const labelledBy = element.getAttribute("aria-labelledby")
  if (labelledBy) {
    const text = normalize(labelledBy.split(/\s+/).map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "").join(" "))
    if (text) return text
  }
  const title = normalize(element.getAttribute("title") ?? "")
  if (title) return title
  const alt = element.getAttribute("alt")
  if (alt) return normalize(alt)
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  const parts: string[] = []
  let node = walker.nextNode()
  while (node) {
    const parent = node instanceof Element ? node : node.parentElement
    let hidden = false
    let ancestor = parent
    while (ancestor && element.contains(ancestor)) {
      const style = window.getComputedStyle(ancestor)
      if (ancestor.hasAttribute("hidden") || ancestor.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        hidden = true
        break
      }
      if (ancestor === element) break
      ancestor = ancestor.parentElement
    }
    if (!hidden && !parent?.closest("input, textarea, select, script, style")) {
      if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent ?? "")
      else if (node instanceof HTMLImageElement) parts.push(node.getAttribute("alt") ?? "")
    }
    node = walker.nextNode()
  }
  return normalize(parts.join(" "))
}

