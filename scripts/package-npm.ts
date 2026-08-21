import crypto from "node:crypto"
import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { gunzipSync } from "node:zlib"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const artifacts = path.join(root, "artifacts")
const execFileAsync = promisify(execFile)
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as {
  readonly name: string
  readonly version: string
}

await fs.mkdir(artifacts, { recursive: true })
const packed = await execFileAsync("pnpm", ["pack", "--pack-destination", artifacts], {
  cwd: root,
  maxBuffer: 4 * 1024 * 1024,
})
process.stdout.write(packed.stdout)
process.stderr.write(packed.stderr)

const archiveName = `${packageJson.name.replace(/^@/, "").replaceAll("/", "-")}-${packageJson.version}.tgz`
const archivePath = path.join(artifacts, archiveName)
const archive = await fs.readFile(archivePath)

if (
  archive.length < 10
  || archive.readUInt8(0) !== 0x1f
  || archive.readUInt8(1) !== 0x8b
  || archive.readUInt8(2) !== 0x08
) {
  throw new Error(`pnpm pack did not produce a valid gzip archive: ${archivePath}`)
}
if ((archive.readUInt8(3) & 0x02) !== 0) {
  throw new Error(`cannot normalize a gzip header with FHCRC set: ${archivePath}`)
}

// gzip byte 9 is only an informational source-OS marker. pnpm emits 3 on
// Linux and 19 on macOS even when the compressed tar stream is identical.
// Canonicalize it to RFC 1952's unknown value so release hashes match across
// supported build hosts.
archive.writeUInt8(0xff, 9)
gunzipSync(archive)
await fs.writeFile(archivePath, archive)

const digest = crypto.createHash("sha256").update(archive).digest("hex")
console.log(`${path.relative(root, archivePath)} sha256:${digest}`)
