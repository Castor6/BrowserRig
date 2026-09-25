import { expect, it } from "vitest"
import { jpegDimensions } from "../src/jpeg-dimensions.ts"

const frame = (marker = 0xc0) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 9, 9, 0xff, marker, 0, 11, 8, 1, 163, 2, 244, 1, 1, 0x11, 0])

it.each([0xc0, 0xc1, 0xc2])("reads actual odd JPEG geometry from SOF %s after application metadata", marker => {
  expect(jpegDimensions(frame(marker))).toEqual({ width: 756, height: 419 })
})

it("accepts marker padding without confusing it with segment payload", () => {
  expect(jpegDimensions(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), frame().subarray(2)]))).toEqual({ width: 756, height: 419 })
})

it("rejects truncated, empty, zero-sized and malformed segments without scanning entropy data", () => {
  const zero = frame(); zero.writeUInt16BE(0, 15)
  for (const image of [Buffer.alloc(0), frame().subarray(0, 18), zero, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1]), Buffer.from([0xff, 0xd8, 0xff, 0xda, ...frame().subarray(8)])]) {
    expect(() => jpegDimensions(image)).toThrow(/JPEG/)
  }
})
