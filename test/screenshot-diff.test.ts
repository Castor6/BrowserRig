import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import zlib, { crc32, deflateSync } from "node:zlib"
import { PNG } from "pngjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createScreenshotDiff } from "../src/screenshot-diff.ts"

const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

function image(width = 2, height = 2, red = 255): Buffer {
  const png = new PNG({ width, height })
  png.data.fill(255)
  png.data[0] = red
  return PNG.sync.write(png)
}

function chunk(type: string, payload: Buffer): Buffer {
  const output = Buffer.alloc(payload.length + 12)
  output.writeUInt32BE(payload.length)
  output.write(type, 4, 4, "ascii")
  payload.copy(output, 8)
  output.writeUInt32BE(crc32(output.subarray(4, -4)), output.length - 4)
  return output
}

function header(width: number, height: number, options = { depth: 8, color: 6, interlace: 0 }): Buffer {
  const data = Buffer.alloc(13)
  data.writeUInt32BE(width)
  data.writeUInt32BE(height, 4)
  data[8] = options.depth
  data[9] = options.color
  data[12] = options.interlace
  return chunk("IHDR", data)
}

function png(...chunks: Buffer[]): Buffer {
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks])
}

describe("screenshotDiff", () => {
  it("bounds interlaced inflation before expanding an overlong stream", async () => {
    const baseline = png(header(1, 1, { depth: 8, color: 6, interlace: 1 }),
      chunk("IDAT", deflateSync(Buffer.alloc(4 * 1024 * 1024))), chunk("IEND", Buffer.alloc(0)))
    const inflate = vi.spyOn(zlib, "inflateSync")
    const screenshot = vi.fn(async () => image())
    await expect(createScreenshotDiff({ screenshot })({ baseline })).rejects.toThrow()
    expect(inflate).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ maxOutputLength: 5 }))
    expect(inflate.mock.results[0]?.type).toBe("throw")
    expect(screenshot).not.toHaveBeenCalled()
  })

  it.each(["oversized", "duplicate", "partial entry", "depth overflow", "after data"])("rejects %s palettes before PNGJS allocation", async kind => {
    const palette = chunk("PLTE", Buffer.alloc(kind === "oversized" ? 3 * 1024 : kind === "partial entry" ? 4 : kind === "depth overflow" ? 9 : 3))
    const data = chunk("IDAT", deflateSync(Buffer.from([0, 0])))
    const baseline = png(header(1, 1, { depth: kind === "depth overflow" ? 1 : 8, color: 3, interlace: 0 }),
      ...(kind === "after data" ? [data, palette] : [palette, ...(kind === "duplicate" ? [palette] : []), data]), chunk("IEND", Buffer.alloc(0)))
    const screenshot = vi.fn(async () => image())
    const decode = vi.spyOn(PNG.sync, "read").mockImplementation(() => { throw new Error("unsafe decoder reached") })
    await expect(createScreenshotDiff({ screenshot })({ baseline })).rejects.toThrow("PNG structure")
    expect(decode).not.toHaveBeenCalled()
    expect(screenshot).not.toHaveBeenCalled()
  })

  it.each([
    [0, 1], [0, 2], [0, 4], [0, 8], [0, 16], [2, 8], [2, 16],
    [3, 1], [3, 2], [3, 4], [3, 8], [4, 8], [4, 16], [6, 8], [6, 16],
  ])("bounds all Adam7 passes for color %s depth %s while preserving valid images", async (color, depth) => {
    const channels = color === 2 ? 3 : color === 4 ? 2 : color === 6 ? 4 : 1
    // Independently enumerated pass dimensions for a 9x9 image (all seven passes).
    const passes = [[2, 2], [1, 2], [3, 1], [2, 3], [5, 2], [4, 5], [9, 4]]
    const bytes = passes.reduce((total, [width, height]) => total + (Math.ceil(width! * channels * depth! / 8) + 1) * height!, 0)
    const make = (extra: number) => png(header(9, 9, { color: color!, depth: depth!, interlace: 1 }),
      ...(color === 3 ? [chunk("PLTE", Buffer.from([255, 0, 0])), chunk("tRNS", Buffer.from([128]))] : []),
      chunk("IDAT", deflateSync(Buffer.alloc(bytes + extra))), chunk("IEND", Buffer.alloc(0)))
    const baseline = make(0)
    const inflate = vi.spyOn(zlib, "inflateSync")
    expect(await createScreenshotDiff({ screenshot: async () => baseline })({ baseline })).toMatchObject({ matches: true, width: 9, height: 9 })
    expect(inflate).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ maxOutputLength: bytes }))
    const screenshot = vi.fn(async () => baseline)
    await expect(createScreenshotDiff({ screenshot })({ baseline: make(1) })).rejects.toThrow()
    await expect(createScreenshotDiff({ screenshot })({ baseline: make(-1) })).rejects.toThrow("scanline length")
    expect(screenshot).not.toHaveBeenCalled()
  })

  it("also rejects excess noninterlaced scanlines before taking a screenshot", async () => {
    const baseline = png(header(1, 1), chunk("IDAT", deflateSync(Buffer.alloc(6))), chunk("IEND", Buffer.alloc(0)))
    const screenshot = vi.fn(async () => image())
    await expect(createScreenshotDiff({ screenshot })({ baseline })).rejects.toThrow()
    expect(screenshot).not.toHaveBeenCalled()
  })

  it.each([0, 1, 2, 3, 4])("preserves PNG filter %s on tall images without retaining every row", async filterType => {
    const original = new PNG({ width: 1, height: 4096 })
    original.data.fill(173)
    const baseline = PNG.sync.write(original, { filterType })
    expect(await createScreenshotDiff({ screenshot: async () => baseline })({ baseline })).toMatchObject({ matches: true, height: 4096 })
  })

  it.each([false, true])("rejects a second oversized IHDR before decoding (after IDAT: %s)", async afterData => {
    const ihdr = header(1, 1)
    const oversized = header(4097, 4096)
    const data = chunk("IDAT", deflateSync(Buffer.from([0, 255, 255, 255, 255])))
    const baseline = png(ihdr, ...(afterData ? [data, oversized] : [oversized, data]), chunk("IEND", Buffer.alloc(0)))
    const screenshot = vi.fn(async () => image())
    // Fail immediately if unsafe input reaches PNGJS, without allocating its claimed pixels.
    const decode = vi.spyOn(PNG.sync, "read").mockImplementation(() => { throw new Error("unsafe decoder reached") })
    await expect(createScreenshotDiff({ screenshot })({ baseline })).rejects.toThrow("PNG structure")
    expect(decode).not.toHaveBeenCalled()
    expect(screenshot).not.toHaveBeenCalled()
  })

  it("documents PNGJS's last-IHDR semantics with a small fully decodable fixture", () => {
    const original = image(2, 2)
    const duplicate = Buffer.concat([original.subarray(0, 8), header(1, 1), original.subarray(8)])
    expect(PNG.sync.read(duplicate)).toMatchObject({ width: 2, height: 2 })
  })

  it.each(["truncated chunk", "missing IEND", "trailing bytes", "nonempty IEND", "split IDAT sequence", "short IHDR", "invalid chunk type"])("rejects %s before decoding", kind => {
    const data = chunk("IDAT", deflateSync(Buffer.from([0, 255, 255, 255, 255])))
    const end = chunk("IEND", Buffer.alloc(0))
    const badType = chunk("tEXt", Buffer.from("key\0value")); badType[4] = 0xf4
    const chunks = kind === "truncated chunk" ? [header(1, 1), data.subarray(0, -1)]
      : kind === "missing IEND" ? [header(1, 1), data]
      : kind === "trailing bytes" ? [header(1, 1), data, end, Buffer.from([0])]
      : kind === "nonempty IEND" ? [header(1, 1), data, chunk("IEND", Buffer.from([0]))]
      : kind === "split IDAT sequence" ? [header(1, 1), data, chunk("tEXt", Buffer.from("key\0value")), data, end]
      : kind === "short IHDR" ? [chunk("IHDR", Buffer.alloc(8)), data, end]
      : [header(1, 1), badType, data, end]
    const screenshot = vi.fn(async () => image())
    const decode = vi.spyOn(PNG.sync, "read").mockImplementation(() => { throw new Error("unsafe decoder reached") })
    return expect(createScreenshotDiff({ screenshot })({ baseline: png(...chunks) })).rejects.toThrow("PNG structure").then(() => {
      expect(decode).not.toHaveBeenCalled()
      expect(screenshot).not.toHaveBeenCalled()
    })
  })

  it("validates the captured PNG before decoding it as well", async () => {
    const baseline = image()
    const malformed = Buffer.concat([baseline.subarray(0, 33), header(4097, 4096), baseline.subarray(33)])
    const decode = vi.spyOn(PNG.sync, "read")
    await expect(createScreenshotDiff({ screenshot: async () => malformed })({ baseline })).rejects.toThrow("PNG structure")
    expect(decode).toHaveBeenCalledExactlyOnceWith(baseline)
  })

  it.each([
    { depth: 8, color: 6, interlace: 0 },
    { depth: 8, color: 6, interlace: 1 },
    { depth: 16, color: 6, interlace: 0 },
    { depth: 1, color: 3, interlace: 0 },
  ])("preserves legal PNG modes and ancillary / split data chunks: %j", async options => {
    const palette = options.color === 3
    const data = deflateSync(palette ? Buffer.from([0, 0]) : Buffer.from([0, ...Array(options.depth === 16 ? 8 : 4).fill(255)]))
    const baseline = png(
      header(1, 1, options),
      chunk("tEXt", Buffer.from("key\0IHDR inside payload is not a header")),
      ...(palette ? [chunk("PLTE", Buffer.from([255, 0, 0])), chunk("tRNS", Buffer.from([128]))] : []),
      chunk("IDAT", data.subarray(0, 3)), chunk("IDAT", Buffer.alloc(0)), chunk("IDAT", data.subarray(3)),
      chunk("IEND", Buffer.alloc(0)),
    )
    expect(await createScreenshotDiff({ screenshot: async () => baseline })({ baseline })).toMatchObject({ matches: true, width: 1, height: 1 })
  })

  it("returns a PNG and exact zero-change metrics for equal images", async () => {
    const baseline = image()
    const screenshot = vi.fn(async () => baseline)
    const result = await createScreenshotDiff({ screenshot })({ baseline })
    expect(screenshot).toHaveBeenCalledWith({ type: "png", scale: "css", fullPage: false })
    expect(result).toMatchObject({ matches: true, width: 2, height: 2, changedPixels: 0, totalPixels: 4, changedRatio: 0, threshold: 0.1 })
    expect(PNG.sync.read(result.image!).width).toBe(2)
  })

  it("highlights changes in red and reports the changed fraction", async () => {
    const result = await createScreenshotDiff({ screenshot: async () => image(2, 2, 0) })({ baseline: image(), threshold: 0, fullPage: true })
    expect(result).toMatchObject({ matches: false, changedPixels: 1, totalPixels: 4, changedRatio: 0.25 })
    expect([...PNG.sync.read(result.image!).data.subarray(0, 4)]).toEqual([255, 0, 0, 255])
  })

  it("applies a color threshold rather than a changed-area allowance", async () => {
    const diff = createScreenshotDiff({ screenshot: async () => image(2, 2, 254) })
    expect((await diff({ baseline: image(), threshold: 0 })).changedPixels).toBe(1)
    expect((await diff({ baseline: image(), threshold: 0.1 })).changedPixels).toBe(0)
  })

  it("rejects differing dimensions without resizing", async () => {
    await expect(createScreenshotDiff({ screenshot: async () => image(3, 2) })({ baseline: image() })).rejects.toThrow("baseline 2×2, current 3×2")
  })

  it.each([-1, 1.1, NaN, Infinity])("rejects threshold %s before taking a screenshot", async (threshold) => {
    const screenshot = vi.fn(async () => image())
    await expect(createScreenshotDiff({ screenshot })({ baseline: image(), threshold })).rejects.toThrow("threshold")
    expect(screenshot).not.toHaveBeenCalled()
  })

  it("rejects corrupt and oversized PNGs before taking a screenshot", async () => {
    const screenshot = vi.fn(async () => image())
    const oversized = image()
    oversized.writeUInt32BE(100_000, 16)
    oversized.writeUInt32BE(100_000, 20)
    await expect(createScreenshotDiff({ screenshot })({ baseline: oversized })).rejects.toThrow("megapixel")
    await expect(createScreenshotDiff({ screenshot })({ baseline: Buffer.from("not a PNG") })).rejects.toThrow("PNG")
    const corrupt = image().subarray(0, 26)
    await expect(createScreenshotDiff({ screenshot })({ baseline: corrupt })).rejects.toThrow()
    expect(screenshot).not.toHaveBeenCalled()
  })

  it("reads a saved baseline and writes a private diff without overwriting either artifact", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "screenshot-diff-"))
    directories.push(directory)
    const baseline = path.join(directory, "before.png")
    const output = path.join(directory, "diff.png")
    const before = image()
    await fs.writeFile(baseline, before)
    const diff = createScreenshotDiff({ screenshot: async () => image(2, 2, 0) })
    const result = await diff({ baseline, path: output })
    expect(result).toMatchObject({ path: output, changedPixels: 1 })
    expect(result.image).toBeUndefined()
    expect((await fs.stat(output)).mode & 0o777).toBe(0o600)
    expect(PNG.sync.read(await fs.readFile(output)).width).toBe(2)
    await expect(diff({ baseline, path: baseline })).rejects.toThrow("EEXIST")
    await expect(diff({ baseline, path: output })).rejects.toThrow("EEXIST")
    expect(await fs.readFile(baseline)).toEqual(before)
  })

  it("requires absolute baseline and PNG output paths", async () => {
    const screenshot = vi.fn(async () => image())
    const diff = createScreenshotDiff({ screenshot })
    await expect(diff({ baseline: "before.png" })).rejects.toThrow("absolute")
    await expect(diff({ baseline: image(), path: "diff.png" })).rejects.toThrow("absolute")
    await expect(diff({ baseline: image(), path: "/tmp/diff.jpg" })).rejects.toThrow(".png")
    expect(screenshot).not.toHaveBeenCalled()
  })
})
