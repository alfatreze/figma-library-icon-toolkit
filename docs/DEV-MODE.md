# Dev Mode: review and feature proposals (developer-facing plugin)

Perspectives: design-systems engineer (Figma) + senior frontend developer.

## 1. What Dev Mode allows (constraints that shape the design)
- Dev Mode plugins are **read-only** and by default run on the **current page only** ([Working in Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode)).
- Three entry points: **codegen** (Code section; `figma.codegen.on('generate')`, 15 s timeout, no `showUI` inside the callback), **inspect** (a plugin UI in the Inspect panel; `capabilities: ["inspect"]`, `figma.mode === 'inspect'`) and **VS Code** (`capabilities: ["vscode"]`) ([codegen](https://developers.figma.com/docs/plugins/api/figma-codegen), [mode](https://developers.figma.com/docs/plugins/api/properties/figma-mode)).
- Codegen **preferences** (language dropdown entries and custom settings) are native UI; values live in `figma.codegen.preferences` / your own storage. Dev resources (links on nodes) have `get/add/edit/deleteDevResourceAsync`.
- **Code Connect** supports HTML-based stacks incl. **Web Components, Angular, Vue** via template files; it needs an Organization/Enterprise plan; the Figma MCP server uses mappings in `get_design_context`, with reports of inconsistent behaviour between the remote and desktop server ([Code Connect HTML](https://developers.figma.com/docs/code-connect/html), [MCP guide](https://developers.figma.com/docs/figma-mcp-server/server-returning-web-code)).

## 2. Review of what we ship today (`src/main/codegen.ts`)
| # | Finding | Severity |
|---|---|---|
| D1 | **Reads settings from `clientStorage`, which is per user.** A developer in Dev Mode has none, so the snippet silently uses defaults (`cmn`) instead of the library's namespace/token/stroke settings. Output can be wrong with no warning. [verified in code] | **High** |
| D2 | Sprite URL is hard-coded to `<ns>-sprite.svg`; real projects serve it from a path | Medium |
| D3 | No notes for overrides that code cannot reproduce (opacity, hidden layers…), although the export already knows them | Medium |
| D4 | Colour overrides mapped **by leaf index** and only when leaf counts match; variable-bound overrides are emitted as hex, not as your token | Medium |
| D5 | Only icon instances/components are handled; a screen/frame selection says "select an icon" | Medium (missed value) |
| D6 | Snippets: HTML, Angular, CSS vars. No Web Component / React / inline SVG | Low |
| D7 | No `inspect` or `vscode` capability: no UI, nothing for code-first devs in VS Code | Low |
| D8 | Manifest combination (`figma` + `dev`, `codegen`) untested in Figma (V10) | Unknown |

## 3. Proposals (priority order)

### P0: make the snippets trustworthy
1. **Shared library config in the file.** Designer publishes `toolkit.config.json` into plugin data (opt-in, one write; see [CHANGE-DETECTION.md](CHANGE-DETECTION.md)). Dev Mode reads it, so namespace/naming/tokens/stroke policy match the export for everyone. If missing, the snippet says so ("using defaults: ask your design system team to publish the config").
2. **Codegen preferences** (native dropdown): *Output* (HTML sprite · inline SVG · Angular 17.1+ · Angular 14+ · Web Component · CSS vars), *Sprite base path*, *Size unit* (px/rem/em), *ARIA* (decorative / labelled), *Tokens* (variable names / hex).
3. **Notes section** in the output: "Opacity override not supported by the Angular output: ask design for a variant." Reuses `core/overrides.ts`.
4. **Token-aware colours**: for variable-bound overrides emit `var(--your-token)` using the configured naming.

### P1: what developers actually do in Dev Mode
5. **"Icons used here" for any selection** (frame/screen/component): list every icon instance with count, sizes and overrides, plus a copy-paste import line and the exact `icons.json` subset. A *bill of materials* for the screen.
6. **Inspect panel UI** (reuse our UI kit): icon card (preview at sizes, name, category, tags, deprecated → use `X`, library version), **Copy snippet**, **Download SVG / PNG**, and **Download subset ZIP for the icons used in this frame** (sprite + Angular data via the same generators; downloads work from a plugin UI even though Dev Mode is read-only).
7. **Dev resources:** from design mode (opt-in write) attach links to each icon component: icon docs / repo path / `icons.json#name` / Storybook. Shows in Dev Mode's native "Dev resources" list.
8. **Code Connect generation** (HTML template files): `<cmn-icon name="home" [size]="…"/>` per icon, with the size/colour properties mapped, so **parent components** (Button with an icon slot) render the right nested snippet and the **Figma MCP** can resolve icons for AI agents. Output goes into the repo; publish with the Code Connect CLI.

### P2: lifecycle
9. **"Changed since" badge** in Dev Mode from the shared baseline (repo or in-file): "recoloured in v1.3.0", "renamed → use `x`".
10. **VS Code**: add `vscode` capability so the same snippets appear in Figma for VS Code; keep output plain text.
11. **Compare with code**: via the companion, check that the icon exists in the repo `icons.json` ("not in your project yet: run sync").

## 4. Architecture notes
- One `core/` (naming, tokens, overrides, generators) already DOM-free; add `core/snippets.ts` so codegen, the Export README and the Inspect UI produce **identical** strings.
- Dev Mode code path: `figma.mode` switch in `main.ts` → `codegen` (no UI) / `inspect` (UI with `mode: 'inspect'`) / default.
- Everything read-only except the explicitly opt-in "publish config" and "attach dev resources" writes (design mode, Labs).

## 5. Roadmap
| Step | Scope | Needs |
|---|---|---|
| DM-0 | P0 (1–4) | shared config write (opt-in), preferences in manifest |
| DM-1 | P1 (5, 6) | `inspect` capability, subset generator reuse |
| DM-2 | P1 (7, 8) | Org/Enterprise plan for Code Connect |
| DM-3 | P2 | repo/companion baseline |

Verification (add to `verification.md`): manifest accepted with `inspect` + `codegen` (+ `vscode`); codegen output vs export for 20 icons; subset download from Dev Mode; remote-library instance export in read-only Dev Mode.

## 6. Decisions needed
1. May the plugin write the shared config into the file (opt-in, one small entry)? Without it, Dev Mode output cannot be guaranteed to match.
2. Do you have an Organization/Enterprise plan (Code Connect)? Do developers use Figma for VS Code?
3. Which outputs matter first for your developers: Angular, plain HTML/sprite, Web Component, React?
