# Contributing to BrowserRig

BrowserRig welcomes focused bug reports, compatibility findings, tests, and
pull requests. It is a trusted local browser driver, so changes that widen
browser, filesystem, network, or credential access need an explicit threat
model and regression coverage.

## Development setup

Use Node.js 22.22.2+, 24.15.0+, or 26+ and pnpm 11:

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

## Reporting security issues

Do not open a public issue for an undisclosed vulnerability. Follow
[`SECURITY.md`](./SECURITY.md) instead.
