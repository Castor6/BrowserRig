import crypto from "node:crypto"
import fs from "node:fs/promises"
import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { build } from "esbuild"

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, "dist")

const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as { readonly version: string }
const buildInputs = [
  ...await collectTypeScriptFiles(path.join(root, "src")),
  path.join(root, "package.json"),
  path.join(root, "pnpm-lock.yaml"),
  path.join(root, "pnpm-workspace.yaml"),
  path.join(root, "scripts", "build-cli.ts"),
  path.join(root, "tsconfig.json"),
  path.join(root, "tsconfig.build.json"),
]
const buildId = await contentBuildId(buildInputs)
const execFileAsync = promisify(execFile)

await fs.rm(dist, { recursive: true, force: true })
await fs.mkdir(dist, { recursive: true })
await build({
  entryPoints: {
    cli: path.join(root, "src", "cli.ts"),
    index: path.join(root, "src", "index.ts"),
    mcp: path.join(root, "src", "mcp-main.ts"),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "external",
  define: {
    "globalThis.__BROWSERRIG_VERSION__": JSON.stringify(packageJson.version),
    "globalThis.__BROWSERRIG_BUILD_ID__": JSON.stringify(buildId),
  },
  outdir: dist,
})
await execFileAsync(path.join(root, "node_modules", ".bin", "tsc"), ["-p", path.join(root, "tsconfig.build.json")])
await fs.chmod(path.join(dist, "cli.js"), 0o755)
await fs.chmod(path.join(dist, "mcp.js"), 0o755)

async function collectTypeScriptFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectTypeScriptFiles(entryPath))
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath)
    }
  }
  return files
}

async function contentBuildId(files: readonly string[]): Promise<string> {
  const hash = crypto.createHash("sha256")
  for (const file of [...files].sort()) {
    hash.update(path.relative(root, file))
    hash.update("\0")
    hash.update(await fs.readFile(file))
    hash.update("\0")
  }
  return `build-${hash.digest("hex").slice(0, 16)}`
}
