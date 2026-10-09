# Figma Library Icon Toolkit

A Figma plugin that scans an icon library, audits it, finds (and optionally fixes) structural problems, and exports a **themeable icon package** for developers: SVG, sprite, HTML preview, Angular, React, a machine-readable manifest and a ready-to-use README.

- **Scan** a selection, page or whole file; or only the icons actually **in use** (library-aware), with override alerts.
- **Audit and fix:** naming, grid, strokes, effects, detached or loose icons, layer names that break overrides. Fixes are previewed and only applied after you confirm (Labs).
- **Export:** themeable colours via CSS variables (with design-token fallbacks), constant or size-based stroke weight, categories, versioned `icons.json`, changelog and deprecated aliases for renamed icons.
- **Developers:** Dev Mode / Figma for VS Code snippets, a searchable preview page, and **Publish to a repository**: create a branch with the export and open a pull request (GitHub) or merge request (GitLab) straight from the plugin.

The plugin never edits your Figma file unless you enable Labs and confirm a fix. Network access is used only when you press **Test connection** or **Publish** in Settings / Export: the plugin then talks to api.github.com or gitlab.com with your own access token (kept on your computer). Nothing else leaves your machine.

## Install (from source)
```bash
git clone https://github.com/alfatreze/figma-library-icon-toolkit.git
cd figma-library-icon-toolkit/plugin
npm ci
npm run build
```
In Figma: **Plugins → Development → Import plugin from manifest…** → `plugin/manifest.json`.
Or download a zip from [Releases](https://github.com/alfatreze/figma-library-icon-toolkit/releases) and import its `manifest.json`.

## Repository
| Path | Contents |
|---|---|
| `plugin/` | the Figma plugin (TypeScript, Preact) |
| `docs/` | decisions, heuristics, Dev Mode proposals, release process, verification checklist |
| `scripts/` | maintenance scripts (third-party notices) |

## Status
`0.x`: initial development. Parts of the plugin (Labs, Dev Mode) have not been verified on many files yet: see [docs/verification.md](docs/verification.md). Releases follow [Semantic Versioning](https://semver.org); see [CHANGELOG.md](CHANGELOG.md) and [docs/RELEASING.md](docs/RELEASING.md).

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md).

## License and acknowledgements
[MIT](LICENSE) © 2026 Abel Santos.

Built with [create-figma-plugin](https://github.com/yuanqing/create-figma-plugin) (MIT), [Preact](https://preactjs.com) (MIT) and [fflate](https://github.com/101arrowz/fflate) (MIT); the settings cog icon is from [Feather](https://github.com/feathericons/feather) (MIT). Designed following the spec-driven method of [figma-plugin-forge](https://github.com/sallzzbr/figma-plugin-forge) (MIT; no code copied). Full licence texts and details: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
