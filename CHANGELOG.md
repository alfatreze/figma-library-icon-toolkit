# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

While the major version is `0` (initial development) minor versions may contain breaking changes; they are called out under **Changed** or **Removed**.

## [Unreleased]

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

[Unreleased]: https://github.com/alfatreze/figma-library-icon-toolkit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/alfatreze/figma-library-icon-toolkit/releases/tag/v0.1.0
