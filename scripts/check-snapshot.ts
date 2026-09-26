import assert from "node:assert/strict"
import { chromium } from "playwright-core"
import { createSnapshotHelpers, fillInputs } from "../src/execute.ts"

// Real DOM and Playwright locators: deliberately separate from browser-free unit tests.
const browser = await chromium.launch({ channel: "chrome" })
console.log(`Google Chrome ${browser.version()}`)
const page = await browser.newPage()
const failures: string[] = []
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run()
    console.log(`PASS ${name}`)
  } catch (error) {
    failures.push(name)
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`)
  }
}
try {
  for (const [type, role] of [["number", "spinbutton"], ["search", "searchbox"]] as const) {
    await check(`${type} input refs`, async () => {
      await page.setContent(`<main><label>Amount<input type="${type}" name="amount"></label></main>`)
      const { snapshot, ref } = createSnapshotHelpers(page, { selectors: new Map() })
      const outline = await snapshot()
      assert.match(outline, new RegExp(`${role} "Amount"`))
      const id = outline.match(/ref=(e\d+)/)?.[1]
      assert.ok(id)
      await ref(id).fill("12", { timeout: 1_000 })
      assert.equal(await page.getByRole(role, { name: "Amount" }).inputValue(), "12")
    })
  }
  await check("native summary ref", async () => {
    await page.setContent('<main><details><summary>Show details</summary><p>Revealed</p></details></main>')
    const { snapshot, ref } = createSnapshotHelpers(page, { selectors: new Map() })
    const outline = await snapshot()
    const id = outline.match(/(?:button|summary) "Show details" \[ref=(e\d+)/)?.[1]
    assert.ok(id, outline)
    await ref(id).click({ timeout: 1_000 })
    assert.equal(await page.locator("details").getAttribute("open"), "")
  })
  await check("portal dialog outside main", async () => {
    await page.setContent('<main><h1>Background</h1><button>Open account</button></main><div role="dialog" aria-modal="true" aria-label="New account"><label>Name<input></label><button>Save account</button></div>')
    const { snapshot, ref } = createSnapshotHelpers(page, { selectors: new Map() })
    const outline = await snapshot()
    assert.match(outline, /dialog "New account"/)
    const id = outline.match(/button "Save account" \[ref=(e\d+)/)?.[1]
    assert.ok(id, outline)
    assert.equal(await ref(id).count(), 1)
    assert.match(await snapshot({ within: "main" }), /heading "Background"/)
  })
  await check("nested product list budget", async () => {
    await page.setContent(`<main><h1>Products</h1>${Array.from({ length: 100 }, (_, i) => `<ul><li><ul><li><a href="#product-${i}">Strawberry product ${i}</a><button>Add product ${i}</button></li></ul></li></ul>`).join("")}</main>`)
    const { snapshot, ref } = createSnapshotHelpers(page, { selectors: new Map() })
    const outline = await snapshot({ maxItems: 30 })
    assert.match(outline, /link "Strawberry product 0"/)
    assert.match(outline, /list "List"/)
    const id = outline.match(/link "Strawberry product 0" \[ref=(e\d+)/)?.[1]
    assert.ok(id, outline)
    assert.equal(await ref(id).count(), 1)
    assert.ok(outline.split("\n").length <= 31)
  })
  await check("explicit summary role is preserved", async () => {
    await page.setContent('<main><details><summary role="button">Explicit button</summary><p>Details</p></details></main>')
    const { snapshot, ref } = createSnapshotHelpers(page, { selectors: new Map() })
    assert.match(await snapshot(), /button "Explicit button" \[ref=e1/)
    await ref("e1").click({ timeout: 1_000 })
    assert.equal(await page.locator("details").getAttribute("open"), "")
  })
  await check("non-modal portal and background remain visible", async () => {
    await page.setContent('<main><h1>Background</h1></main><div role="dialog" aria-label="Help"><button>Close help</button></div>')
    const { snapshot } = createSnapshotHelpers(page, { selectors: new Map() })
    const outline = await snapshot()
    assert.match(outline, /heading "Background"/)
    assert.match(outline, /button "Close help"/)
  })
  await check("hidden modal does not hide main", async () => {
    await page.setContent('<main><h1>Background</h1></main><div role="dialog" aria-modal="true" hidden><button>Invisible</button></div>')
    const { snapshot } = createSnapshotHelpers(page, { selectors: new Map() })
    const outline = await snapshot()
    assert.match(outline, /heading "Background"/)
    assert.doesNotMatch(outline, /Invisible/)
  })
  await check("search refs, explicit diff and navigation boundaries", async () => {
    await page.setContent('<main><h1>Account</h1><label>Private<input value="secret-form-value"></label><button>Checkout</button></main>')
    const { snapshot, ref } = createSnapshotHelpers(page, { selectors: new Map() })
    const outline = await snapshot({ find: /checkout/gi, context: 0 })
    assert.match(outline, /1 matching snapshot line/)
    assert.doesNotMatch(outline, /secret-form-value/)
    const id = outline.match(/ref=(e\d+)/)?.[1]
    assert.ok(id, outline)
    assert.equal(await ref(id).count(), 1)
    await assert.rejects(snapshot({ diff: true, find: "checkout" }), /either diff or find/)
    assert.match(await snapshot({ diff: true }), /0 additions, 0 removals/)
    assert.throws(() => ref(id), /Unknown snapshot ref/)
    await snapshot({ find: "checkout" })
    await page.goto("about:blank#next-document")
    assert.throws(() => ref(id), /stale after a page change/)
  })
  await check("contenteditable plain text, events, focus and target validation", async () => {
    await page.setContent('<input id="focus"><div id="editor" contenteditable="true"><b>Before</b></div><div id="disabled" contenteditable="false">Keep</div><div id="host"></div>')
    await page.locator("#focus").focus()
    await page.evaluate(() => {
      const editor = document.querySelector("#editor")!
      for (const type of ["input", "change"]) editor.addEventListener(type, () => editor.setAttribute(`data-${type}`, "yes"))
      document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML = '<div id="shadow-editor" contenteditable="plaintext-only">Before</div>'
    })
    await fillInputs(page, [{ selector: "#editor", value: "<b>Literal</b>\nNext" }, { selector: page.locator("#shadow-editor"), value: "Shadow text" }])
    assert.equal(await page.locator("#editor").textContent(), "<b>Literal</b>\nNext")
    assert.equal(await page.locator("#editor b").count(), 0)
    assert.equal(await page.locator("#editor").getAttribute("data-input"), "yes")
    assert.equal(await page.locator("#editor").getAttribute("data-change"), "yes")
    assert.equal(await page.locator("#shadow-editor").textContent(), "Shadow text")
    assert.equal(await page.evaluate(() => document.activeElement?.id), "focus")
    await assert.rejects(fillInputs(page, [{ selector: "#disabled", value: "private-rejected-value" }]), /expects input, textarea, or contenteditable/)
    assert.equal(await page.locator("#disabled").textContent(), "Keep")
    await fillInputs(page, [{ selector: "#shadow-editor", value: "String shadow target" }])
    assert.equal(await page.locator("#shadow-editor").textContent(), "String shadow target")
  })
} finally {
  await browser.close()
}
assert.deepEqual(failures, [], "Snapshot regressions failed")
