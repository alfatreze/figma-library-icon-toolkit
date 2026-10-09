# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the major version is `0` (initial development) minor versions may contain breaking changes; they are called out under **Changed** or **Removed**.

## [Unreleased]

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

[Unreleased]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/alfatreze/figma-library-icon-toolkit/releases/tag/v0.1.0
