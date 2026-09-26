# Page preservation checks

These selected upstream #93 fixtures run against an isolated Google Chrome and
BrowserRig source relay. No ordinary browser profile is used. Start the relay
with `BROWSERRIG_PORT=21990 pnpm exec tsx src/cli.ts serve`, then run
`node scripts/page-preservation-browser.mjs` in a separately tracked process.
The harness copies the built BrowserRig extension to a temporary directory and
loads the test-only protected extension; no extension source or permissions are
changed. Stop both processes after validation.

Run each check once and retain the first output, including failures:

```sh
BROWSERRIG_PORT=21990 pnpm exec tsx scripts/check-page-preservation.ts
BROWSERRIG_PORT=21990 BROWSERRIG_TEST_INSPECTOR=http://127.0.0.1:21992 pnpm exec tsx scripts/check-protected-frame.ts
```

The private test inspector reads physical target metadata independently of the
relay and can activate only the `/protected` loopback fixture. It cannot run
arbitrary commands. The protected check asserts that Chrome's permission block
is named, no phantom frame remains, and the physical tab survives. Chrome may
revoke debugger attachment; the check explicitly selects the preserved tab,
adopts it, resets that adopted session (releasing the tab), and re-adopts it.
It does not claim automatic recovery after dismissing protected UI.

The heavy-SPA checks accept immediate recovery or a bounded unresponsive
failure, followed by readable state on the same target. Deterministic unit
checks separately force both health attempts to fail and check the fresh
connection path and target-generation races. Generic stalled-read naming,
implicit named-session creation, and forced overlay clicks are not introduced.
