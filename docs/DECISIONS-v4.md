# Decisions v4 (Dev Mode round) and status

| # | Your answer | Implemented |
|---|---|---|
| 1 | Allow the opt-in write of the shared config into the file | **Yes.** Settings → Team config → **Publish to this file (Labs)**. Written to the document root *and* the first page (branch-merge safety). The plugin shows when a file config exists/differs and offers **Use the file's config**. |
| 2 | Private now, community later | No `figma.fileKey` / private-only APIs used. Manifest keys are all community-compatible, but **review `devAllowedDomains` (localhost companion) before publishing**: it is a Labs/dev feature and may need to be removed or justified in the community listing. |
| 3 | No Org plan; some devs use Figma for VS Code | Code Connect **deferred**. `vscode` capability added so the same snippets run in Figma for VS Code. |
| 4 | Angular > HTML > React > Web Component | Dev Mode languages ordered **Angular, HTML (sprite), React, CSS variables**. **React export format added** (off by default; Settings → Export formats). **Web Component** not started. |

## Dev Mode (codegen) now
- Reads the library config from the file (fallback: your saved settings, then defaults) and **says which one it used**.
- Native preferences: sprite location, size unit (px/rem), accessibility (decorative/labelled), override colours (design tokens / hex).
- Override colours emit `var(--your-token)` when the Figma fill was variable-bound (token naming from the config).
- **Notes: overrides** section for overrides the enabled formats cannot reproduce.
- Selecting a **frame/screen** lists the icons used there (name, count, sizes) with ready-to-paste tags / sprite ids.

## Still open
Inspect-panel UI + subset ZIP download in Dev Mode, Dev resources links, "changed since" baseline (see `CHANGE-DETECTION.md`), Web Component format, Code Connect (needs Org plan).

## New verification items
| # | Check |
|---|---|
| V16 | Manifest accepted with `capabilities: [codegen, vscode]` and `codegenPreferences` (if rejected, remove `codegenPreferences` first) |
| V17 | Publish config as an editor; read it as a viewer in Dev Mode; confirm output matches the export |
| V18 | Branch: publish in a branch, merge, check the root and page copies survive |
| V19 | Preferences change the snippet (sprite path, rem, labelled, hex) |
| V20 | Generated React component renders in a React 17/18 app (type-checks under `strict` already) |
