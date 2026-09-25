---
"browserrig": major
---

Enable native WebMCP discovery by default for CLI, MCP, DSH, and SDK executions. Remove the experimental environment switch; existing environment-based opt-outs no longer apply. The deprecated per-call experimentalWebMcp field still accepts false to opt out for that call, while omitted or true enables discovery. Unsupported browsers keep ordinary Playwright execution available.
