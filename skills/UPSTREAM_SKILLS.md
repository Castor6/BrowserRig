# Upstream Skill Snapshots

The following project-local skills are pinned upstream snapshots. Keep
BrowserRig-specific decisions in `skills/browserrig-brand-assets/`; do not edit
the snapshots to encode this project's preferences. The only local change is a
documented Codex compatibility normalization when upstream frontmatter uses
unsupported catalog keys.

## `logo-design`

- Source: <https://github.com/rampstackco/claude-skills/tree/0479242522549dfdb389bb9b7807ad4d6016ffb7/skills/logo-design>
- Commit: `0479242522549dfdb389bb9b7807ad4d6016ffb7`
- Project path: `skills/logo-design/`
- Role: logo architecture, typography, symbol exploration, application tests,
  and production specifications.
- License: MIT, Copyright (c) 2026 RampStack Co.
- Local compatibility patch: moved upstream `category`, `catalog_summary`, and
  `display_order` fields under the Codex-supported `metadata` key. Instruction
  content is unchanged.

## `logo-design-board-cn`

- Source: <https://github.com/YangsonHung/awesome-agent-skills/tree/cb9d2b21801a687d4bd8e52b2c88e8ec9c0e48af/skills/zh-cn/logo-design-board-cn>
- Commit: `cb9d2b21801a687d4bd8e52b2c88e8ec9c0e48af`
- Project path: `skills/logo-design-board-cn/`
- Role: independent designer-lens critique, hard-gate review, and scoring.
- License: MIT, Copyright (c) 2026 Yangson.
- Local compatibility patch: none.

To update either snapshot, reinstall it from a reviewed newer commit, inspect
the full diff, rerun skill validation, and update this file. Do not pull a
floating branch into a design run.

## License Notices

### RampStack Co.

MIT License

Copyright (c) 2026 RampStack Co.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Yangson

MIT License

Copyright (c) 2026 Yangson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
