# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the major version is `0` (initial development) minor versions may contain breaking changes; they are called out under **Changed** or **Removed**.

## [Unreleased]
### Added
- **Library health report** (Issues → *Report…*): a preview of the summary and a download as one self-contained HTML page (no scripts or external files, light and dark, printable) or Markdown. It shows the verdict, the share of icons that are ready, coverage (components, descriptions, colours bound to variables), the eight areas with their status, the changes since the baseline (and whether they are breaking), the most common issues with how many can be fixed automatically, and the icons that block the export. The per-icon fix plan moved into the same dialog.
- **Descriptions and tags helper** (Issues → *Descriptions…*): download a CSV template of the components without a description (or all), fill in comma-separated search words, load it back, review what would change with the tags it produces, and write the descriptions (Labs, one undo step). An empty cell never clears a description; a description changed in the file since the scan is left alone; spreadsheet formulas in the CSV are neutralised.

## [0.5.0] - 2026-10-10
First release verified in Figma (scan, baseline, export, Dev Mode codegen and the inspect panel were run on a 410-icon library; publishing to a real repository, Labs fixes and shared config are still unverified).

### Added
- **Packages and Output tabs** in Settings: *Packages* is what is generated (formats, name prefix, split by category), *Output* is where it goes.
- **Several publish outputs.** Each output is a repository, a folder and the packages it receives (all that are on, or a chosen subset). Outputs on one repository are published together as one branch, one commit and one pull / merge request; different repositories get their own. One access token per host. Publish is blocked when a folder is missing, unsafe or overlaps another output of the same repository, or a token is missing. Choose which output is the *changed since* baseline. An Angular-only output keeps the sprite loader when another output ships the sprite file.
- **Import path** setting (Settings → Packages): where the Angular and React snippets import from in Dev Mode and the Inspect panel (default `./icons`); part of the team config. The HTML snippet now says to load the base CSS.
- **Partial exports.** A ZIP made from the Dev Mode selection carries `partial: true` in `icons.json` and a README banner, and is refused as a *changed since* baseline.
- **Theme-contrast audit rule** for fixed colours (secondary colours, gradients) below 3:1 on a light or dark page; an automatic dark tile for white icons in the previews.
- **Fix hardening** for *replace with instance*: prototype links from other layers are repointed to the new instance (all or nothing), colour-variable bindings are kept on carried colours, a show/hide component property is carried.
- Hints (keyboard reachable) instead of tooltips, `tabpanel` / `aria-controls` on every tab, release provenance attestation for the zip.

### Changed
- Settings version 3: the single repository of 0.4 becomes one output named *Icon library*, and its token becomes the token of its host. Migration is automatic. Outputs and tokens stay on this computer (never in the team config, exports or diagnostics).
- The window is resized from the pointer's absolute position (the method of Figma's own example), so expanding follows the cursor.
- The generated Angular, React and Web Component output is unchanged (pinned by snapshot tests); internally the two Angular flavours now share their templates.

### Fixed
- A bare `group` or `star` layer name was treated as a Figma default name and blocked the icon.
- Applying fixes never reported its result: the confirmation stayed on "applying" (the UI listeners for fix results were lost in an earlier refactor).
- Warning pills, counts and badges were unreadable in dark mode (2.2:1); a new test measures every colour pair in the stylesheet.
- A new Output card showed errors before anything was entered; a namespace typed as `gitl:` was kept raw in the exported config.
- The copy buttons in the Dev Mode panel overflowed; footer hints were cut off by the window edge.

## [0.4.0] - 2026-10-09
### Added
- **Publish to a repository, self-contained.** Settings → Output → *Publish to a repository* (host, repository, folder, optional branch, access token) and Export → *Publish to repository…*. The plugin compares the export with the repository's default branch, shows what would be added, changed or removed, then creates a new branch, commits everything as one change and opens a **pull request (GitHub)** or **merge request (GitLab)** with a generated title and description (added, renamed, removed and changed icons, breaking-change note, version, changelog, formats, remaining warnings). Only files this tool published before (`<folder>/.icon-toolkit.json`) are ever deleted; the default branch is never changed; large exports are uploaded in several requests. If only the pull / merge request fails, the branch is kept and you get a link to open it by hand.
- The token is the user's own (GitHub fine-grained: Contents and Pull requests; GitLab: `api` scope), stored on this computer only (never in the team config, exports or diagnostics) and sent only to api.github.com or gitlab.com. The plugin makes network requests only when you press Test connection or Publish.
- *Read from the repository* in Export → Version: reads `<folder>/icons.json` from the default branch as the change baseline.

### Removed
- The local helper (`tools/icon-sync.mjs`) and Labs → Project sync. Publishing no longer needs anything installed outside Figma. Self-hosted GitLab and other git hosts are not supported yet because the manifest must list every domain in advance.

### Changed
- `networkAccess` in the manifest: api.github.com and gitlab.com (was: none, plus localhost for development).

## [0.3.1] - 2026-10-09

### Fixed
- Dropdown menus in Settings (and other dialogs) opened behind the dialog and looked broken. Menus now sit above every dialog.

## [0.3.0] - 2026-10-09
### Changed (UI redesign, see docs/UX-REVIEW.md)
- One stable window layout: scan bar, fixed-height status row, tabs, toolbar and a sticky Export bar are always in the same place; first run, scanning and results change only the content area (controls are disabled, not hidden).
- Settings is five tabs (Output, Style, Scan, Team, Labs) with the export formats first, as cards with real file counts and sizes; the Export dialog uses the same cards.
- Larger icon previews (32 px icons in 52 px tiles), an S / M / L size control, a grid view with 48 px icons, and a hover / focus preview with a 16 / 24 / 32 px ladder and a white / dark / checker background switch.
- Clearer active states (tabs, chips, segmented controls, selected rows and tiles, format cards), a 4-point spacing scale and 32 px controls.
- Each fact is shown once: the icon count lives on the Icons tab; the footer button says "Export" (or "Export N selected"); plain-language labels and shorter messages; the Issues tab is one summary line plus cards with "How to fix".
- "Only icons used in designs" moved from the main screen to Settings → Scan.

### Changed
- The plugin id is now the one issued by Figma (`1690450989422884632`). Settings and baselines saved under the old development id are not carried over: re-publish the team config and export once.

### Fixed
- The UI bundle contained 12 copies of the stylesheet (one per component that imported it); it is now bundled once (653 KB to 328 KB, from 472 KB before).


## [0.2.1] - 2026-10-09

### Security
- Settings are validated against one schema (enums, ranges, lengths) wherever they enter: imported config, config published in a file, saved settings. A hostile config can no longer put text into generated code; generators also normalise the stroke policy.
- The SVG sanitiser is now an allow-list (elements, attributes, URL values); comments, CDATA and text nodes are removed; fix previews are sanitised too; `viewBox` is validated; snippets escape labels and colours.
- Data read from the file or the repo (`icons.json`, baselines, shared config) is validated; baselines are size-limited and inflated with a cap.
- The main thread re-validates every message from the UI (dev-resource links must be `https`, baseline size and target, fix requests).
- Companion: the target must be a real subfolder (not the root, no dot-folders), only plain asset file types are written, symlinks are refused, deletions are limited to generated paths, 20 MB body limit, Host check (DNS rebinding), `git check-ref-format` for branches, `ICON_SYNC_TOKEN` environment variable.
- CI: read-only token, scoped release permissions, lockfiles for pinned toolchains, release checksum.

### Fixed
- One unreadable layer no longer aborts a scan (it becomes a blocked row); cancel and re-scan behave; documents are read page by page; instances of component-set variants are not listed twice; layers inside instances are not offered for conversion; icon instances inside components are counted in usage mode.
- Replace-with-instance carries stroke colours; leaf renames happen only after a successful conversion; stale rename plans are skipped; fixes cannot run during a scan.
- Duplicate detection includes stroke weight/cap/join and uses a 64-bit hash; the geometry hash covers circles, rects, lines, stroke weight and transforms; changelog matching is order independent and keeps rename chains.
- Common names such as `delete` or `import` are no longer rejected; very long names are; `Ł đ ı` fold to ASCII; numbering no longer depends on the user's locale.
- Stroke outlining refuses text, opacity, blend, effects and mixed paints, and uses render bounds for loose vectors.
- Codegen always answers within its time limit; settings are saved when the plugin closes right after a change.

### Changed
- Types are split into `types/{settings,domain,fixes,messages}.ts` with one typed message map; the UI is split into hooks (`useScan`, `useBaselines`, `useSync`) and pure selectors; export targets are a registry.
- Processing is cached per icon and only re-runs for settings that affect it; scan batches are throttled.
- Dialogs trap focus, close on Esc and restore focus; tabs support arrow keys; scan status is announced to screen readers.
- Settings → Copy diagnostics copies a short report (no layer content, token hidden).

## [0.2.0] - 2026-10-09
### Added
- **Change detection baseline** (layered): the previous export is remembered on this computer automatically; optionally saved *in the Figma file* (Labs) so the team and Dev Mode share it; or read from the project's `icons.json` through the companion (`GET /catalog`). Priority repo > shared > local > loaded file. Icons list gets filter chips (new, renamed, drawing, colour, moved, layer name).
- **Variable matching by paint order** instead of colour value: two variables that resolve to the same hex stay separate colour slots, and an unbound paint no longer inherits a variable from a same-coloured one. Token mapping table supports `Collection::name`, wildcards (`color/icon/* = --icon-*`) and **Fill from scan**.
- **Angular / React**: one file per icon (`icons/<name>.ts`, tree-shakable), `[icon]` input / `icon` prop, icon registry with `provideXIcons(...)`, lazy per-category chunks for icons used by name, `provideXAllIcons()`; Angular **sprite strategy** (`<x-sprite-icon>`, `provideXSprite({ url, inline })`).
- **Web Component** export (framework-free custom element + typings) and a `webcomponent` codegen language.
- **Dev Mode**: inspect panel (icons in the selection, copy code, SVG, ZIP of just those icons) using the config published in the file; Labs **dev resources** links on icon components; **Code Connect** templates (HTML parser).
- **Duplicate-name policy** (block / prefix with category / number) and **aliases for intentional duplicates** (`aliasOf` in `icons.json`, shared markup in sprite, Angular/React data and Web Component).
- Tests: mock-based tests for `src/main/*`; CI compiles the generated code with real toolchains (Angular 14 / 17.1 / latest, React 18), renders it in Chromium (pixel diff + theming) and enforces size budgets (`scripts/compile-check.mjs`, `e2e/`, `scripts/size-budget.mjs`).

### Changed
- Angular and React components resolve `name` through a registry: icons not registered load their category lazily (first paint is empty). Use `[icon]`/`icon` or `provideXAllIcons()` for synchronous rendering. `icons.ts` still exports every icon; `index.ts` no longer re-exports it.
- Fixes: replace-with-instance keeps the layer name, visibility, lock, blend, export settings and prototype reactions, respects auto-layout (no transform, HUG→FIXED, absolute children stay absolute) and rolls back fully on failure; wrap-and-convert restores the layer if it fails.

### Fixed
- Sprite files contained a valueless attribute (`data-x-sprite`), which is not well-formed XML: an external `<use href="sprite.svg#id">` rendered nothing. Found by the new render test.

## [0.1.0] - 2026-10-09

First public release.

### Added
- **Scan** icons by selection, page or whole document; detect components, component sets, instances and frames; optional "only icons in use" mode with usage counts and override summary.
- **Audit** with ~30 rules, strictness profiles, an Issues tab with per-type overview, suggested fixes and locate-on-canvas.
- **Problem detection with previewed fixes (Labs):** detached icons, loose icons, frames that are not components, override-unsafe layer names, duplicate artwork. Applying fixes edits the file only after review, as one undo step.
- **Export** to SVG, SVG sprite, HTML (CSS + searchable preview page), CSS mask classes, Angular 17.1+ and 14+ components, React component, `icons.json` manifest, `AGENTS.md`, `CHANGELOG.md`, `FIX-PLAN.md`, `toolkit.config.json` and a developer `README.md`.
- **Themeable colours** as CSS variables with design-token fallbacks (configurable naming), constant / by-size / scaling stroke weight, optional stroke-to-path conversion.
- **Categories** from layer-name path, section, frame or page; optional split of the export by category.
- **Identity and versions:** compare with a previous `icons.json` (component key identity), deprecated aliases for renamed icons, suggested semantic version and changelog.
- **Dev Mode / Figma for VS Code** code generation (Angular, HTML sprite, React, CSS variables) with a library config published in the file.
- **Project sync (Labs):** local companion `tools/icon-sync.mjs` writes into a project folder and can commit with git.
- Resizable window, info popovers for complex options, team config import/export.

[Unreleased]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/alfatreze/figma-library-icon-toolkit/releases/tag/v0.1.0
