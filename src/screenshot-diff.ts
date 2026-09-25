import fs from "node:fs/promises"
import path from "node:path"
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"
import type { Page } from "playwright-core"

const maxImageBytes = 32 * 1024 * 1024
const maxImagePixels = 16 * 1024 * 1024
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export type ScreenshotDiffOptions = {
  readonly baseline: string | Buffer
  readonly path?: string
  /** Per-pixel perceptual color threshold, 0..1. Not a changed-area allowance. */
  readonly threshold?: number
  readonly fullPage?: boolean
}

export type ScreenshotDiffResult = {
  readonly matches: boolean
  readonly width: number
  readonly height: number
  readonly changedPixels: number
  readonly totalPixels: number
  readonly changedRatio: number
  readonly threshold: number
  readonly image?: Buffer
  readonly path?: string
}

export function createScreenshotDiff(page: Pick<Page, "screenshot">): (options: ScreenshotDiffOptions) => Promise<ScreenshotDiffResult> {
  return async (options) => {
    const threshold = validateThreshold(options.threshold ?? 0.1)
    if (options.path !== undefined && (!path.isAbsolute(options.path) || path.extname(options.path).toLowerCase() !== ".png")) {
      throw new Error("screenshotDiff output path must be an absolute .png path")
    }
    const baseline = typeof options.baseline === "string" ? await readBaseline(options.baseline) : options.baseline
    const before = decodePng(baseline)
    const current = await page.screenshot({ type: "png", scale: "css", fullPage: options.fullPage ?? false })
    const after = decodePng(current)
    if (before.width !== after.width || before.height !== after.height) {
      throw new Error(`Screenshot dimensions differ: baseline ${before.width}×${before.height}, current ${after.width}×${after.height}. Capture both at the same CSS viewport and fullPage setting; images are never resized.`)
    }
    const diff = new PNG({ width: before.width, height: before.height })
    const changedPixels = pixelmatch(before.data, after.data, diff.data, before.width, before.height, {
      threshold,
      includeAA: true,
    })
    const image = PNG.sync.write(diff)
    const totalPixels = before.width * before.height
    // Exclusive creation also rejects symlinks/hardlinks to the baseline.
    if (options.path) await fs.writeFile(options.path, image, { flag: "wx", mode: 0o600 })
    return {
      matches: changedPixels === 0,
      width: before.width,
      height: before.height,
      changedPixels,
      totalPixels,
      changedRatio: changedPixels / totalPixels,
      threshold,
      ...(options.path ? { path: options.path } : { image }),
    }
  }
}

async function readBaseline(filename: string): Promise<Buffer> {
  if (!path.isAbsolute(filename)) throw new Error("screenshotDiff baseline path must be absolute")
  const file = await fs.open(filename, "r")
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > maxImageBytes) throw new Error("Screenshot baseline must be a PNG file no larger than 32 MiB")
    // Bound the read even if another process grows the file after stat.
    const buffer = Buffer.alloc(stat.size)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    return buffer.subarray(0, offset)
  } finally {
    await file.close()
  }
}

function validateThreshold(threshold: number): number {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("screenshotDiff threshold must be a finite number from 0 to 1")
  }
  return threshold
}

function decodePng(buffer: Buffer): PNG {
  if (!Buffer.isBuffer(buffer) || buffer.length > maxImageBytes || buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error("Screenshot must be a PNG buffer no larger than 32 MiB")
  }
  validatePngStructure(buffer)
  return PNG.sync.read(buffer)
}

function validatePngStructure(buffer: Buffer): void {
  // PNGJS reads uint32 chunk types and advances by length + type + CRC. Its
  // synchronous parser replaces metadata on every IHDR before inflating IDAT.
  // Follow those exact boundaries; never search payload bytes for chunk names.
  let offset = pngSignature.length
  let sawData = false
  let endedData = false
  let paletteEntries = 0
  let sawTransparency = false
  let sawGamma = false
  let color = 0
  let depth = 0
  const invalid = () => new Error("Invalid screenshot PNG structure")
  while (offset < buffer.length) {
    if (buffer.length - offset < 12) throw invalid()
    const length = buffer.readUInt32BE(offset)
    const type = buffer.readUInt32BE(offset + 4)
    if (length > buffer.length - offset - 12) throw invalid()
    const end = offset + length + 12
    for (const character of buffer.subarray(offset + 4, offset + 8)) {
      if (!(character >= 65 && character <= 90) && !(character >= 97 && character <= 122)) throw invalid()
    }
    if ((buffer[offset + 6]! & 0x20) !== 0) throw invalid()
    if (offset === pngSignature.length) {
      if (type !== 0x49484452 || length !== 13) throw invalid() // IHDR
      const width = buffer.readUInt32BE(offset + 8)
      const height = buffer.readUInt32BE(offset + 12)
      depth = buffer[offset + 16]!
      color = buffer[offset + 17]!
      const depths = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16]
      if (![0, 2, 3, 4, 6].includes(color) || !depths.includes(depth) ||
          buffer[offset + 18] !== 0 || buffer[offset + 19] !== 0 || buffer[offset + 20]! > 1) throw invalid()
      if (width === 0 || height === 0 || width * height > maxImagePixels) {
        throw new Error("Screenshot exceeds the 16 megapixel comparison limit")
      }
    } else if (type === 0x49484452) {
      throw invalid()
    }
    if (type === 0x504c5445) { // PLTE: PNGJS otherwise accumulates one JS array per entry.
      if (paletteEntries || sawData || sawTransparency || color === 0 || color === 4 ||
          length === 0 || length % 3 !== 0 || length > 768 ||
          (color === 3 && length / 3 > 2 ** depth)) throw invalid()
      paletteEntries = length / 3
    }
    if (type === 0x74524e53) { // tRNS
      if (sawTransparency || sawData ||
          !(color === 0 ? length === 2 : color === 2 ? length === 6 :
            color === 3 && paletteEntries > 0 && length > 0 && length <= paletteEntries)) throw invalid()
      sawTransparency = true
    }
    if (type === 0x67414d41) { // gAMA
      if (sawGamma || sawData || paletteEntries || length !== 4) throw invalid()
      sawGamma = true
    }
    if (type === 0x49444154) { // IDAT
      if (color === 3 && paletteEntries === 0) throw invalid()
      if (endedData) throw invalid()
      sawData = true
    } else if (sawData) {
      endedData = true
    }
    if (type === 0x49454e44) { // IEND
      if (length !== 0 || !sawData || end !== buffer.length) throw invalid()
      return
    }
    offset = end
  }
  // Require a complete terminal IEND before PNGJS can inflate or allocate pixels.
  // PNGJS remains responsible for CRCs and image data. Its pinned patch bounds
  // inflate by exact scanline bytes and avoids per-row / per-IDAT retained arrays.
  throw invalid()
}
