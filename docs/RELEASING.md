# BrowserRig Release Process

BrowserRig is published as dual-use software because it can control signed-in
browser tabs, execute trusted Playwright and local Node.js code, and capture
authentication-bearing network traffic. Every npm version must retain both the
`contentPolicy.class: dual-use` package metadata and the root `DISCLOSURE` file.

## Prepare the next package version

Every pull request that changes npm package behavior carries a `browserrig`
Changeset. Because `extension/dist` ships in that npm package, every pull
request that changes packaged extension code, manifest metadata, icons, or
build output carries entries for both `browserrig` and
`browserrig-extension`. The latter is a private workspace package used only to
calculate the Store version; it is never published to npm. Changes limited to
Store listing assets under `docs/chrome-web-store/` need neither entry. Feature
pull requests declare `patch`, `minor`, or `major` bumps without editing either
exact extension version. Because npm ships the extension, its relative bump
must be at least as large as the extension bump; CI enforces that relationship.

After those changes reach `main`, the `Version packages` GitHub workflow uses
the repository-scoped fine-grained token stored in the `CHANGESETS_TOKEN`
Actions secret to create or update one shared `Version Packages` pull request.
Its custom version command applies all pending Changesets, updates changelogs,
and copies the calculated private extension version into
`extension/manifest.json`. Pull-request CI rejects packaged extension changes
without an extension Changeset and rejects hand-edited extension versions.
The token can write contents and pull requests only in `Castor6/BrowserRig`, so
CI starts automatically for the generated pull request without granting npm
publishing credentials or OIDC permission. It expires on August 23, 2027.

Review the accumulated release notes, npm and extension version bumps, CI
result, generated package metadata and changelogs, and synchronized extension
manifest. Merge the version pull request only when that exact set of changes
is ready for a release candidate.
The merge changes release metadata but does not publish npm, create a tag, or
create a GitHub Release. Renew `CHANGESETS_TOKEN` before it expires, preserve
the same repository and permission restrictions, and never print or commit its
value. A missing or expired secret must fail the workflow rather than falling
back to `GITHUB_TOKEN`, whose generated pull requests require manual workflow
approval.

Git tags and GitHub Releases use the `browserrig` npm version, such as
`v0.2.0`. Each Release records the independently calculated extension version
and protocol version. An extension package change therefore advances both npm
and extension release plans, while Store-listing-only artwork advances neither.

## Build and inspect a release candidate

From a clean checkout of `Castor6/browserrig` on `main`:

```bash
pnpm install --frozen-lockfile
pnpm run ci
pnpm package:npm
npm pack --dry-run
```

The expected local artifacts are:

- `artifacts/browserrig-<version>.tgz`
- `artifacts/browserrig-extension-<version>.zip`

Merging the repository-owned `Version Packages` pull request automatically
starts the `Prepare release candidate` GitHub workflow at the exact merge
commit. The workflow performs the same CI and packaging steps and uploads both
files for review for 14 days. A manual dispatch pinned to `main` remains
available for rebuilding a missing or failed candidate; enter `BrowserRig` when
prompted. Neither path publishes either artifact, creates a tag, or creates a
GitHub Release.

Before release, inspect the npm tarball and confirm that it contains
`package.json`, `README.md`, `LICENSE`, `DISCLOSURE`, `dist/`,
`dist/dsh.js`, `dist/types/dsh-plugin.d.ts`, `cordis.patch.yml`,
`dist/licenses/`, `extension/dist/`, and `skills/browserrig/SKILL.md`, and no
source maps, local state, or install lifecycle script. `dist/licenses/` must
cover every dependency bundled into the executable surfaces. Record the
extension ZIP SHA-256 printed by `pnpm package:extension`.
Run `pnpm package:npm` twice without changing the checkout and confirm that the
npm tarball's printed SHA-256 is identical before publishing it. The packaging
script normalizes gzip's informational source-OS byte so the same source also
hashes identically on macOS and Linux.

Install the exact tarball into clean DeepSeek Harness profiles before publishing
it as a DSH-compatible release:

```bash
export BROWSERRIG_DSH_RELEASE_HOME="$(mktemp -d)"
DSH_HOME="$BROWSERRIG_DSH_RELEASE_HOME" dsh plugin --profile web add ./artifacts/browserrig-<version>.tgz
DSH_HOME="$BROWSERRIG_DSH_RELEASE_HOME" dsh --profile web --dump-config
DSH_HOME="$BROWSERRIG_DSH_RELEASE_HOME" dsh plugin --profile headless add ./artifacts/browserrig-<version>.tgz
DSH_HOME="$BROWSERRIG_DSH_RELEASE_HOME" dsh --profile headless --dump-config
```

Each dump must contain the `browserrig` bundle row resolving `browserrig/dsh`.
Boot both profiles, confirm all five `browserrig_*` tools register, and remove
the temporary profiles after recording the result. The DSH path must work
without a global `browserrig` command or separately installed BrowserRig skill.

## Bootstrap npm 0.1.0

Staged publishing cannot create a brand-new npm package. The first release must
therefore be performed by the maintainer in an interactive npm session with 2FA:

1. Create the public `Castor6/browserrig` repository and push the reviewed
   release commit. The `repository.url` in `package.json` must match its exact
   owner and casing for later provenance.
2. Confirm that `browserrig` is still available and that the publishing npm
   account has 2FA enabled.
3. Build and inspect `artifacts/browserrig-0.1.0.tgz` as above.
4. Publish the reviewed tarball interactively:

   ```bash
   npm publish ./artifacts/browserrig-0.1.0.tgz --access public --provenance=false \
     --registry=https://registry.npmjs.org
   ```

   Enter the npm 2FA challenge yourself. Provenance is disabled only for this
   local bootstrap because npm provenance requires a supported cloud CI
   environment.
5. Verify the registry tarball, executable names, package metadata, and
   `DISCLOSURE` before announcing the release.

## Later npm releases

After the package exists, configure npm Trusted Publishing for the exact public
repository and workflow. CI may use OIDC to run `npm stage publish`, but it must
not publish this dual-use package directly. Review the staged tarball with
`npm stage view` or `npm stage download`, then approve it with maintainer 2FA:

```bash
npm stage list browserrig
npm stage view <stage-id>
npm stage download <stage-id>
npm stage approve <stage-id>
```

Only create the Git tag and GitHub Release after the approved version is visible
on the public registry. Direct OIDC publishing and bypass-2FA tokens are not an
acceptable release path for this package.

## Chrome Web Store

Follow [`CHROME_WEB_STORE.md`](./CHROME_WEB_STORE.md). The `0.0.1` bootstrap ZIP
created the independent draft. The manifest key, relay pin, and tests now bind
version `0.1.0` to Item ID `dbobcmjamjdknplkplgdihdnmdjklpin`. Verify that ID
and a production relay handshake with the unpacked build, then upload the final
review ZIP without changing the identity. Publish and independently verify the
first npm version before submitting Store review because the reviewer steps
install the local driver from the official registry. Complete the unlisted
listing only after that clean npm install succeeds; use deferred Store
publishing so an approval does not make the listing public automatically.

References: [npm dual-use policy](https://docs.npmjs.com/policies/dual-use/),
[npm staged publishing](https://docs.npmjs.com/staged-publishing/), and
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/).
