# Releasing (Semantic Versioning)

Versions are `MAJOR.MINOR.PATCH` ([semver.org](https://semver.org/spec/v2.0.0.html)); tags are `vMAJOR.MINOR.PATCH`.
The single source of truth is `plugin/package.json`; the tag must match it (CI enforces this).

| Change | Bump | Examples |
|---|---|---|
| Bug fix, copy or doc fix, internal refactor | **patch** `0.1.0 → 0.1.1` | wrong override note, layout glitch |
| New feature, new setting, new export format, new rule | **minor** `0.1.0 → 0.2.0` | Web Component export |
| Breaking change | **major** (while `0.x`: bump **minor**) | renamed CSS variables, changed `icons.json` schema, removed setting, changed generated file layout |

What counts as the public API: the **generated output** (file names, CSS variable names, component inputs, `icons.json` fields, `toolkit.config.json` keys), the **settings** in saved configs, and the repository layout written by *Publish to a repository* (`<folder>/.icon-toolkit.json`). Anything there that changes incompatibly is breaking.

## Steps
1. Make sure `main` is green (`npm test`, `npm run build`).
2. Move the `[Unreleased]` notes in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` heading and update the compare links at the bottom.
3. Bump the version without tagging yet:
   ```bash
   cd plugin && npm version <patch|minor|major> --no-git-tag-version
   ```
4. Commit and tag:
   ```bash
   git add -A && git commit -m "chore(release): vX.Y.Z"
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main --follow-tags
   ```
5. The **Release** workflow verifies tag = `package.json` version, runs the tests, builds, and publishes a GitHub Release with `figma-library-icon-toolkit-vX.Y.Z.zip` (the files Figma needs: `manifest.json` + `build/`) and the notes from `CHANGELOG.md`.

## Installing a release
Download the zip, unzip it, and in Figma use **Plugins → Development → Import plugin from manifest…** and choose `manifest.json`.

## Pre-releases
Use `X.Y.Z-rc.1` tags for release candidates; the workflow marks them as pre-releases.

## Community publishing (later)
The plugin id in `plugin/package.json` (`figma-plugin.id`) is the id Figma issued (`1690450989422884632`); the old placeholder was `icon-library-toolkit-dev`. Still to do: review the `networkAccess` entry (api.github.com and gitlab.com, used only by *Publish to a repository*), review the `inspect` capability, and follow Figma's plugin review guidelines.

**Changing the id resets stored data.** Settings and baselines (`clientStorage`) and anything written into files with plugin data (published team config, shared baseline) belong to a plugin id. Copies saved under the old id are not read by the new one: re-publish the team config and export once to recreate the baselines.
