# BrowserRig Extension Privacy Policy

Effective August 22, 2026

BrowserRig is a local browser driver for user-authorized automation. This
policy describes the BrowserRig browser extension and the local BrowserRig
driver it connects to. Support and policy questions can be filed in the
[BrowserRig issue tracker](https://github.com/Castor6/browserrig/issues).

## Data The Extension Can Access

Trusted programs using the local driver can
control attached tabs and tabs they create. Depending on the command you run,
that access can include:

- Page URLs, titles, visible and programmatically available page content.
- Form fields and interactions performed on controlled pages.
- The signed-in state available to the controlled page.
- Browser debugging events and network activity associated with controlled
  pages, including matching cross-origin requests and responses.
- Images or recordings of a controlled tab when an authorized local caller
  requests them.

BrowserRig does not collect this data for advertising, analytics, credit
decisions, or sale to third parties.

BrowserRig's use of information received from Google APIs complies with
the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Local Processing

The extension connects to the BrowserRig driver at
`127.0.0.1:19990` on the same computer. Browser data handled by the extension is
sent only over this loopback connection to the local driver. The project
publisher does not operate a BrowserRig cloud relay and does not receive
page contents, browsing history, credentials, debugging events, screenshots, or
recordings.

Programs and agents you authorize to call the local driver may receive data
returned by the commands they run. Their handling of that data is governed by
the software and services you chose to run, not by BrowserRig.

## Local Storage

The extension does not store browsing data. The local driver stores relay state,
session descriptors, access-restricted secret profiles, and execution journals
under `~/.browserrig`. Journals can include agent code, bounded result
previews, page URLs, navigations, errors, and handoff summaries. Screenshots,
recordings, and network exports are written to the path selected by the caller.
Disabling or removing the extension does not automatically delete these local
files. You can delete sessions through the BrowserRig CLI and remove
user-selected artifacts normally. Local sessions, journals, captures, and
secret profiles remain until the user deletes their corresponding files or
BrowserRig data.

## Your Controls

The extension visibly marks controlled tabs. A trusted local caller can attach
the active tab in the last-focused browser window without a toolbar click. The
toolbar button remains available to attach or detach a tab manually, and
Chrome may show its standard debugging infobar while a tab is attached. You can
reset or delete BrowserRig sessions with the local CLI. You can stop all
extension activity by disabling or removing BrowserRig from your browser's
extensions page.

## Security

BrowserRig is intended for trusted local use. Only enable it on a computer
where you trust the programs and agents that can access the local driver. The
driver rejects cross-origin browser requests, limits its listener to local
interfaces by default, and blocks destructive browser-wide debugging commands,
but a trusted caller can attach the active tab and read or modify any tab it
controls.

## Changes And Contact

Material changes to BrowserRig's data handling will be reflected in this
policy and the Chrome Web Store listing. Contact the maintainers through the
[BrowserRig issue tracker](https://github.com/Castor6/browserrig/issues).
