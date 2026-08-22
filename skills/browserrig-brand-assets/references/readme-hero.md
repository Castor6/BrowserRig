# README Hero

Use this reference for a horizontal graphic near the top of `README.md`.

## Purpose

The hero should make the product category and differentiator legible within a
few seconds: BrowserRig is the local connection between a trusted external
agent and the browser the user already runs. It is not a generic decorative AI
banner and should not imply a side panel or an autonomous agent.

Prefer one visual thesis, the BrowserRig name, and at most one concise support
line. The README text beneath it can carry setup details and feature lists.

## Construction

Use editable SVG or HTML/CSS for the composition, typography, logo, and product
diagram. A generated raster layer may supply atmosphere or texture only when it
materially improves the chosen direction. Keep generated text, logos, and fake
product UI out of the result.

Choose a wide aspect ratio that renders cleanly near 800px CSS width on GitHub.
The optional 1400x560 Store marquee can share source components, but do not
force one crop to serve both contexts if hierarchy suffers.

Show real product evidence when a browser or CLI surface appears. A restrained
architecture relationship can be more honest than a fabricated dashboard:

```text
trusted agent -> BrowserRig -> user's existing browser
```

Treat this as a relationship, not required literal copy.

## QA And Integration

Render and inspect the hero at its native size, around 800px wide, and on light
and dark page surroundings. Check that the name, mark, and central relationship
survive downscaling and that no critical content depends on a transparent
background color outside the image.

Provide meaningful README alt text. Keep the editable source next to the export
or in a clearly named source folder. Do not replace the README image until the
user has approved the direction.
