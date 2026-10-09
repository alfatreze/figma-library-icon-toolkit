# Icon Library Toolkit (Figma plugin) — v0.1.0 first build

Scans icons in Figma, audits them, and exports a themeable icon library:
`svg/` · `sprite/` · `html/` (base CSS, optional mask CSS, searchable `index.html` test page) · `angular/` (17.1+) ·
`angular-classic/` (14+) · `icons.json` · `AGENTS.md` · `FIX-PLAN.md`.

**Read-only:** the plugin never creates, edits, renames or deletes nodes. It only reads, exports SVG, and (for *Locate*)
changes your selection/viewport. `networkAccess` is `none`.

## Run it
```bash
cd plugin
npm install
npm run build        # typecheck + build → build/main.js, build/ui.js, manifest.json
npm test             # core unit tests (naming, SVG theming, generators)
npm run watch        # rebuild on change
```
In Figma desktop: **Plugins → Development → Import plugin from manifest…** → select `plugin/manifest.json`.
Change the placeholder `id` in `package.json` (`figma-plugin.id`) before publishing.

## Layout
```
src/main.ts              plugin entry (showUI, settings, typed events)
src/main/scan.ts         adapters: component sets, components, instances, frames, loose layers
src/main/facts.ts        reads paints, variables, strokes, effects, hidden layers, padding (plain data)
src/core/                DOM-free logic: naming, svg theming, audit, grid/tier, generators, zip
src/core/generators/     svg, sprite, css, angular (modern+classic), manifest/AGENTS/FIX-PLAN, test page
src/ui.tsx               Preact UI (@create-figma-plugin/ui), resize handles via useWindowResize
test/                    vitest (happy-dom) + generic SVG fixtures
```
Docs: `../docs/` (decisions, structures, heuristics, team review, identity brief, verification checklist). `../docs/archive/` is the superseded first plan.

## What's in this build
- Scan scope: selection / page / whole document; "only icons in use" mode (instances, linked-library aware, with usage counts and override summary).
- Override alerts: per export type (SVG / sprite / HTML / mask / Angular), see `src/core/overrides.ts`.
- Categories from layer-name path, section, parent frame or page; grouped view, filter, optional split of the export.
- Export overview (formats, files, size) above the Export button; (i) info popovers on complex options.
- One scan finds icons **and** structural problems (detached, loose, not components, layer names, duplicates). Problems with an automatic fix show previews in **Issues**; applying them (Labs) is the only thing that can edit your file: see `../docs/HEURISTICS.md`.
- Export is one review screen (formats, options, version/identity, ZIP or project sync) and every ZIP contains a developer `README.md`.

## Labs (opt-in, Settings → Labs)
- **Fixes** (Issues → Review & apply): needs Labs enabled and the branch/copy acknowledgement; dry-run report always available.
- **Composite frames**: treat frames made of instances as icons.
- **Project sync**: `node tools/icon-sync.mjs --dir <project> [--git] [--allow-push]` prints a URL + token; paste them in Settings. Only writes inside that folder, only deletes files it created, dry-run diff first. Tests: `node --test tools/icon-sync.test.mjs`.
- **Identity & version**: load the previous `icons.json` in the export overview to get renames as deprecated aliases, a changelog and a version suggestion. See `../docs/IDENTITY.md`.

## Other new settings
- **Token naming**: path (default), collection + path, custom mapping table, or none; prefix; drop leading parts; live preview.
- **Strokes**: constant weight (default), weight-by-size table (e.g. `16:1.5, 24:2, 32:2, 64:3`), or scale; "convert strokes to paths" globally or per icon (uses Figma's `strokeGeometry`, nothing is cloned or edited).
- **Team config**: export/import `toolkit.config.json` (also bundled in every export).
- **Dev Mode / VS Code**: Dev Mode → Code generates snippets (Angular, HTML sprite, React, CSS variables) for a selected icon instance, or lists the icons used in a selected frame. It reads the library config published in the file (Settings → Team config → Publish, Labs), with native preferences for sprite path, units, accessibility and tokens. The manifest declares `editorType: ["figma","dev"]`, `capabilities: ["codegen","vscode"]`, `codegenLanguages`, `codegenPreferences` and `devAllowedDomains`. **If Figma rejects the manifest**, remove `codegenPreferences` first, then `vscode`, then the rest, from `package.json` → `figma-plugin`. See `../docs/DECISIONS-v4.md`.
- **React** export format (off by default).

## Known gaps in this first build
- **Not yet run inside Figma.** Verified: typecheck, production build, 19 unit tests, generated Angular compiles with
  `ngc` (Angular 19 modern, Angular 14 classic), generated test page works in a browser. Unverified: everything that needs the live Figma API (see below).
- Spike checks still to do in Figma: `exportAsync` SVG for inside/outside strokes, masks and rotated children;
  `boundVariables` → variable-name matching (matching is by resolved hex, so two variables with the same hex are ambiguous);
  `var()` in SVG presentation attributes across Safari/Firefox; instances of remote library components.
- The health scan and fixes (`src/main/health.ts`) have never run against real Figma data: signature matching, `detachedInfo`, `importComponentByKeyAsync`, replace-with-instance placement and colour carry-over all need a real test file. Try them first on a duplicate of your file.
- Remote library components may not be exportable/readable; the plugin then falls back to the instance and says so.
- Open verification items V1–V15: `../docs/verification.md`. Nothing in Labs or Dev Mode has run in Figma yet.
- Not implemented yet: Triage mode, placeholder names for auto-named layers (they are only warned), per-file shared
  settings, list virtualisation (the list is paged by 200), pixel-diff round-trip tests, Fix *mode* (the Fix Plan is a report only).
- Icon variants rely on component-set children; `variantProps` come from the variant name (`Style=Filled, Size=24`).
