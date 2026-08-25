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
is ready to become public. Merging it is the explicit and irreversible approval
to publish npm and submit the extension to Chrome Web Store review with
automatic publication on approval. Do not merge a second version pull request
until the first publication and its GitHub Release have been finalized.

The merge rebuilds and verifies one immutable candidate, then publishes its
exact npm tarball through short-lived OIDC credentials. After npm succeeds, it
uses a separate GitHub OIDC exchange to submit the exact retained extension ZIP
through Chrome Web Store API V2. The release workflow reruns full CI before
publication; no separate npm or Store submission approval follows a merge.
Renew `CHANGESETS_TOKEN` before it expires, preserve the same repository and
permission restrictions, and never print or commit its value. A missing or
expired secret must fail the workflow rather than falling back to
`GITHUB_TOKEN`, whose generated pull requests require manual workflow approval.

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
starts the `Publish release` GitHub workflow at the exact merge
commit. The workflow performs the same CI and packaging steps, records the
component versions and checksums, retains the four candidate files for 90 days,
publishes the exact npm tarball through the repository's trusted OIDC identity,
then uploads and submits the exact extension ZIP. A manual dispatch pinned to
`main` remains available for rebuilding a missing or failed candidate; enter
`BrowserRig` when prompted. The manual path never publishes npm or uploads to
Chrome Web Store.

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
workflow, and GitHub environment. Grant direct-publish permission without a
long-lived token. When migrating from the previous stage-only relationship,
list and revoke that single existing relationship first:

```bash
npm trust list browserrig --registry=https://registry.npmjs.org
npm trust revoke browserrig --id <trust-id> \
  --registry=https://registry.npmjs.org
```

Then create the direct-publish relationship:

```bash
npm trust github browserrig \
  --repo Castor6/BrowserRig \
  --file release.yml \
  --env npm-publishing \
  --allow-publish \
  --registry=https://registry.npmjs.org
```

The `Publish release` workflow uses short-lived OIDC credentials; it must
not receive an `NPM_TOKEN` or bypass-2FA credential. Keep account-level 2FA
enabled and disallow traditional publishing tokens after the trusted
publisher is working. Merging the reviewed `Version Packages` pull request is
the sole human publication gate; after the workflow's full CI, packaging,
manifest, and artifact checks pass, it runs `npm publish` directly with
provenance.

If the publishing job loses its response or reports an ambiguous failure, do
not blindly bump or republish. First query the exact version from the official
registry and compare its tarball integrity with the retained candidate. npm
versions are immutable; an already published version must be finalized or
recovered, never rebuilt under the same version. The GitHub finalizer inspects
completed failed publish runs for this recovery case, but proceeds only when
the retained candidate and public npm tarball match exactly.

The separate `Publish GitHub release` workflow checks every 30 minutes (and can
be dispatched manually for an immediate check). Once the published version is
visible on the public registry, it downloads the registry tarball, requires its
integrity to match the retained candidate, creates tag `v<npm-version>` at the
candidate commit, and publishes a GitHub Release containing the original npm
tarball, extension ZIP, manifest, and checksums. Existing tags, releases, or
assets must match exactly; the finalizer never overwrites them. Direct OIDC
publishing is the required release path; bypass-2FA tokens are not acceptable.

## Chrome Web Store

The public listing is
[BrowserRig on Chrome Web Store](https://chromewebstore.google.com/detail/browserrig/dbobcmjamjdknplkplgdihdnmdjklpin).
Follow [`CHROME_WEB_STORE.md`](./CHROME_WEB_STORE.md) for the listing and review
copy. The manifest key, relay pin, and tests bind release builds to Store Item
ID `dbobcmjamjdknplkplgdihdnmdjklpin`; never upload a package under another
identity.

### One-time CI authentication setup

Chrome Web Store API V2 uses a Google service account and GitHub Workload
Identity Federation so the repository stores no refresh token, client secret,
or service-account JSON key:

1. In a dedicated Google Cloud project, enable **Chrome Web Store API** and
   create one service account for BrowserRig publishing.
2. In Chrome Web Store Developer Dashboard, open **Account** and add that
   service-account email to the publisher. The Store currently permits one
   service account per publisher.
3. Configure a Google Cloud Workload Identity pool/provider for GitHub Actions.
   Restrict its attribute condition and `roles/iam.workloadIdentityUser` grant
   to `Castor6/BrowserRig`; where practical, also restrict the provider to
   `.github/workflows/release.yml` from the protected default branch.
4. Create the GitHub environment `chrome-web-store-publishing`. It needs these
   environment variables, which are identifiers rather than credentials:

   - `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`: full provider resource name,
     `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`
   - `CHROME_WEB_STORE_SERVICE_ACCOUNT`: the service-account email added to the
     Store publisher
   - `CHROME_WEB_STORE_PUBLISHER_ID`: the publisher ID shown under **Publisher
     → Settings** in the Developer Dashboard

The workflow requests only `id-token: write` and a short-lived access token
scoped to `https://www.googleapis.com/auth/chromewebstore`. Do not add a JSON
key, OAuth refresh token, or client secret as a fallback. Keep 2-Step
Verification enabled on the human developer account.

### Automated update behavior

After a reviewed `Version Packages` pull request is merged, the Store job waits
for npm publication, downloads the same retained release candidate, verifies
its commit and checksums, and compares its extension version with the Store:

- An already-published version or the same version already pending review is a
  successful no-op, so workflow retries are safe.
- A newer extension ZIP is uploaded through API V2 and submitted with
  `publishType: DEFAULT_PUBLISH`, `skipReview: false`, and
  `blockOnWarnings: true`.
- Google review remains mandatory. After approval, the existing public listing
  updates automatically; the workflow does not wait for review completion.
- Conflicting active submissions, staged revisions, rejected same-version
  retries, policy warnings, taken-down state, version regressions, checksum
  mismatches, and unexpected API responses fail closed for maintainer review.
- If a release changes only npm and the candidate's extension version is
  already public, the Store job performs no upload.

Chrome Web Store API publishes with the listing's existing visibility. If a
maintainer changes visibility in the Developer Dashboard, publish that new
visibility manually once before expecting API publication to resume. Before
merging an extension release, still load the release build unpacked, confirm it
reports the pinned Item ID, and verify a production relay handshake. Browser
clients receive the approved Store update on Chrome's own update schedule.

References: [npm dual-use policy](https://docs.npmjs.com/policies/dual-use/),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), and
[npm provenance](https://docs.npmjs.com/generating-provenance-statements/),
[Chrome Web Store API V2](https://developer.chrome.com/docs/webstore/api), and
[Chrome Web Store service accounts](https://developer.chrome.com/docs/webstore/service-accounts).
