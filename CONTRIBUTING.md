# Contributing to BrowserRig

BrowserRig welcomes focused bug reports, compatibility findings, tests, and
pull requests. It is a trusted local browser driver, so changes that widen
browser, filesystem, network, or credential access need an explicit threat
model and regression coverage.

## Development setup

Use Node.js 22.22.0 or newer and pnpm 11:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

`pnpm run ci` type-checks the project, runs the browser-free test suite, builds
the CLI and extension, and packages the Chrome Web Store ZIP. Extension changes
must also be tested by reloading `extension/dist` as an unpacked extension.

The full real-browser smoke command is documented in `AGENTS.md`. It operates a
locally installed BrowserRig extension and should be run for relay, CDP,
session, adoption, handoff, recording, or extension lifecycle changes.

## Design expectations

- Keep BrowserRig a local driver; do not add a bundled model or hosted relay.
- Preserve the user's existing Chromium profile and background-tab behavior.
- Keep active-tab attachment bound to one extension connection generation and
  fail closed if that connection changes.
- Do not broaden the production extension-origin allowlist.
- Treat execute code and local callers as trusted, while keeping credentials
  out of logs, journals, diagnostics, and ordinary results.
- Update tests, `README.md`, the bundled skill, and Store disclosures whenever
  a user-visible workflow or permission changes.

Run `git diff --check` before opening a pull request. Explain the behavior being
changed, the security implications, and the exact tests performed.

## Branches, commits, and language

Do not commit directly to `main`. Use a focused branch named
`<type>/<kebab-case-summary>` and merge it through a pull request.

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) in
English with the form `<type>(optional-scope): description`. Use `feat` for a
feature and `fix` for a bug fix. The project also accepts `docs`, `refactor`,
`test`, `build`, `ci`, `chore`, `perf`, `style`, and `revert`. Mark a breaking
change with `!` and a `BREAKING CHANGE:` footer. Keep source comments,
documentation, commit messages, branch names, and pull request titles and
bodies in English.

## Release notes

For a pull request that changes behavior shipped in the `browserrig` npm
package, run `pnpm changeset`, choose the appropriate semantic-version bump,
and commit the generated `.changeset/*.md` file. Write the summary for package
users rather than as an implementation note. Documentation, tests, CI, and
internal refactors that do not change published behavior do not need a
changeset.

After releasable changes reach `main`, the `Version packages` workflow creates
or updates one shared `Version Packages` pull request. Additional changesets
accumulate in that same pull request until a maintainer merges it. Merging the
version pull request updates `package.json` and `CHANGELOG.md`; it does not
publish either release artifact.

## Reporting security issues

Do not open a public issue for an undisclosed vulnerability. Follow
[`SECURITY.md`](./SECURITY.md) instead.
