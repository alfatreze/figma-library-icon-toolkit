# Session handoff: Figma Library Icon Toolkit

Snapshot at **v0.1.0 + Unreleased** (2026-10-09; backlog items 2-8 implemented, see CHANGELOG.md `[Unreleased]`). Read this first when resuming in a fresh session. Repo: https://github.com/alfatreze/figma-library-icon-toolkit

## 1. What this is
A Figma plugin (TypeScript, Preact, `@create-figma-plugin`) that **scans** icon libraries, **audits** them, **detects/fixes** structural problems (Labs), and **exports** themeable packages for developers (SVG, sprite, HTML preview, Angular 17.1+/14+, React, `icons.json`, README, changelog). It also generates **Dev Mode / VS Code** snippets and has an optional **local companion** (`tools/icon-sync.mjs`) that writes into a project folder and commits with git.

Principle: **the plugin never edits a Figma file** unless Labs is enabled, the user confirms a previewed fix, and it is applied as one undo step.

## 2. Repository map
| Path | What |
|---|---|
| `plugin/src/main.ts` | plugin entry (all UI messages go through `main/guards.ts` validation and the `safe()` wrapper): window, settings persistence, message handlers, codegen switch (`figma.mode`) |
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
Items 2-8 of the previous backlog are **implemented but unverified inside Figma** (V21-V31 in `docs/verification.md`).
1. **Verify in Figma** (V10, V14, V16-V18 first, then V21-V31). Nothing below is proven until this is done; the mock tests (`plugin/test/main.test.ts`) only encode our assumptions about the API.
2. Decide and tag **v0.2.0** (see `RELEASING.md`): behaviour change for Angular/React `name` resolution (lazy categories), new formats default off.
3. Baseline polish: Dev Mode "changed since" badge from the shared baseline; "compare with code" (is the icon in the repo?) in the inspect panel; file identity without `fileKey` is a hash of file name + page ids (fragile under rename).
4. Variable matching: configurable mapping table from variable *collections/modes* (today: per-variable lines, wildcards, collection scope).
5. Dev Mode: Inspect panel previews at several sizes, PNG download; Code Connect with component *properties* (today: static `<x-icon name>` per component).
6. Fix hardening: reactions that point *to* the replaced node, instance swap props, variable bindings on carried fills; more mock cases (nested auto-layout, rotated parents).
7. CI: Playwright for the Angular/React components themselves (render in a sample app), cross-OS goldens (generated on macOS, compared on Linux with tolerance), npm publish dry run of the generated packages.
8. Intentional-duplicate aliases in `svg/` (today each name still gets its own file).

Open owner decisions: adopt component-key identity? allow in-file baseline write (Labs, root + first page)? community publishing (plugin id, `devAllowedDomains`, `inspect` capability review)? Code Connect needs an Organization/Enterprise plan.

## 5b. Audit follow-up
`docs/AUDIT-v0.2.0.md` lists every finding of the post-0.2.0 code audit with its status. Open items: `useFixes`/filters reducer and tab-panel components in `ui.tsx`, Angular modern/classic template merge, tests for `diagnose.ts`/`facts.ts`/`codegen.ts`, action SHA pinning and release provenance, tooltip keyboard access.

## 6. Lessons learned (avoid repeating)
- **Manifest:** unknown keys are rejected (`editorAPI` broke loading). `@create-figma-plugin` spreads unknown `figma-plugin` keys into `manifest.json`. If Figma rejects the manifest, remove `codegenPreferences`, then `vscode`.
- **CSS modules:** `styles.css.d.ts` is generated by `npm run build`; stale typings cause bogus `styles.x does not exist` errors.
- **`documentAccess: "dynamic-page"`:** no sync `figma.getNodeById` (use `getNodeByIdAsync`); `main.parent` reads on unloaded pages can throw.
- **Window resize:** the stock `useWindowResize` hook rebuilt its handles on re-render; we use `ui/resize.ts` (created once, `screenX/Y` deltas).
- **Signatures:** artwork comparison must include **orientation** (flip/rotation) or mirrored icons look like duplicates.
- **Naming standards:** detect the dominant vector-layer name from the file instead of hard-coding one.
- **Generated code must compile:** a literal-typed comparison in generated `icons.ts` slipped through until `ngc` ran; keep the type-check regression test.
- **Every value from outside is data.** Config files, plugin data in the file, `icons.json` from the repo and every UI message are validated (`core/settingsSchema.ts`, `core/changelog.ts` `parseCatalog`, `main/guards.ts`). Never interpolate a setting into generated code without going through the schema or a helper like `policyOf`.
- **Compile what you generate.** Plain-TypeScript checks missed nothing today but real `ngc`/`tsc` runs (`scripts/compile-check.mjs`) and a Chromium render (`e2e/`) are the only honest test; the render test found that sprites with a valueless attribute are not valid XML, so external `<use>` drew nothing.
- **Modern Angular needs 17.1** (signal `input()`); the classic flavour compiles on 14 through latest. Do not run the modern flavour against Angular 14 in CI.
- **Harness gotcha:** the UI command id is `src/main.ts--default` (set `__FIGMA_COMMAND__=''`), data for `showUI` arrives as `__SHOW_UI_DATA__`.
- **Verify UI visually** with a browser harness: serve `build/ui.js` with `theme.css`/`base.css`, a `<div id="create-figma-plugin">`, `__FIGMA_COMMAND__`, and post `{pluginMessage:[name,...args]}` events.
- **Inspect real files** read-only through the Figma MCP (`use_figma` with `return`), never write to a user's file during diagnosis.
- Do not publish proprietary icons/fixtures; keep docs free of third-party product critiques and company names.

## 7. Everyday commands
```bash
cd plugin && npm ci && npm test && npm run build     # tests + build (manifest.json, build/)
node --test tools/icon-sync.test.mjs                  # companion tests
DUMP_DIR=/tmp/sample npx vitest run test/dump.test.ts # write a sample export to inspect
node scripts/generate-notices.mjs                     # refresh THIRD_PARTY_NOTICES.md
node scripts/size-budget.mjs                          # export + bundle size budgets (after npm run build)
(cd scripts/toolchains/ng-latest && npm i) && node scripts/compile-check.mjs --toolchain scripts/toolchains/ng-latest --kind angular
(cd e2e && npm i && npx playwright install chromium && npx playwright test)   # render + pixel diff; UPDATE_GOLDEN=1 to refresh
```
Release: see `RELEASING.md` (semver, tag `vX.Y.Z`, workflow publishes the zip).

## 8. Resume prompt (paste into a fresh session)
> We are continuing the Figma Library Icon Toolkit (github.com/alfatreze/figma-library-icon-toolkit, v0.1.0). Read `docs/SESSION-HANDOFF.md`, `docs/TEAM-REVIEW.md` §7 and `docs/DEV-MODE.md`. Next: <verification of Dev Mode in Figma / baseline for change detection / Angular tree-shaking / …>. Keep the principle that the plugin never edits a Figma file without Labs + confirmation.

## 9. Research sources used
Figma API: [DetachedInfo](https://developers.figma.com/docs/plugins/api/DetachedInfo), [codegen](https://developers.figma.com/docs/plugins/api/figma-codegen), [Working in Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode), [setPluginData](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata), [clientStorage](https://developers.figma.com/docs/plugins/api/figma-clientStorage), [Code Connect HTML](https://developers.figma.com/docs/code-connect/html). Community: [swap overrides and layer names](https://forum.figma.com/t/instance-swapped-icons-dont-preserve-across-variants/91759), [icon best practices](https://forum.figma.com/ask-the-community-7/every-icon-best-practice-you-need-to-know-18030), [root plugin data and branches](https://forum.figma.com/t/the-data-saving-with-figma-root-setplugindata-in-a-branch-will-not-be-merged-into-main-branch/53002). SVG theming: [multi-coloured symbols with CSS variables](https://www.freecodecamp.org/news/lets-make-your-svg-symbol-icons-multi-colored-with-css-variables-cddd1769fca4/).
