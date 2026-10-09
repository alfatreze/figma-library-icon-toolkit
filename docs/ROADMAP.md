# Roadmap (from v0.5.0)

> The "polish and confidence" milestone shipped as **v0.5.0** (new features make a minor release, see `RELEASING.md`), so the designer workflow milestone below is now **v0.6** and the developer experience milestone **v0.7**.

Principles that decide what goes in and what stays out:
1. **Read-only by default.** Anything that edits a Figma file stays in Labs, previewed and undoable.
2. **Output developers trust.** Generated code compiles, renders and is covered by tests before it is a feature.
3. **One fact, one place; stable layout.** New UI follows `docs/UX-REVIEW.md`.
4. **Nothing leaves the machine** except what the user sends to their own local helper.

## Gate 0: prove it in Figma (before any new feature)
Everything since v0.1.0 is tested in code and in a browser harness, **not inside Figma**. Until the checklist in `docs/verification.md` (V1-V31) has results, new features add risk instead of value.

| Item | Why it comes first |
|---|---|
| Run V10, V14, V16-V18, V21-V31 on a real library; record results | Decides whether Dev Mode codegen, the inspect panel, shared config, baselines and project sync work at all |
| Fix whatever breaks (manifest keys, `inspect`, dynamic-page access, performance on 5k+ icons) | Likely a few patch releases |
| Community submission: cover image, description, review of `devAllowedDomains` and the `inspect` capability | The listing text is drafted; the manifest questions need an answer from Figma's review |
| Collect 3 to 5 real libraries as private fixtures (never committed) | Real files find bugs fixtures do not |

## Done: v0.5.0 "polish and confidence"
| Feature | Value | Size |
|---|---|---|
| ~~Auto-contrast preview tile~~ done | Fixes a real legibility gap | S |
| ~~Plural helper, dark-mode contrast pass, hints instead of tooltips~~ done | Finishes the UX review | S |
| ~~`useFixes`, panel split, tests for `diagnose.ts`, `facts.ts`, `codegen.ts`~~ done | Maintainability; these are the most Figma-API-sensitive files | M |
| ~~Pin GitHub Actions by SHA, release provenance attestation~~ done (attestation untested until a release) | Supply-chain hygiene from the audit | S |
| ~~Fix hardening~~ done (unreleased, not yet run in Figma): prototype links from other layers are repointed to the new instance (all or nothing), colour-variable bindings are kept on carried fills, a show/hide component property is carried. Not covered: reactions pointing at a node inside the replaced layer, converting a plain frame (the API's new id behaviour is unverified) | The remaining ways a fix can lose design intent | M |
| ~~Merge the Angular modern / classic templates~~ done (snapshot-pinned) | Removes copy-paste before more targets are added | M |

## Next: v0.6 "designer and system-manager workflow" (about 4 to 6 weeks)
| Feature | Value | Size |
|---|---|---|
| **Icon detail panel** (replaces the inline expander): all sizes, colour slots, usage and overrides, findings, history | One place to understand an icon | M |
| ~~**Library health report**~~ done (unreleased, not yet run in Figma): Issues → Report… previews the summary and downloads a self-contained HTML page (light/dark, printable), Markdown, or the per-icon fix plan: verdict, ready %, coverage (components, descriptions, bound colours), the 8 areas, changes since the baseline, most common issues, blocked icons | Lets a system manager show progress without opening Figma | M |
| **Unused-icons report**: icons never placed as instances in the scanned files | Pruning decisions backed by data | M |
| **Bulk rename with preview** and a naming-pattern check (kebab-case, verb-noun, category prefix) | The most common cleanup job; Labs for writes, report-only otherwise | M |
| ~~**Descriptions and tags helper**~~ done (unreleased, not yet run in Figma): Issues → Descriptions… downloads a CSV template (only without a description, or all), reads the filled one back, shows what would change with the parsed tags, and writes in Labs (checked in the main thread too, skips descriptions changed since the scan, one undo step) | Feeds the searchable preview page and AI guide | S |
| Variable mapping by collection and mode (Light/Dark) with a visual table | Today it is per-variable lines and wildcards | M |
| Dark/light preview of themeable colours in the detail panel and the HTML preview | Shows what developers will get | S |

## Next: v0.7 "developer experience" (about 4 to 6 weeks, can overlap)
| Feature | Value | Size |
|---|---|---|
| **npm-ready package**: `package.json`, ESM + types, `sideEffects: false`, README, optional Storybook stories | Turns the ZIP into something you can publish as is | M |
| **Vue and Svelte targets** (registry makes each target a small addition) | Widest remaining audiences | M each |
| Code Connect with component properties (size, colour) instead of a static element | Better nested code in Dev Mode and for the Figma MCP server | M |
| PNG export at chosen sizes and a favicon-style set | Requested whenever a team needs raster fallbacks | S |
| Richer AI guide (`AGENTS.md`): task recipes, "how to add an icon", naming rules from your config | Makes assistants correct without hand-holding | S |
| Inspect panel: "is this icon in your repo?" using the local helper; per-icon changelog badge | Closes the design-to-code loop in Dev Mode | M |

## Later: v1.0 "keep design and code in sync" (needs design work)
| Idea | Notes | Size |
|---|---|---|
| **Drift check in CI**: a small CLI/GitHub Action that compares the repo's `icons.json` with the Figma file (REST API, token supplied by the team) and fails or comments on a PR | Needs a Figma token and a headless path; the plugin alone cannot run in CI | L |
| **Self-hosted GitLab, GitHub Enterprise, Bitbucket, Azure DevOps** | The manifest must list every host in advance, so each needs either a fixed domain or a way for Figma to allow a team-specific one | M each |
| Publish from a Figma Make or CI context | Needs a headless path (see drift check) | L |
| Visual regression between releases (render old and new, diff) | Builds on the existing render test | M |
| Several libraries in one export (brand + product sets) with namespaces | Needs an identity and versioning model across files | L |
| Interface translations | After the plural helper and a string catalogue | M |

## Explicitly not planned
- **Icon fonts.** They cannot carry multi-colour icons or live stroke width and are a maintenance burden.
- **Hosted service or telemetry.** Conflicts with "nothing leaves the machine".
- **Auto-fixing without preview** or editing files in view-only/Dev Mode.

## How to prioritise as feedback arrives
Score each candidate: **impact** (how many teams hit it) × **confidence** (verified in Figma?) ÷ **size**. Bug reports from real libraries outrank new features. Anything that touches the file or the network needs an explicit Labs switch and a line in `docs/DECISIONS-*.md`.

## Decisions needed from you
1. **Audience for the first Community release:** design-system teams (favours v0.5 features) or developers (favours v0.6)?
2. **Org or Enterprise plan available?** Code Connect and any CI-side Figma API work depend on it.
3. **CI drift check:** is a CLI/GitHub Action in scope, given it needs a Figma token on the team's side?
4. **Which frameworks do your developers use?** Decides Vue vs Svelte vs another target first.
5. **Licensing and support stance** for the Community listing (free, MIT, best-effort support).
