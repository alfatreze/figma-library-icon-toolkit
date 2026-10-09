# Decisions v3 (answers to the team review) and implementation status

| # | Decision | Status |
|---|---|---|
| 1 | **Fixes behind Labs first.** Dry-run report always available; Apply needs *Labs enabled* + "I'm working in a branch/copy" acknowledgement; one undo step | Implemented |
| 2 | **Composite frames** (frames of instances): default = not icons (shown under Skipped with the reason); Labs toggle to treat them as icons | Implemented, needs V13 |
| 3 | **Identity = component key** with deprecated aliases, changelog and version suggestion; made explicit in `IDENTITY.md` and an in-plugin explainer; you decide after trying | Implemented (Labs), decision pending |
| 4 | **Constant stroke weight** by default; **weight-by-size table** (e.g. 2px at 32, 3px at 64); **scale** option; **convert strokes to paths** on export (global + per icon) | Implemented, needs V11, V12 |
| 5 | **All kinds of developers:** Dev Mode snippet generator (HTML sprite / Angular / CSS variables from an icon instance); test page for code-first devs; Code Connect later | Codegen implemented, needs V9, V10; Code Connect not started |
| 6 | **Local-first project workflow:** companion `tools/icon-sync.mjs` writes into a project folder, optional git commit/branch, push only with `--allow-push`; dry-run diff before writing; managed-file tracking | Implemented, needs V14 |
| 7 | **Token naming in the tool** with defaults and explained approaches: path (default), collection + path, custom mapping table, none; prefix and "drop leading parts"; live preview | Implemented, needs V15 |

Also done in this round: SVG sanitiser (allowlist), `toolkit.config.json` import/export (also bundled in every export), stale docs archived, git repo initialised, CI workflow.

## Still open (see `TEAM-REVIEW.md` §7)
Leaf-order variable matching (instead of hex), per-icon tree-shakable Angular exports + lazy category providers, npm package scaffold, Code Connect generation, health-scan hardening after V5–V7, duplicate-name policy, Figma-API mock harness for `main/` unit tests.
