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
is ready to enter npm's staged-publishing review. Do not merge a second version
pull request until the first staged version has been approved and its GitHub
Release has been finalized.

The merge builds one immutable candidate and submits its exact npm tarball to
npm's private staging area. It does not make the package public: a maintainer
must still inspect and approve it with npm 2FA. Renew `CHANGESETS_TOKEN` before
it expires, preserve the same repository and permission restrictions, and
never print or commit its value. A missing or expired secret must fail the
workflow rather than falling back to `GITHUB_TOKEN`, whose generated pull
requests require manual workflow approval.

Git tags and GitHub Releases use the `browserrig` npm version, such as
`v0.2.0`. Each Release records the independently calculated extension version
and protocol version. An extension package change therefore advances both npm
and extension release plans, while Store-listing-only artwork advances neither.

## Build and inspect a release candidate

From a clean checkout of `Castor6/BrowserRig` on `main`:

```bash
pnpm install --frozen-lockfile
pnpm run ci
pnpm package:npm
pnpm release:manifest --commit "$(git rev-parse HEAD)"
npm pack --dry-run
```

The expected local artifacts are:

- `artifacts/browserrig-<version>.tgz`
- `artifacts/browserrig-extension-<version>.zip`
- `artifacts/release-manifest.json`
- `artifacts/SHA256SUMS`

Merging the repository-owned `Version Packages` pull request automatically
starts the `Prepare release candidate` GitHub workflow at the exact merge
commit. The workflow performs the same CI and packaging steps, records the
component versions and checksums, retains the four candidate files for 90 days,
and sends the exact npm tarball to npm staged publishing. A manual dispatch
pinned to `main` remains available for rebuilding a missing or failed
candidate; enter `BrowserRig` when prompted. The manual path never stages npm,
and neither path publishes the extension to the Chrome Web Store.

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

1. Create the public `Castor6/BrowserRig` repository and push the reviewed
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

Configure npm Trusted Publishing once for the exact public repository,
workflow, and GitHub environment. Grant only staged-publish permission:

```bash
npm trust github browserrig \
  --repo Castor6/BrowserRig \
  --file release.yml \
  --env npm-staging \
  --allow-stage-publish
```

The `Prepare release candidate` workflow uses short-lived OIDC credentials; it
must not receive an `NPM_TOKEN`, direct `npm publish` permission, or a bypass-2FA
credential. In npm package settings, require 2FA and disallow traditional
tokens after the trusted publisher is working.

After a successful version-PR merge, review the staged tarball with
`npm stage view` or `npm stage download`, then approve it with maintainer 2FA:

```bash
npm stage list browserrig
npm stage view <stage-id>
npm stage download <stage-id>
npm stage approve <stage-id>
```

OIDC cannot list, inspect, approve, reject, or otherwise bypass this human gate.
If the staging job loses its response or fails at the final `npm stage publish`
step, do not blindly rerun it: first use `npm stage list browserrig` and
`npm stage view <stage-id>` interactively. A version already accepted into the
staging area cannot be submitted again; approve the matching candidate or
reject it with 2FA before deciding whether a rerun is safe.

The separate `Publish GitHub release` workflow checks every 30 minutes (and can
be dispatched manually for an immediate check). Once the approved version is
visible on the public registry, it downloads the registry tarball, requires its
integrity to match the retained candidate, creates tag `v<npm-version>` at the
candidate commit, and publishes a GitHub Release containing the original npm
tarball, extension ZIP, manifest, and checksums. Existing tags, releases, or
assets must match exactly; the finalizer never overwrites them. Direct OIDC
publishing and bypass-2FA tokens are not acceptable release paths for this
package.

## Chrome Web Store

Follow [`CHROME_WEB_STORE.md`](./CHROME_WEB_STORE.md). The `0.0.1` bootstrap ZIP
created the independent draft. The manifest key, relay pin, and tests bind the
current `extension/manifest.json` version to Store Item ID
`dbobcmjamjdknplkplgdihdnmdjklpin`. Verify that ID and a production relay
handshake with the unpacked build, then upload the final review ZIP without
changing the identity. Publish and independently verify the first npm version
before submitting Store review because the reviewer steps install the local
driver from the official registry. Complete the unlisted listing only after
that clean npm install succeeds; use deferred Store publishing so an approval
does not make the listing public automatically.

References: [npm dual-use policy](https://docs.npmjs.com/policies/dual-use/),
[npm staged publishing](https://docs.npmjs.com/staged-publishing/),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), and
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/).
