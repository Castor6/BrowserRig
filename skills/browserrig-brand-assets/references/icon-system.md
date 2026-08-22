# BrowserRig Icon System

Use this reference for the brand mark, Chrome extension icon, toolbar icon, or
favicon-sized derivatives.

## Current Brief

The current working decision is a **BR monogram** paired with the literal
`BrowserRig` wordmark. Keep `BR` unless the user reopens the architecture. This
decision fixes the letters, not their typeface, construction, proportions, or
relationship.

BrowserRig is not yet recognizable enough for a monogram to replace the name
everywhere. Always show the symbol with the `BrowserRig` wordmark during review,
even though the extension and favicon ultimately use the symbol alone.

Do not inherit geometry from the existing purple `B` tile or orange coupler
draft. Neither is an approved starting point.

## What “High-End” Means Here

Aim for deliberate proportion, custom letter relationships, optical balance,
confident negative space, and restraint. A detail earns its place only when it
improves recognition, rhythm, or the BrowserRig idea.

“High-end” does not mean gold, hairline strokes, fake-heritage framing, a
fashion serif pasted onto initials, dramatic perspective, glass effects, or a
luxury mockup. “Technical” does not mean purple glow, neural nodes, terminal
chevrons, browser-window clip art, plugs, chain links, or a rounded-square app
tile used as the concept.

The result should feel capable and engineered without becoming industrial
machinery branding, esports lettering, or generic AI infrastructure.

## Exploration Axes

Use the workflow in the parent skill. Across the candidate set, vary the
construction logic materially. Useful axes include:

- adjacent letters versus a true ligature or shared-stroke construction;
- interlock, overlap, cut, counterform, or modular assembly;
- typographic restraint versus a more expressive custom register;
- solid mass versus open negative space;
- static authority versus a controlled sense of transfer or handoff.

These are axes, not required ingredients. Do not bolt a bridge, arrow, browser
tab, or cable onto otherwise generic initials to make the explanation fit.

Each territory should choose at most one real BrowserRig tension to give the
formal idea a reason to exist, for example external agent versus existing
browser, deterministic control versus visible human handoff, or local relay
versus user-owned tab. Express the relationship through letter construction,
spacing, interruption, counterform, or sequence—not by illustrating every
component. If the same construction still feels equally suitable for an
unrelated `BR` company, it needs a more ownable decision.

Reject a rough when:

- it is only typed `BR` with a frame or corner treatment;
- it could be relabeled as a VPN, crypto product, automation API, esports team,
  or luxury consultancy without redrawing;
- the `B` or `R` becomes ambiguous through clever overlap;
- its distinction disappears in monochrome or at toolbar size;
- the rationale is more memorable than the silhouette.

## Candidate Presentation

Make the current decision easy. Use stable option labels and give candidates
equal optical weight rather than equal bounding-box fill. Depending on the
request and stage, the presentation may use individual renders, a comparison
sheet, color or monochrome variants, construction views, wordmark lockups, or
context mockups. Do not prescribe one of these as the universal format.

When usability is being judged, show the mark at an actual toolbar size and in
the relevant light or dark browser context. When identity-system fit is being
judged, pair it with the literal `BrowserRig` wordmark. State the strongest
reading and likely misread when they affect the decision.

Inspect the pixels rather than only source paths. Check that counters remain
open, strokes do not disappear, and the letters do not merge into an ambiguous
blob. Create optically corrected small-size variants when one master SVG cannot
serve every size cleanly.

## Production Exports

Keep an editable SVG source with a `0 0 128 128` view box. Once approved, export:

- `extension/icons/icon-16.png`
- `extension/icons/icon-32.png`
- `extension/icons/icon-48.png`
- `extension/icons/icon-128.png`
- `docs/chrome-web-store/icon-128.png`

The Chrome Web Store icon must be a 128x128 PNG. For a square mark, keep the
actual artwork near 96x96 with about 16px transparent padding per side. Other
silhouettes should have comparable visual weight. Do not draw a border around
the full canvas, use a large drop shadow, or rely on perspective. Test the
final PNG on both light and dark backgrounds.

The official specification is the source of truth:
<https://developer.chrome.com/docs/webstore/images#extension-icon>.

Do not replace production paths until the selected design has passed the
vector refinement review and explicit approval.
