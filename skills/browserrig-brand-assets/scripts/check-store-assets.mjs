#!/usr/bin/env node

import { readFile } from "node:fs/promises"
import { extname } from "node:path"

const slots = new Map([
  ["--icon", { label: "Store icon", sizes: [[128, 128]], pngOnly: true, repeatable: false }],
  ["--extension-icon-16", { label: "Extension icon 16", sizes: [[16, 16]], pngOnly: true, repeatable: false }],
  ["--extension-icon-32", { label: "Extension icon 32", sizes: [[32, 32]], pngOnly: true, repeatable: false }],
  ["--extension-icon-48", { label: "Extension icon 48", sizes: [[48, 48]], pngOnly: true, repeatable: false }],
  ["--extension-icon-128", { label: "Extension icon 128", sizes: [[128, 128]], pngOnly: true, repeatable: false }],
  ["--screenshot", { label: "Screenshot", sizes: [[1280, 800], [640, 400]], pngOnly: false, repeatable: true }],
  ["--small-promo", { label: "Small promo", sizes: [[440, 280]], pngOnly: false, repeatable: false }],
  ["--marquee", { label: "Marquee", sizes: [[1400, 560]], pngOnly: false, repeatable: false }],
])

const usage = `Usage:
  node check-store-assets.mjs [slot path]...

Slots:
  --icon PATH                128x128 PNG Store icon
  --extension-icon-16 PATH   16x16 PNG extension icon
  --extension-icon-32 PATH   32x32 PNG extension icon
  --extension-icon-48 PATH   48x48 PNG extension icon
  --extension-icon-128 PATH  128x128 PNG extension icon
  --screenshot PATH          1280x800 or 640x400 PNG/JPEG; repeat up to 5
  --small-promo PATH         440x280 PNG/JPEG
  --marquee PATH             1400x560 PNG/JPEG

This validates raster type, dimensions, and screenshot count. It does not
evaluate icon padding, visual quality, privacy, or marketing accuracy.`

function fail(message) {
  console.error(`ERROR: ${message}`)
  process.exitCode = 1
}

function parseArguments(args) {
  const items = []
  const seen = new Map()

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const path = args[index + 1]
    const slot = slots.get(flag)

    if (!slot) throw new Error(`Unknown slot: ${flag ?? "<missing>"}`)
    if (!path || path.startsWith("--")) throw new Error(`Missing path after ${flag}`)

    const count = (seen.get(flag) ?? 0) + 1
    seen.set(flag, count)
    if (!slot.repeatable && count > 1) throw new Error(`${flag} may be provided only once`)

    items.push({ path, slot })
  }

  const screenshotCount = seen.get("--screenshot") ?? 0
  if (screenshotCount > 5) {
    throw new Error(`Chrome Web Store accepts at most 5 screenshots; received ${screenshotCount}`)
  }

  return items
}

function pngDimensions(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return undefined
  if (buffer.toString("ascii", 12, 16) !== "IHDR") throw new Error("Malformed PNG: IHDR is missing")
  return { type: "PNG", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ])
  let offset = 2

  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1
    if (offset >= buffer.length) break

    const marker = buffer[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= buffer.length) break

    const segmentLength = buffer.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      throw new Error("Malformed JPEG segment")
    }

    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) throw new Error("Malformed JPEG start-of-frame segment")
      return {
        type: "JPEG",
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      }
    }

    offset += segmentLength
  }

  throw new Error("JPEG dimensions were not found")
}

async function inspectRaster(path) {
  const buffer = await readFile(path)
  const raster = pngDimensions(buffer) ?? jpegDimensions(buffer)
  if (raster) return raster
  const extension = extname(path)
  throw new Error(`Unsupported raster format${extension ? ` (${extension})` : ""}; expected PNG or JPEG`)
}

function expectedSizes(sizes) {
  return sizes.map(([width, height]) => `${width}x${height}`).join(" or ")
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(usage)
  process.exit(0)
}

let items
try {
  items = parseArguments(process.argv.slice(2))
  if (items.length === 0) throw new Error("No assets provided")
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
  console.error(`\n${usage}`)
  process.exit()
}

for (const { path, slot } of items) {
  try {
    const raster = await inspectRaster(path)
    const sizeMatches = slot.sizes.some(
      ([width, height]) => raster.width === width && raster.height === height,
    )
    if (!sizeMatches) {
      fail(`${slot.label}: ${path} is ${raster.width}x${raster.height}; expected ${expectedSizes(slot.sizes)}`)
      continue
    }
    if (slot.pngOnly && raster.type !== "PNG") {
      fail(`${slot.label}: ${path} is ${raster.type}; expected PNG`)
      continue
    }
    console.log(`OK: ${slot.label}: ${path} (${raster.type}, ${raster.width}x${raster.height})`)
  } catch (error) {
    fail(`${slot.label}: ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
