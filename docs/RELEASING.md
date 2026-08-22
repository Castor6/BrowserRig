# BrowserRig Release Process

BrowserRig is published as dual-use software because it can control signed-in
browser tabs, execute trusted Playwright and local Node.js code, and capture
authentication-bearing network traffic. Every npm version must retain both the
`contentPolicy.class: dual-use` package metadata and the root `DISCLOSURE` file.

## Prepare the next package version

Every pull request that changes published package behavior carries a Changeset.
After those changes reach `main`, the `Version packages` GitHub workflow uses
the repository's built-in `GITHUB_TOKEN` to create or update one shared
`Version Packages` pull request. It runs the full CI command before changing
release metadata and has no npm publishing credentials or OIDC permission.

Review the accumulated release notes, semantic-version bump, CI result, and
generated `package.json` and `CHANGELOG.md` changes. Merge the version pull
request only when that exact set of changes is ready for a release candidate.
The merge changes release metadata but does not publish npm, create a tag, or
create a GitHub Release. GitHub Actions must be allowed to create pull requests
in the repository settings; no personal access token is required. GitHub marks
CI triggered by a `GITHUB_TOKEN`-created pull request as approval-required, so a
maintainer must select **Approve workflows to run** before merging it.

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

The manual `Prepare release candidate` GitHub workflow performs the same CI and
packaging steps, is pinned to `main`, and uploads both files for review. It does
not publish either artifact.

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
