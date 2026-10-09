# Session handoff: Figma Library Icon Toolkit

Snapshot at **v0.4.0** (2026-10-09). Releases: v0.1.0 first public, v0.2.0 backlog items 2-8, v0.2.1 audit fixes, v0.3.0 UI redesign + Figma plugin id, v0.3.1 dropdown fix, v0.4.0 publish to GitHub/GitLab from the plugin. Read this first when resuming in a fresh session. Repo: https://github.com/alfatreze/figma-library-icon-toolkit

## 1. What this is
A Figma plugin (TypeScript, Preact, `@create-figma-plugin`) that **scans** icon libraries, **audits** them, **detects/fixes** structural problems (Labs), and **exports** themeable packages for developers (SVG, sprite, HTML preview, Angular 17.1+/14+, React, `icons.json`, README, changelog). It also generates **Dev Mode / VS Code** snippets and can **publish the export to GitHub or GitLab** (new branch, one commit, pull / merge request) directly from the plugin with the user's own access token; no local program.

Principle: **the plugin never edits a Figma file** unless Labs is enabled, the user confirms a previewed fix, and it is applied as one undo step.

## 2. Repository map
| Path | What |
|---|---|
| `plugin/src/main.ts` | plugin entry (all UI messages go through `main/guards.ts` validation and the `safe()` wrapper): window, settings persistence, message handlers, codegen switch (`figma.mode`) |
| `plugin/src/main/` | Figma-sandbox code: `scan.ts` (traversal + export, single pass), `facts.ts` (paints/variables/bounds), `diagnose.ts` (detached/loose/names/duplicates), `apply.ts` (the only code that edits the file), `outline.ts` (strokes→paths via `strokeGeometry`), `overrides.ts`, `codegen.ts` (Dev Mode), `shared.ts` (config stored in file), `settings.ts` |
| `plugin/src/core/` | DOM-light logic, unit-tested: `naming`, `svg` (themeing), `audit`, `rules`, `process`, `library` (grid/tier), `categories`, `tokens`, `stroke`, `overrides` (support matrix), `changelog` (identity/diff), `config`, `snippets`, `sanitize`, `pathTransform`, `fixes`, `generators/*` |
| `plugin/src/ui.tsx`, `plugin/src/ui/` | UI. `ui.tsx` is the shell; `ui/hooks/` (`useScan`, `useBaselines`, `usePublish`), `ui/selectors.ts` (pure derivations), `ui/components/` (`Segmented`, `TabBar`, `FormatCards`), `ui/Dialog.tsx` (focus trap, Esc), `ui/IconPreview.tsx` (hover preview), `ui/PublishDialog.tsx`, `ui/Settings.tsx` (five tabs), `ui/ExportPanel.tsx`, `ui/styles.ts` (the ONLY importer of `styles.css`) |
| `plugin/src/types/` | `settings`, `domain`, `fixes`, `messages` (one typed `Messages` map for every UI↔main message) |
| `plugin/test/` | Vitest (happy-dom) + generic fixtures; `helpers/fakeFigma.ts` (in-memory Figma API for `main/*` tests) and `helpers/fakeHost.ts` (fake GitHub/GitLab); `dump.test.ts` writes a sample export when `DUMP_DIR` is set |
| `e2e/`, `scripts/` | Playwright render + pixel diff; `compile-check.mjs` (ngc/tsc on generated code), `size-budget.mjs`, `toolchains/` |
| `plugin/src/core/gitHost/` | GitHub and GitLab clients behind one interface (`types.ts`), planning against the default branch and publishing (`publish.ts`), path and branch rules (`paths.ts`); tests use in-memory fake servers (`test/helpers/fakeHost.ts`) |
| `docs/` | decisions, heuristics, Dev Mode proposals, change-detection storage, identity brief, verification checklist, releasing |
| `docs/design/ux-redesign.html` | mockup of the current UI (stable skeleton, previews, settings tabs) |

Data flow: UI sends `SCAN` → main traverses (components, instances, frames, loose) and for each icon exports SVG (`exportAsync`), gathers facts, runs `Diagnoser` → emits `RawIcon[]` batches → UI `processIcons()` themes SVG (`core/svg.ts`), names, audits, builds `Icon[]` → generators build the ZIP in the UI (`fflate`).

## 3. Feature status (v0.4.0)
Done: scope selector, usage mode, categories, scan robustness (per-layer isolation, page-by-page load, parallel export), export formats via a `Target` registry (SVG, sprite, HTML preview, mask, Angular 17.1+/14+ with per-icon tree-shakable data, lazy category chunks and sprite strategy, React, Web Component, Code Connect templates), identity/versions with layered baselines (this computer / shared in file (Labs) / repository / loaded file), token naming and variable matching by paint order, stroke policy + stroke-to-path, team config, duplicate-name policy and aliases for intentional duplicates, Issues with Labs fixes (hardened: auto-layout, reactions, rollback), Dev Mode codegen + inspect panel + dev resources (Labs), **publish to GitHub / GitLab** (new branch, one commit, pull / merge request, generated description, no local helper), settings schema with validation and migrations, allow-list SVG sanitiser, diagnostics ("Copy diagnostics").

UI (v0.3): one stable skeleton (scan bar, fixed-height status row, tabs, toolbar, sticky Export bar; states change content only), six-tab Settings (Packages, Output, Style, Scan, Team, Labs), S/M/L previews + hover preview + grid, visible active states, each fact shown once.

**Not verified inside Figma yet (this is Gate 0 in `ROADMAP.md`):** everything since v0.1.0, notably Dev Mode codegen and inspect panel, Labs fixes, shared config and baselines, publishing against real GitHub/GitLab accounts (only fake servers and a bad-token call to the real APIs), stroke-to-path accuracy, manifest keys (`capabilities`, `codegenPreferences`, `networkAccess`). Checklist: `docs/verification.md` (V1-V33).

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
| Publishing | Directly from the plugin to github.com / gitlab.com with the user's token; always a new branch + PR/MR; no local helper (a helper was built and removed: it was a misreading of the request). Several outputs (packages per folder / repository), one branch per repository | `DECISIONS-v5.md`, `OUTPUTS.md` |
| UX | Stable skeleton, show each fact once, 4-point spacing, visible active states, bigger previews | `UX-REVIEW.md` |
| Security | Everything from outside is validated (settings schema, catalog, baseline, UI messages); allow-list sanitiser | `AUDIT-v0.2.0.md` |

## 5. Roadmap
See **`ROADMAP.md`** (Gate 0 = verify in Figma; v0.5 designer / system-manager workflow; v0.6 developer experience; later: drift check in CI, self-hosted git hosts). Immediate next steps:
1. **Gate 0:** run `docs/verification.md` in Figma (V10, V14, V16-V18, V21-V33); publish to a throwaway GitHub and GitLab repo (V14, V32, V33); fix what breaks.
2. Community submission (listing text drafted in the session; review `networkAccess` and the `inspect` capability).
3. v0.4 polish: done (unreleased): auto-contrast preview tile, plural helper, `theme-contrast` audit rule, keyboard-reachable hints (`data-hint`) instead of `title`, `useFixes` hook, `ui.tsx` split (621 lines): row/issue components in `ui/components/`, the three tab panels in `ui/panels/`, tests for `diagnose`/`facts`/`codegen`, Actions pinned by SHA. Also done: tabpanel/aria-controls, `useFilters`, provenance attestation step (untested until a release), dead CSS removed and the `ui.js` budget raised to 380 KB (outputs UI). Left: a Figma and visual check of the hints and panels (Gate 0).

Open owner decisions: audience of the first Community release (design-system teams vs developers), Org/Enterprise plan (Code Connect, CI drift check), which frameworks next (Vue / Svelte), brand colour (follow Figma's token or a darker blue for text contrast).

## 5b. Audit follow-up
`docs/AUDIT-v0.2.0.md` lists every finding of the post-0.2.0 code audit with its status. Open items: none from the audit that is not a decision; Gate 0 is the next real step. Angular, React and Web Component output are pinned by `test/angular.test.ts` and `test/react-webcomponent.test.ts` (update with `npx vitest run -u <file>` when a change is intended).

## 6. Lessons learned (avoid repeating)
- **Manifest:** unknown keys are rejected (`editorAPI` broke loading). `@create-figma-plugin` spreads unknown `figma-plugin` keys into `manifest.json`. If Figma rejects the manifest, remove `codegenPreferences`, then `vscode`.
- **CSS modules:** `styles.css.d.ts` is generated by `npm run build`; stale typings cause bogus `styles.x does not exist` errors.
- **`documentAccess: "dynamic-page"`:** no sync `figma.getNodeById` (use `getNodeByIdAsync`); `main.parent` reads on unloaded pages can throw.
- **Window resize:** the stock `useWindowResize` hook rebuilt its handles on re-render; we use `ui/resize.ts` (created once, `screenX/Y` deltas). **Expanding stalled** in the first real Figma run: the iframe gets no pointer events outside itself and the pointer leaves it on the first outward pixel, before Figma has grown the window. The handles keep the window slightly ahead of the pointer while growing (the lead follows the pointer's speed, 12 px for a slow drag up to 120 px for a fast one; a fixed 160 px lead with an idle timeout jumped at the start of a drag and after pauses, and a distance-based lead made the window run visibly ahead of the cursor) and settle on the exact size on release, or when the pointer is back over the iframe with no button down (`test/resize.test.tsx`).
- **Signatures:** artwork comparison must include **orientation** (flip/rotation) or mirrored icons look like duplicates.
- **Naming standards:** detect the dominant vector-layer name from the file instead of hard-coding one.
- **Generated code must compile:** a literal-typed comparison in generated `icons.ts` slipped through until `ngc` ran; keep the type-check regression test.
- **Every value from outside is data.** Config files, plugin data in the file, `icons.json` from the repo and every UI message are validated (`core/settingsSchema.ts`, `core/changelog.ts` `parseCatalog`, `main/guards.ts`). Never interpolate a setting into generated code without going through the schema or a helper like `policyOf`.
- **Compile what you generate.** Plain-TypeScript checks missed nothing today but real `ngc`/`tsc` runs (`scripts/compile-check.mjs`) and a Chromium render (`e2e/`) are the only honest test; the render test found that sprites with a valueless attribute are not valid XML, so external `<use>` drew nothing.
- **One stylesheet import.** The build inlines a CSS module once per importing file: 12 components importing `styles.css` meant 12 copies (653 KB bundle). Import `styles` only from `ui/styles.ts`.
- **Kit dropdown menus** are portaled to `<body>` at z-index 2; dialogs are at 20, so menus opened behind Settings. `styles.css` raises `body > [class*='_menu_']`; a test guards it.
- **UI kit buttons are 24 px**; CSS overrides them to 32 px via `[class*='_button_']`.
- **Stable layout is testable:** measure the tabs, scan button, search and Export button coordinates across first run / scanning / results in the harness (the harness viewport is the pane, not 460x640).
- **Do not guess at integrations that run outside Figma:** "push to GitHub and GitLab" was first built as a localhost helper; the owner wanted it self-contained. Ask what "self-contained" means before choosing an architecture.
- **Publishing is bounded:** GitHub trees in chunks (<= 250 files / 1.5 MB) then one commit; GitLab commits API in batches; GitHub and gitlab.com allow CORS from the plugin iframe (checked with `curl -H 'Origin: null'`).
- **Modern Angular needs 17.1** (signal `input()`); the classic flavour compiles on 14 through latest. Do not run the modern flavour against Angular 14 in CI.
- **Harness gotcha:** the UI command id is `src/main.ts--default` (set `__FIGMA_COMMAND__=''`), data for `showUI` arrives as `__SHOW_UI_DATA__`.
- **Verify UI visually** with a browser harness: serve `build/ui.js` with `theme.css`/`base.css`, a `<div id="create-figma-plugin">`, `__FIGMA_COMMAND__`, and post `{pluginMessage:[name,...args]}` events.
- **Inspect real files** read-only through the Figma MCP (`use_figma` with `return`), never write to a user's file during diagnosis.
- Do not publish proprietary icons/fixtures; keep docs free of third-party product critiques and company names.

## 7. Everyday commands
```bash
cd plugin && npm ci && npm test && npm run build     # tests + build (manifest.json, build/)
DUMP_DIR=/tmp/sample npx vitest run test/dump.test.ts # write a sample export to inspect
node scripts/generate-notices.mjs                     # refresh THIRD_PARTY_NOTICES.md
node scripts/size-budget.mjs                          # export + bundle size budgets (after npm run build)
npx vitest run test/gitHost.test.ts                   # publishing against the fake GitHub / GitLab
(cd scripts/toolchains/ng-latest && npm i) && node scripts/compile-check.mjs --toolchain scripts/toolchains/ng-latest --kind angular
(cd e2e && npm i && npx playwright install chromium && npx playwright test)   # render + pixel diff; UPDATE_GOLDEN=1 to refresh
```
Release: see `RELEASING.md` (semver, tag `vX.Y.Z`, workflow publishes the zip).

## 8. Resume prompt (paste into a fresh session)
> We are continuing the Figma Library Icon Toolkit (github.com/alfatreze/figma-library-icon-toolkit, v0.4.0). Read `docs/SESSION-HANDOFF.md`, `docs/ROADMAP.md` and `docs/UX-REVIEW.md`. Nothing since v0.1.0 has been run inside Figma yet (Gate 0). Next: <results of the Figma verification / publish test on a throwaway repo / v0.4 polish items / Community submission>. Keep the principles: the plugin never edits a Figma file without Labs + confirmation; self-contained (no local helper); stable layout; show each fact once; validate everything from outside.

## 9. Research sources used
Figma API: [DetachedInfo](https://developers.figma.com/docs/plugins/api/DetachedInfo), [codegen](https://developers.figma.com/docs/plugins/api/figma-codegen), [Working in Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode), [setPluginData](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata), [clientStorage](https://developers.figma.com/docs/plugins/api/figma-clientStorage), [Code Connect HTML](https://developers.figma.com/docs/code-connect/html). Community: [swap overrides and layer names](https://forum.figma.com/t/instance-swapped-icons-dont-preserve-across-variants/91759), [icon best practices](https://forum.figma.com/ask-the-community-7/every-icon-best-practice-you-need-to-know-18030), [root plugin data and branches](https://forum.figma.com/t/the-data-saving-with-figma-root-setplugindata-in-a-branch-will-not-be-merged-into-main-branch/53002). SVG theming: [multi-coloured symbols with CSS variables](https://www.freecodecamp.org/news/lets-make-your-svg-symbol-icons-multi-colored-with-css-variables-cddd1769fca4/).
