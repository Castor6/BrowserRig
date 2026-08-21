# BrowserRig Security Policy

## Supported versions

Until BrowserRig has its first stable release, security fixes target the latest
published prerelease and the `main` branch.

## Report a vulnerability privately

Use GitHub's **Report a vulnerability** flow on the BrowserRig repository's
Security tab. Include the affected version or commit, impact, reproduction
steps, and any suggested mitigation. Please do not include real credentials,
cookies, private browsing data, or recordings in a report.

If private vulnerability reporting is temporarily unavailable, open a minimal
issue asking the maintainers to establish a private contact channel; do not
publish exploit details in that issue.

## Security model

BrowserRig intentionally gives trusted local callers broad control over tabs in
the user's signed-in browser. The loopback relay is not authenticated per local
process, and execute sessions are not an untrusted-code sandbox. Those are
documented trust boundaries, not vulnerabilities by themselves.

Reports are especially useful when they show an escape from an authorized tab
or session, cross-session target disclosure, production extension-origin
bypass, unexpected credential disclosure, remote access to the loopback relay,
or a way to bypass the documented CDP guardrails.

See [`DISCLOSURE`](./DISCLOSURE) for the full dual-use capability and prohibited
use statement.
