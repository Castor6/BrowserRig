---
name: browserrig-brand-assets
description: Coordinate BrowserRig logo and icon exploration, critique, production, Chrome Web Store visuals, and README hero graphics. Use for BrowserRig brand assets; do not use for extension runtime UI or generic repository documentation.
---

# BrowserRig Brand Assets

This skill is the BrowserRig-specific adapter around the project-local logo
methods. It preserves product truth, routes each deliverable to the right
method, and keeps exploratory candidates separate from approved production
assets.

## Establish Product Truth

Read `CONTEXT.md`, the opening of `README.md`, and the relevant shipped UI or
assets before proposing visuals.

BrowserRig is a local browser driver for trusted external agents. It gives
those agents controlled access to the user's existing, visible,
Chromium-family browser through an extension and local relay. BrowserRig does
not contain an LLM, plan tasks, or provide an AI chat/sidebar experience.

The product name is fixed as **BrowserRig**. Never invent a replacement name,
sub-brand, or product-like label. Internal option labels must remain visibly
secondary.

Treat bridge, channel, port, relay, rigging, browser, or handoff as possible
relationships, not mandatory literal symbols. Repository details are evidence
for judging a direction; they are not a checklist of shapes to force into one
mark.

Read [references/brand-direction.md](references/brand-direction.md) for the
current positioning, visual preferences, and rejected drafts.

## Route The Deliverable

### Logo, extension icon, toolbar mark, or favicon

Before doing logo work, read both sibling skills completely:

- [`../logo-design/SKILL.md`](../logo-design/SKILL.md) supplies architecture,
  typographic register, symbol, application, and production discipline.
- [`../logo-design-board-cn/SKILL.md`](../logo-design-board-cn/SKILL.md)
  supplies an independent critique committee and quality rubric.

Follow the reference-loading instructions inside those skills, then read
[references/icon-system.md](references/icon-system.md). Use `logo-design` to
generate the design space and `logo-design-board-cn` to challenge it. Do not
average the two into a single agreeable opinion.

### Chrome Web Store imagery

Read [references/chrome-web-store.md](references/chrome-web-store.md). Use an
approved identity if one exists. If it does not, label Store work as a layout
study and keep the logo layer replaceable.

### README banner or repository hero

Read [references/readme-hero.md](references/readme-hero.md). Establish the mark
and visual direction first; do not use a dramatic banner to conceal an
unresolved identity.

## Logo And Icon Output

When the user asks to make, draw, generate, or compare icons, make visual icon
candidates the primary deliverable. Choose the appropriate fidelity and
presentation from the request; do not force either a concept-board-first or a
finished-color-first process.

Use the brief, reference scan, collision check, and design-committee critique
where they improve the work, without turning the method into the deliverable.
Vary mark architecture, typographic register, letter relationship, silhouette,
and formal idea. Holding `BR` constant does not justify holding the
construction constant. Reject generic, ambiguous, or small-size failures before
showing them.

Present candidates in whichever combination best supports the current
decision: individual icons, a comparison sheet, color variants, monochrome
studies, construction sketches, wordmark lockups, or realistic context
previews. Include a real extension-size rendering when judging usability. Do
not impose a presentation format that the user did not ask for, and never imply
that an AI-generated logo image is production geometry.

After the user selects a candidate, refine its editable vector, optical balance,
small-size variants, and wordmark lockups. Replace production paths only after
the refined direction is explicitly approved.

## Work From Evidence

Use real BrowserRig behavior, browser captures, CLI output, and architecture.
Never fabricate a dashboard, side panel, browser state, endorsement, metric, or
capability. Remove private account data, tokens, form values, and unrelated
browser chrome from captures.

Image generation can accelerate rough logo ideation and can supply an
illustrative background or texture for an approved campaign direction.
Generated lettering, logo geometry, and purported product screenshots are
never source of truth. Redraw selected marks as vectors and use project-owned
captures for product evidence.

If an external font, icon, texture, or image is introduced, record its source
and license beside the working files.

## Verify And Hand Off

Render and inspect actual artifacts on light and dark surfaces, at full size
and at the smallest intended size. After each pass, name the most important
remaining defect. Correct dimensions alone are not visual QA.

Before final handoff:

1. Identify which files are rough, shortlisted, approved, or production-ready.
2. Distinguish editable sources from exports.
3. Verify every marketing claim against the current repository.
4. Run the Store asset checker for raster deliverables:

   ```bash
   node skills/browserrig-brand-assets/scripts/check-store-assets.mjs --help
   ```

5. Do not modify production icons, Store assets, or README integration without
   explicit approval of the direction.
