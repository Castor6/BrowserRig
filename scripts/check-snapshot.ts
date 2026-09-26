import assert from "node:assert/strict"
import { chromium } from "playwright-core"
import { registerAriaSnapshotSelector } from "../src/aria-snapshot.ts"
import { createSnapshotHelpers, fillInputs } from "../src/execute.ts"

// Real DOM and Playwright locators: deliberately separate from browser-free unit tests.
const browser = await chromium.launch({ channel: "chrome" })
console.log(`Google Chrome ${browser.version()}`)
const context = await browser.newContext()
await registerAriaSnapshotSelector(context)
const page = await context.newPage()
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
  for (const role of ["", ' role="button"']) {
    for (const mutation of ["reorder", "insert"]) {
      await check(`summary identity ${role ? "explicit button" : "native"} after ${mutation}`, async () => {
        await page.setContent(`<main><details><summary${role}><span>First item</span></summary></details><details><summary${role}>Second item</summary></details></main>`)
        const registry = { selectors: new Map() }
        const { snapshot, ref } = createSnapshotHelpers(page, registry)
        const outline = await snapshot()
        const id = outline.match(/(?:summary|button) "First item" \[ref=(e\d+)/)?.[1]
        assert.ok(id, outline)
        await ref(id).click({ timeout: 1_000 })
        assert.equal(await page.locator("details").first().getAttribute("open"), "")
        await page.locator("details").first().evaluate(element => element.removeAttribute("open"))
        await page.evaluate(mutation => {
          const main = document.querySelector("main")!
          if (mutation === "reorder") main.prepend(main.lastElementChild!)
          else main.insertAdjacentHTML("afterbegin", "<details><summary>Inserted item</summary></details>")
        }, mutation)
        const continued = createSnapshotHelpers(page, registry)
        assert.equal(await continued.ref(id).count(), 0, "A continued execute must retain summary identity")
        assert.equal(await ref(id).count(), 0, "A structural ref must not retarget a different summary")
        await assert.rejects(ref(id).click({ timeout: 150 }), /Timeout/)
        assert.equal(await page.locator("details[open]").count(), 0)
      })
    }
  }
  await check("native summary labels, image names and private descendants", async () => {
    await page.setContent('<main><span id="label">Labelled name</span><details><summary aria-labelledby="label">Other text</summary></details><details><summary><img alt="Image name"><textarea>private-summary-value</textarea><span hidden>private-hidden-text</span></summary></details></main>')
    const { snapshot, ref } = createSnapshotHelpers(page, { selectors: new Map() })
    const outline = await snapshot()
    assert.doesNotMatch(outline, /private-summary-value|private-hidden-text/)
    for (const name of ["Labelled name", "Image name"]) {
      const id = outline.match(new RegExp(`summary "${name}" \\[ref=(e\\d+)`))?.[1]
      assert.ok(id, outline)
      await ref(id).click({ timeout: 1_000 })
    }
    assert.equal(await page.locator("details[open]").count(), 2)
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
  for (const hidden of ['style="opacity:0"', "hidden", 'aria-hidden="true"']) {
    await check(`ancestor-hidden modal and restored scope: ${hidden}`, async () => {
      await page.setContent(`<main><h1>Visible background</h1><button>Real action</button></main><div id="portal" ${hidden}><div role="dialog" aria-modal="true" aria-label="Closed dialog"><button>Invisible action</button><input aria-label="Private" value="private-modal-value"></div></div>`)
      const { snapshot } = createSnapshotHelpers(page, { selectors: new Map() })
      const before = await snapshot()
      assert.match(before, /heading "Visible background"/)
      assert.match(before, /button "Real action"/)
      assert.doesNotMatch(before, /Closed dialog|Invisible action|private-modal-value/)
      await page.locator("#portal").evaluate(element => {
        element.removeAttribute("style")
        element.removeAttribute("hidden")
        element.removeAttribute("aria-hidden")
      })
      const after = await snapshot()
      assert.match(after, /dialog "Closed dialog"/)
      assert.match(after, /button "Invisible action"/)
      assert.doesNotMatch(after, /Visible background|Real action|private-modal-value/)
    })
  }
  for (const visibility of ["hidden", "collapse"]) {
    for (const native of [false, true]) {
      await check(`${native ? "native" : "ARIA"} modal restores ancestor visibility:${visibility}`, async () => {
        const modal = native
          ? '<dialog><h2>Visible modal</h2><button>Confirm</button><input aria-label="Private" value="private-restored-modal"></dialog>'
          : '<div role="dialog" aria-modal="true" style="visibility:visible"><h2>Visible modal</h2><button>Confirm</button><input aria-label="Private" value="private-restored-modal"></div>'
        await page.setContent(`<main><h1>Background</h1><div style="visibility:${visibility}">${modal}</div></main>`)
        if (native) await page.locator("dialog").evaluate(element => (element as HTMLDialogElement).showModal())
        const { snapshot, ref } = createSnapshotHelpers(page, { selectors: new Map() })
        const outline = await snapshot()
        assert.match(outline, /heading "Visible modal"/)
        assert.doesNotMatch(outline, /Background|private-restored-modal/)
        const id = outline.match(/button "Confirm" \[ref=(e\d+)/)?.[1]
        assert.ok(id, outline)
        await page.getByRole("button", { name: "Confirm" }).evaluate(element => {
          element.addEventListener("click", () => element.setAttribute("data-clicked", "yes"))
        })
        await ref(id).click({ timeout: 1_000 })
        assert.equal(await page.getByRole("button", { name: "Confirm" }).getAttribute("data-clicked"), "yes")
      })
    }
  }
  await check("visible descendants override visibility but not ancestor opacity", async () => {
    await page.setContent('<main><div style="visibility:hidden"><button>Still hidden</button><button style="visibility:visible">Restored action</button><p style="visibility:visible">Restored notice</p></div><div style="opacity:0"><button style="visibility:visible;opacity:1">Transparent action</button></div></main>')
    const { snapshot } = createSnapshotHelpers(page, { selectors: new Map() })
    const outline = await snapshot()
    assert.match(outline, /button "Restored action"/)
    assert.match(outline, /p "Restored notice"/)
    assert.doesNotMatch(outline, /Still hidden|Transparent action/)
  })
  await check("composed hidden ancestry remains excluded in explicit scopes", async () => {
    await page.setContent('<div id="host" style="opacity:0"><section slot="content"><button>Private slotted action</button></section></div>')
    await page.locator("#host").evaluate(element => {
      element.attachShadow({ mode: "open" }).innerHTML = '<div><slot name="content"></slot><button>Private shadow action</button></div>'
    })
    const { snapshot } = createSnapshotHelpers(page, { selectors: new Map() })
    assert.doesNotMatch(await snapshot({ within: page.locator("section") }), /Private slotted action/)
    assert.doesNotMatch(await snapshot({ within: page.locator("#host").locator("div") }), /Private shadow action/)
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
