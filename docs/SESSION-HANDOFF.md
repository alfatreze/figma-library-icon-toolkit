# Session handoff: Figma Library Icon Toolkit

Snapshot at **v0.1.0** (2026-10-09). Read this first when resuming in a fresh session. Repo: https://github.com/alfatreze/figma-library-icon-toolkit

## 1. What this is
A Figma plugin (TypeScript, Preact, `@create-figma-plugin`) that **scans** icon libraries, **audits** them, **detects/fixes** structural problems (Labs), and **exports** themeable packages for developers (SVG, sprite, HTML preview, Angular 17.1+/14+, React, `icons.json`, README, changelog). It also generates **Dev Mode / VS Code** snippets and has an optional **local companion** (`tools/icon-sync.mjs`) that writes into a project folder and commits with git.

Principle: **the plugin never edits a Figma file** unless Labs is enabled, the user confirms a previewed fix, and it is applied as one undo step.

## 2. Repository map
| Path | What |
|---|---|
| `plugin/src/main.ts` | plugin entry: window, settings persistence, message handlers, codegen switch (`figma.mode`) |
| `plugin/src/main/` | Figma-sandbox code: `scan.ts` (traversal + export, single pass), `facts.ts` (paints/variables/bounds), `diagnose.ts` (detached/loose/names/duplicates), `apply.ts` (the only code that edits the file), `outline.ts` (strokes→paths via `strokeGeometry`), `overrides.ts`, `codegen.ts` (Dev Mode), `shared.ts` (config stored in file), `settings.ts` |
| `plugin/src/core/` | DOM-light logic, unit-tested: `naming`, `svg` (themeing), `audit`, `rules`, `process`, `library` (grid/tier), `categories`, `tokens`, `stroke`, `overrides` (support matrix), `changelog` (identity/diff), `config`, `snippets`, `sanitize`, `pathTransform`, `fixes`, `generators/*` |
| `plugin/src/ui.tsx`, `plugin/src/ui/` | UI: tabs (Icons / Issues / Skipped), Export panel, Settings, Fix cards, InfoTip popovers, resize handles |
| `plugin/test/` | Vitest (happy-dom) + generic fixtures; `dump.test.ts` writes a sample export when `DUMP_DIR` is set |
| `tools/icon-sync.mjs` | local companion (+ `icon-sync.test.mjs`) |
| `docs/` | decisions, heuristics, Dev Mode proposals, change-detection storage, identity brief, verification checklist, releasing |
| `scripts/generate-notices.mjs` | regenerates `THIRD_PARTY_NOTICES.md` |

Data flow: UI sends `SCAN` → main traverses (components, instances, frames, loose) and for each icon exports SVG (`exportAsync`), gathers facts, runs `Diagnoser` → emits `RawIcon[]` batches → UI `processIcons()` themes SVG (`core/svg.ts`), names, audits, builds `Icon[]` → generators build the ZIP in the UI (`fflate`).

## 3. Feature status (v0.1.0)
Done: scope selector (selection/page/document), usage mode + override alerts, categories, export panel, identity/versions (compare previous `icons.json`), token naming modes, stroke policy + stroke-to-path, team config (export/import/publish to file), Issues overview with Fix-all, fixes with previews, React format, Dev Mode codegen, project sync (Labs), generated developer README, SVG sanitiser, composite-frame option, vector-layer-name auto-detection, duplicate groups with "mark as intentional".

**Not verified inside Figma yet:** Labs fixes, Dev Mode codegen, shared config, companion sync, stroke-to-path accuracy, manifest keys (`capabilities`, `codegenPreferences`, `devAllowedDomains`). Checklist: `docs/verification.md` (V1-V20).

## 4. Key decisions (details in docs)
| Topic | Decision | Doc |
|---|---|---|
| Output model | Structure-preserving export (no flatten), themeable via CSS variables, `currentColor` primary slot, token fallback chain | `DECISIONS.md` |
| FontAwesome | only a naming/structure inspiration; no tuple, no dependency | `DECISIONS.md` |
| Fixes | one scan; fixes inside Issues; Labs + branch acknowledgement; confirm; one undo | `HEURISTICS.md`, `DECISIONS-v3.md` |
| Identity | component key = identity; renames become deprecated aliases (Labs, owner to decide) | `IDENTITY.md` |
| Strokes | constant weight default; weight-by-size table; scale; optional paths | `DECISIONS-v3.md` |
| Tokens | path / collection+path / custom mapping / none, prefix, preview | `DECISIONS-v3.md` |
| Dev Mode | config published in the file (opt-in write); preferences; Angular > HTML > React > CSS; Code Connect deferred (needs Org plan) | `DEV-MODE.md`, `DECISIONS-v4.md` |
| Storage | clientStorage = per user; in-file plugin data = shared; repo `icons.json` = durable | `CHANGE-DETECTION.md` |

## 5. Backlog (priority order)
1. **Verify in Figma** (V10, V14, V16-V18 first: they decide whether Dev Mode and sync work at all).
2. Layered **baseline** for "changed since last time" (repo > shared in-file > local) with filter chips; file identity without `fileKey`.
3. Variable matching by **leaf order** instead of hex; configurable token mapping table from variable collections.
4. Angular: per-icon tree-shakable exports, lazy per-category providers, sprite-injection strategy; Web Component target.
5. Dev Mode: Inspect-panel UI, "icons used here" subset ZIP, dev resources links, Code Connect generation.
6. Fix hardening (replace-with-instance placement in auto-layout, reactions, layer name), duplicate-name policy, mock-based tests for `main/`.
7. CI: `ngc` (Angular 14 + latest), React `tsc`, Playwright render + pixel diff, size budgets.
8. Aliases in the export for intentional duplicate artwork (`aliasOf`).

Open owner decisions: adopt component-key identity? allow in-file baseline write? community publishing (plugin id, `devAllowedDomains`).

## 6. Lessons learned (avoid repeating)
- **Manifest:** unknown keys are rejected (`editorAPI` broke loading). `@create-figma-plugin` spreads unknown `figma-plugin` keys into `manifest.json`. If Figma rejects the manifest, remove `codegenPreferences`, then `vscode`.
- **CSS modules:** `styles.css.d.ts` is generated by `npm run build`; stale typings cause bogus `styles.x does not exist` errors.
- **`documentAccess: "dynamic-page"`:** no sync `figma.getNodeById` (use `getNodeByIdAsync`); `main.parent` reads on unloaded pages can throw.
- **Window resize:** the stock `useWindowResize` hook rebuilt its handles on re-render; we use `ui/resize.ts` (created once, `screenX/Y` deltas).
- **Signatures:** artwork comparison must include **orientation** (flip/rotation) or mirrored icons look like duplicates.
- **Naming standards:** detect the dominant vector-layer name from the file instead of hard-coding one.
- **Generated code must compile:** a literal-typed comparison in generated `icons.ts` slipped through until `ngc` ran; keep the type-check regression test.
- **Verify UI visually** with a browser harness: serve `build/ui.js` with `theme.css`/`base.css`, a `<div id="create-figma-plugin">`, `__FIGMA_COMMAND__`, and post `{pluginMessage:[name,...args]}` events.
- **Inspect real files** read-only through the Figma MCP (`use_figma` with `return`), never write to a user's file during diagnosis.
- Do not publish proprietary icons/fixtures; keep docs free of third-party product critiques and company names.

## 7. Everyday commands
```bash
cd plugin && npm ci && npm test && npm run build     # tests + build (manifest.json, build/)
node --test tools/icon-sync.test.mjs                  # companion tests
DUMP_DIR=/tmp/sample npx vitest run test/dump.test.ts # write a sample export to inspect
node scripts/generate-notices.mjs                     # refresh THIRD_PARTY_NOTICES.md
```
Release: see `RELEASING.md` (semver, tag `vX.Y.Z`, workflow publishes the zip).

## 8. Resume prompt (paste into a fresh session)
> We are continuing the Figma Library Icon Toolkit (github.com/alfatreze/figma-library-icon-toolkit, v0.1.0). Read `docs/SESSION-HANDOFF.md`, `docs/TEAM-REVIEW.md` §7 and `docs/DEV-MODE.md`. Next: <verification of Dev Mode in Figma / baseline for change detection / Angular tree-shaking / …>. Keep the principle that the plugin never edits a Figma file without Labs + confirmation.

## 9. Research sources used
Figma API: [DetachedInfo](https://developers.figma.com/docs/plugins/api/DetachedInfo), [codegen](https://developers.figma.com/docs/plugins/api/figma-codegen), [Working in Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode), [setPluginData](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata), [clientStorage](https://developers.figma.com/docs/plugins/api/figma-clientStorage), [Code Connect HTML](https://developers.figma.com/docs/code-connect/html). Community: [swap overrides and layer names](https://forum.figma.com/t/instance-swapped-icons-dont-preserve-across-variants/91759), [icon best practices](https://forum.figma.com/ask-the-community-7/every-icon-best-practice-you-need-to-know-18030), [root plugin data and branches](https://forum.figma.com/t/the-data-saving-with-figma-root-setplugindata-in-a-branch-will-not-be-merged-into-main-branch/53002). SVG theming: [multi-coloured symbols with CSS variables](https://www.freecodecamp.org/news/lets-make-your-svg-symbol-icons-multi-colored-with-css-variables-cddd1769fca4/).
