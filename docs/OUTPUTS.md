# Packages and outputs

**Packages** (Settings → Packages) are *what* is generated: the formats (SVG, sprite, HTML, mask, Angular, React, Web Component, Code Connect), the name prefix and the category split.
**Output** (Settings → Output) is *where* it goes: a local ZIP, or a branch and pull / merge request in one repository.

## How teams set up heterogeneous exports
| Setup | Shape | Notes |
|---|---|---|
| One package, one repo | everything under `icons/` | Most common for small teams. Fully supported today. |
| Monorepo, one folder per package | `packages/icons-svg`, `packages/icons-angular`, `packages/icons-react`, one repo, one PR | The usual heterogeneous setup: one source of truth, one review, one version. Needs a folder per package (not yet supported). |
| Several repos | assets repo plus one repo per framework package | Rare and costly: several PRs per release, version drift between packages, a shared sprite path that breaks across repos. Mostly seen where packages are published to different registries by different teams. |
| Code Connect in the app repo | `.figma.ts` files next to components | Code Connect belongs to the consuming app, not the icon package, and is published with the Code Connect CLI. |
| Local ZIP | hand-off, one-offs, designers without repo access | Supported. |

## Decision
Do not model "a repo per package type". Model **outputs**: a named destination with the set of packages it receives (ZIP, or host + repository + folder + branch). The default is one output that receives everything, so today's setup is unchanged. A monorepo is several outputs on the same repository with different folders; separate repos are outputs with one package each.

Things an outputs model must handle:
- Shared files (`icons.json`, `README.md`, `toolkit.config.json`, changelog) go to every output or only to a primary one. The repository baseline reads `icons.json`, so one output is marked as the baseline.
- The tool only replaces or removes files it published before (managed file per folder), which already works per folder.
- One access token per git host, not per output. Outputs on the same repository should share one branch name so the changes arrive as one pull request.
- The sprite strategy in Angular / React points at a sprite file; split across repos it needs a configured path.
- Publishing, the dry-run plan and the pull request text currently assume one destination.

## Status (built, not yet run in Figma)
- `Settings.outputs` is a list of repository outputs: name, host, repository, folder, branch and the packages it receives (`null` = every package that is on). `Settings.tokens` holds one token per host. Both are local to this computer, never in the team config. Settings version 3 migrates the old single `repo` into one output and a token.
- Every output also receives `icons.json`, the README, the config and the changelog, so each folder describes itself. The baseline "Read from the repository" uses the first output that is ready.
- Outputs on the same repository are planned per folder and published as one branch, one commit and one pull / merge request (`core/outputs.ts`: `groupOutputs`, `mergePlans`). Different repositories get their own branch and request.
- Validation blocks Publish when a folder is missing or unsafe, two folders of one repository overlap, a host has no token, or no package is selected.
- The local ZIP always has every package; it is not an output.
- Baseline: with two or more outputs, Settings → Output has a "Baseline" choice (`baselineOutput`); empty or unknown falls back to the first output that is ready.
- Sprite across repositories: the Angular sprite strategy reads the sprite URL at runtime (`provide…Sprite({ url })`), so it needs no path to another repository. An Angular output without the sprite package still gets the strategy when the sprite package is on in Packages (`BuildInput.spriteStrategy`).
- Not done: per-output PR text for one shared request.
