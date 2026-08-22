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
const buildOptions = {
  bundle: true,
  format: "esm" as const,
  platform: "node" as const,
  target: "node22",
  define: {
    "globalThis.__BROWSERRIG_VERSION__": JSON.stringify(packageJson.version),
    "globalThis.__BROWSERRIG_BUILD_ID__": JSON.stringify(buildId),
  },
  outdir: dist,
}

// Executable surfaces are self-contained for package managers such as DSH's
// profile installer, which intentionally does not auto-install peers. Keep the
// browser/protocol packages external; their dynamic behavior and package data
// are not safe to flatten into one file.
const executableBuild = await build({
  entryPoints: {
    cli: path.join(root, "src", "cli.ts"),
    dsh: path.join(root, "src", "dsh-plugin.ts"),
    mcp: path.join(root, "src", "mcp-main.ts"),
  },
  ...buildOptions,
  external: ["@deepseek-ai/*", "acorn", "playwright-core", "playwright-core/*", "ws"],
  metafile: true,
  banner: {
    js: 'import { createRequire as __browserRigCreateRequire } from "node:module"; const require = __browserRigCreateRequire(import.meta.url);',
  },
})
await copyBundledLicenses(Object.keys(executableBuild.metafile.inputs))

// The library entry deliberately keeps Effect external so applications can
// provide the peer runtime used to compose BrowserRig effects.
await build({
  entryPoints: {
    index: path.join(root, "src", "index.ts"),
  },
  ...buildOptions,
  packages: "external",
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

async function copyBundledLicenses(inputs: readonly string[]): Promise<void> {
  const packageRoots = new Set<string>()
  for (const input of inputs) {
    const packageRoot = pnpmPackageRoot(path.resolve(root, input))
    if (packageRoot !== undefined) packageRoots.add(packageRoot)
  }

  const licensesDirectory = path.join(dist, "licenses")
  await fs.mkdir(licensesDirectory, { recursive: true })
  for (const packageRoot of [...packageRoots].sort()) {
    const metadata = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8")) as {
      readonly name: string
      readonly version: string
    }
    const entries = (await fs.readdir(packageRoot)).sort()
    const notices = entries.filter(entry => /^(?:licen[cs]e|notice)(?:\.|$)/i.test(entry))
    if (notices.length === 0) {
      throw new Error(`Bundled dependency ${metadata.name}@${metadata.version} has no license or notice file`)
    }
    const prefix = `${metadata.name.replace(/^@/, "").replaceAll("/", "-")}-${metadata.version}`
    for (const notice of notices) {
      await fs.copyFile(
        path.join(packageRoot, notice),
        path.join(licensesDirectory, `${prefix}-${notice}`),
      )
    }
  }
}

function pnpmPackageRoot(input: string): string | undefined {
  const virtualStoreMarker = `${path.sep}node_modules${path.sep}.pnpm${path.sep}`
  const virtualStoreIndex = input.indexOf(virtualStoreMarker)
  if (virtualStoreIndex === -1) return undefined
  const packageMarker = `${path.sep}node_modules${path.sep}`
  const packageIndex = input.indexOf(packageMarker, virtualStoreIndex + virtualStoreMarker.length)
  if (packageIndex === -1) return undefined
  const packageStart = packageIndex + packageMarker.length
  const firstSeparator = input.indexOf(path.sep, packageStart)
  if (firstSeparator === -1) return undefined
  const firstSegment = input.slice(packageStart, firstSeparator)
  if (!firstSegment.startsWith("@")) return input.slice(0, firstSeparator)
  const secondSeparator = input.indexOf(path.sep, firstSeparator + 1)
  if (secondSeparator === -1) return undefined
  return input.slice(0, secondSeparator)
}
