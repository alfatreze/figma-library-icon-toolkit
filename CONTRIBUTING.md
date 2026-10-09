# Contributing

## Setup
```bash
cd plugin
npm ci
npm test          # unit tests
npm run build     # typecheck + build (creates plugin/manifest.json and plugin/build/)
```
Import `plugin/manifest.json` in Figma (Plugins → Development → Import plugin from manifest…).

## Commits and versions
- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. A breaking change is marked `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer.
- [Semantic Versioning](https://semver.org/): `fix` → patch, `feat` → minor, breaking → major (while `0.x`, breaking changes bump the minor). See [docs/RELEASING.md](docs/RELEASING.md).
- Update `CHANGELOG.md` under `[Unreleased]` in every user-facing pull request.

## Rules of the road
- The plugin must not edit a Figma file unless the user opts in (Labs) and confirms. Keep that boundary.
- Core logic (`plugin/src/core/`) stays DOM-free where possible and unit-tested; generated code must compile (see `docs/verification.md`).
- Dependencies: only add MIT/BSD/Apache-compatible packages and run `node scripts/generate-notices.mjs` so `THIRD_PARTY_NOTICES.md` stays complete.
- Do not commit proprietary icons or design files: use generic fixtures.
