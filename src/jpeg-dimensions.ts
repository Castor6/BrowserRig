/** Read JPEG frame geometry without decoding or allocating the pixel surface. */
export function jpegDimensions(image: Buffer): { readonly width: number; readonly height: number } {
  if (image.length < 4 || image.readUInt16BE(0) !== 0xffd8) throw new Error("Recording frame is not a JPEG")
  let offset = 2
  while (offset < image.length) {
    if (image[offset++] !== 0xff) break
    while (image[offset] === 0xff) offset += 1
    const marker = image[offset++]
    if (marker === undefined || marker === 0xda || marker === 0xd9) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > image.length) break
    const length = image.readUInt16BE(offset)
    if (length < 2 || offset + length > image.length) break
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 8) break
      const height = image.readUInt16BE(offset + 3)
      const width = image.readUInt16BE(offset + 5)
      if (width > 0 && height > 0) return { width, height }
      break
    }
    offset += length
  }
  throw new Error("Recording JPEG has no valid frame dimensions")
}
