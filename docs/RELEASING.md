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
is ready to become public. Merging it authorizes staging the candidate and
submitting the extension to Store review after npm approval. npm publication
requires a separate human 2FA approval. Do not merge a second version pull
request until the first publication and its GitHub Release have been finalized.

The merge builds and verifies one immutable candidate, then stages its exact
npm tarball through short-lived OIDC credentials. After human approval makes
npm public, the scheduled finalizer verifies the public bytes and submits the
retained extension ZIP through Chrome Web Store API V2 before publishing the
GitHub Release. Full CI runs before staging; Google review remains mandatory.
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
stages the exact npm tarball through the repository's trusted OIDC identity,
and leaves approval instructions in the run summary. A manual dispatch on
`main` with `confirm_package=BrowserRig` builds only by default. Supplying the
exact `stage_version` additionally authorizes staging and automatic finalization
after npm approval. Never use a rebuild to replace an already staged or
published candidate.

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

Configure npm Trusted Publishing for `Castor6/BrowserRig`, `release.yml`, and
`npm-publishing`, with permission to stage packages. BrowserRig declares dual-use
content: direct OIDC publishing is not supported by npm for this package.
Keep account 2FA enabled; never add an npm token or bypass-2FA credential.
Inspect the existing relationship before changing it:

```bash
npm trust list browserrig --registry=https://registry.npmjs.org
```

If replacement is needed, revoke only the matching relationship by its id and
configure the stage-only relationship:

```bash
npm trust revoke browserrig --id <trust-id> --registry=https://registry.npmjs.org
npm trust github browserrig \
  --repo Castor6/BrowserRig \
  --file release.yml \
  --env npm-publishing \
  --allow-stage-publish \
  --registry=https://registry.npmjs.org
```

1. Merge the reviewed `Version Packages` PR. `Publish release` runs full CI,
   builds one immutable candidate, retains it for 90 days, verifies it, and runs
   `npm stage publish` on that exact tarball with provenance. Success means
   **awaiting approval**, not published. The Actions summary explains the next step.
2. Open npm's **Staged Packages** tab, inspect the package version and provenance,
   and approve it with 2FA. Alternatively, in an authenticated local npm CLI:

   ```bash
   npm stage list browserrig
   npm stage view <stage-id>
   npm stage approve <stage-id>
   ```

3. `Publish GitHub release` checks every five minutes on main. Use its **Run
   workflow** button for an immediate check. Scheduling is best-effort and may
   be delayed; public-repository schedules can be disabled after 60 days without
   repository activity.
4. Once npm exposes the exact version, the finalizer downloads its public
   tarball and verifies its bytes against the retained candidate. It prepares
   a GitHub Release draft and verifies all assets, then submits the retained
   extension ZIP to the Store. Only successful Store submission (or an existing
   matching submission/publication) allows the GitHub Release to become public.
   A Store failure leaves a resumable draft; later checks retry without
   rebuilding. A completed matching GitHub Release is a no-op and does not
   resubmit the extension.

The finalizer considers the latest 100 completed release-workflow runs. Keep
releases serialized: do not start another release while one awaits npm approval
or automatic finalization. It accepts legacy PR candidates and v2 candidates
that explicitly authorize staging; legacy manual builds and new build-only
artifacts are excluded. Missing npm versions cause no publication side effects;
network errors, integrity mismatches, and conflicting tags/assets fail closed.

For recovery of an unpublished version correction, run **Publish release** on
main with `confirm_package=BrowserRig` and `stage_version` equal to the exact
current package version (for example `0.5.0`). This explicitly authorizes staging
and subsequent Store submission after npm approval. An empty `stage_version`
only builds artifacts and cannot trigger finalization. Never rebuild a version
already staged or published: inspect the existing stage/public tarball and
recover the original candidate instead. An ambiguous staging failure may have
succeeded remotely; use the local authenticated CLI to inspect it before retrying.
OIDC staging credentials cannot list or approve stages.

The failed `1.0.0` candidate cannot be reused for `0.5.0`. Build the corrected
candidate once after its PR is merged. Complete approval and finalization before
its 90-day artifact retention expires; expired candidates require manual recovery,
not an automatic rebuild of an already staged/published version.

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
   `.github/workflows/publish-github-release.yml` from the protected default branch.
   When migrating, update any existing condition pinned to `release.yml` before
   enabling the finalizer; the Store identity now belongs to the finalizer.
4. Create the GitHub environment `chrome-web-store-publishing`. It needs these
   environment variables, which are identifiers rather than credentials:

   - `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`: full provider resource name,
     `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>`
   - `CHROME_WEB_STORE_SERVICE_ACCOUNT`: the service-account email added to the
     Store publisher
   - `CHROME_WEB_STORE_PUBLISHER_ID`: the publisher ID shown under **Publisher
     → Settings** in the Developer Dashboard

The finalizer requests `id-token: write` and a short-lived access token
scoped to `https://www.googleapis.com/auth/chromewebstore`. Do not add a JSON
key, OAuth refresh token, or client secret as a fallback. Keep 2-Step
Verification enabled on the human developer account.

### Automated update behavior

After npm approval makes the package public, the scheduled finalizer
downloads the same retained release candidate, verifies
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
