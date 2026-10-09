# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the major version is `0` (initial development) minor versions may contain breaking changes; they are called out under **Changed** or **Removed**.

## [Unreleased]

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
