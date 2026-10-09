# Team review: scope, plan, roadmap, code, workflow and handoff

Reviewers: design-systems engineer (Figma) and senior frontend engineer.
Basis: the current code (`plugin/`, ~5.4k lines, 34 unit tests), the real export you ran, and DECISIONS/STRUCTURES/REVIEW/HEURISTICS docs.
Evidence tags: **[verified]** I checked it in code or output · **[measured]** I ran it · **[unverified]** reasoned, needs a real test.

---

## 1. Verdict

The product thesis is sound and unusually well matched to a real gap: *one trustworthy bridge from a Figma icon library to code, with an audit that makes the library better over time*. The export core is solid and proven on your real file (names, path structure, variable → token mapping all matched).

Three problems stand out:

1. **Scope grew four-fold in a short time** (exporter → audit → usage scan → categories → health scan with write-fixes) while **verification did not**. The heaviest, riskiest code (`main/health.ts`, usage/override capture, document scope) has never touched real Figma data.
2. **The plan documents no longer describe the product.** `PLAN.md` still specifies the FontAwesome tuple, SVGO and flatten (dropped); there is no single backlog, no release criteria, no git history. [verified: project is not a git repo; PLAN.md has 11 stale mentions]
3. **Handoff stops at a ZIP.** The people who consume the library (developers, AI agents) work in the repo, Dev Mode and the Figma MCP, none of which the output currently plugs into.

Recommendation: **freeze features, run a "Trust" release (0.2)**, then invest in **handoff** (0.3), then **scale** (0.4). Details in §7.

---

## 2. Scope and roadmap review

| Area | Assessment | Recommendation |
|---|---|---|
| Core export (SVG, sprite, HTML test page, Angular, manifest) | Strong, differentiated (themeable, structure-preserving, token-aware) | Keep; harden (see §5, §6) |
| Audit + Issues tab | Good UX, rule catalogue is a real asset | Keep; add rule IDs to docs; make severities configurable per team |
| Usage scan + override alerts | High value for product files; **never validated** | Validate on a real product file before building on it |
| Categories | Useful, cheap | Keep; decide *what categories mean for code* (see §6.4) |
| Health scan + fixes | Highest value *and* highest risk (only feature that edits files) | Gate behind "Beta/Labs", ship dry-run first (§4.3) |
| Document scope | Useful, untested at scale | Add limits, progress, cancellation tests on a 5k+ node file |
| Roadmap | Implicit | Replace with the single backlog in §7; define 1.0 exit criteria |
| Process (forge method) | Brainstorm done; design doc/plan files never written | Write `docs/plans/` design doc + plan now, they double as the handoff package |

**Scope guardrails proposed**
- One product promise per release; anything else goes to "Labs".
- No new export format until the existing three have a pixel-diff CI check.
- Every write-to-file capability needs: dry run → preview → confirm → single undo → post-run report.

---

## 3. Open verification matrix (the real "M0")

These were marked *(verify)* since the first review and are still open. They need a Figma test file with one page per case (see STRUCTURES §8). Owner: DS engineer. Run once, record results in `docs/verification.md`.

| # | Question | Why it matters | Test |
|---|---|---|---|
| V1 | `var()` inside SVG **presentation attributes** in Safari, Firefox, Chrome, Edge | The whole themeable-colour approach depends on it. Only Chrome seen. [verified: Chrome only] | Open the generated test page in all four; if any fails, emit `style="fill:var(...)"` instead |
| V2 | `exportAsync` SVG for inside/outside strokes, masks, rotated children | Stroke-width editing and fidelity claims | Fixture icons + pixel diff vs Figma PNG |
| V3 | Variable → path matching when two variables share a hex, aliased variables, multi-mode variables | Matching is **by hex** today; brittle (§4.4) | Fixture with 2 variables same hex; light/dark modes |
| V4 | Can the main component of a **remote** (library) instance be read and exported? | Usage mode exports from it, falls back to the instance | Product file with library instances |
| V5 | `detachedInfo` presence for frames detached from local vs library components | Health scan accuracy | Detach icons in a test file |
| V6 | Replace-with-instance placement inside auto-layout, constraints, rotation, prototype reactions | Fix correctness; risk of visual regressions | Fixture screens, before/after screenshots |
| V7 | `commitUndo` groups all fixes into one undo step | Safety promise in the UI | Apply 5 fixes, press Cmd+Z once |
| V8 | Document scan of 5k–20k nodes: time, memory, cancel latency | Performance claim | Large file, record timings |
| V9 | Editor type: does the plugin run for view-only users / in Dev Mode? | Handoff audience (§6.1) | Open as viewer and in Dev Mode |

---

## 4. Design-systems engineer (Figma) review

### 4.1 Define the **icon anatomy standard** before more tooling
The plugin can detect problems only relative to a standard; today the standard is implicit across audit rules. Publish it as a one-page spec (and make the audit rules reference it):

- Component per icon (or component set with `Style` property: `outline | filled`), name `Category/Name`, ASCII-friendly, no `icon/` prefix redundancy.
- Dedicated square frame at the library grid (e.g. 24), transparent, clip on, whole-pixel positions, one padding rule.
- **One vector layer named `Vector`** (multi-colour: `Vector`, `Vector 2`…). Strokes either deliberately live (centre aligned) or outlined.
- Colour: fills bound to a variable (`icon/default`), secondary via `icon/secondary`; no hex.
- Description = comma-separated aliases (feeds search tags); published to the team library.
- Usage in other components via an **instance-swap property** (not hand-swapped nested instances), which is what preserves overrides across swaps.

### 4.2 Overrides: the standard is the fix
The community behaviour (overrides survive a swap only when layer names match; once overridden, an icon stops inheriting later library changes) means *override reliability is a library-authoring property*. Your health scan already detects names; add:
- Detect **nested icon instances inside components that are hand-swapped** instead of exposed as instance-swap properties (reports "overridden, won't update").
- Report **instances with "reset all changes" available** across the usage scan (that is what the override capture already knows) as a *library adoption* metric.
- Document that renaming layers inside a **published** main component is a library change: publish it and ask consumers to run "Fix instance overrides" if overrides reset. [community source in HEURISTICS.md]

### 4.3 Fixes are a governance event, not a convenience
Writing to a library file changes what every consumer receives. Recommended workflow:
1. Run **Find problems** on the library **in a Figma branch**.
2. Apply fixes there; review the branch diff in Figma.
3. Merge and publish; consumers get a normal library update.
4. Re-run Export on the published library.

Product changes in the plugin:
- **Dry-run report first** (shareable CSV/MD of every proposed change, already partly there via Issues) before the Apply button is even enabled for a scope.
- Disable Apply on **published library components** unless a "I'm working in a branch" checkbox is ticked (cannot be detected reliably, so make it an explicit acknowledgement).
- **Leave a trail**: write `setPluginData` on created components/instances (`fixedBy`, `fixKind`, timestamp) so a later run can list what was changed. [needs your approval: it is a file write]
- Keep `layer name`, reactions and layout sizing on replaced nodes (today the replaced node's name and prototype reactions are lost, V6). [verified in code: `health.ts` copies placement only]

### 4.4 Variables and tokens
- Matching variable → SVG colour **by resolved hex** is the weakest link. [verified: `buildFiles` consumers use `variableByHex`]. Two variables with the same hex collide; aliases (variable → variable) report the leaf alias name; modes change the hex. **Fix:** map by **leaf order** (SVG path order = z-order = `leavesOf()` order, already computed in health scan) as the primary key, hex as fallback; resolve aliases to the *semantic* alias the designer bound.
- The token name transform (`color/neutral/darkest` → `--color-neutral-darkest`) is **hard-coded**. [verified: `tokenFromVariable`]. Make it configurable: CSS variable prefix, case, collection name inclusion, and an explicit mapping table override (`figmaVariable → cssVar`), because your actual token package names will not follow the default.
- Read `figma.variables.getLocalVariableCollectionsAsync()` to export the mapping as `tokens.json` used for the fallback chain, and to alert when a bound variable has **no CSS counterpart** in the configured token list.

### 4.5 Detection and categories
- Frames containing **instances** are counted as vectors (`isIconish` walks into instances). [verified in `main/facts.ts`] A 32×32 "icon slot" frame holding an icon instance would be reported as an icon frame/convert-candidate. Decide: composite icons built from instances are legitimate (keep) or not (stop at instances); expose it as a scan option. **Needs your decision.**
- Categories: prefer **explicit** over inferred. Auto fallback (name → section → frame → page) can yield surprising groups (a page name "Icons" becomes a category). Show the *source* of each category in the UI and let the team lock a source per library.
- Duplicate names currently **block both** icons from export. [verified in `audit.ts`/`process.ts`] Safer default: export the first, flag the second, or auto-suffix (`-2`) with an alert.

### 4.6 Identity and renames (breaking-change management)
Names are the public API of the library. **Renaming in the plugin does not persist** (state is in memory; the "apply name to Figma layer" action exists in `main/health.ts` but is not exposed in the UI). [verified] Two consequences: (1) the next export silently changes names, a breaking change for consumers; (2) designers and developers can disagree about names.

Recommendations:
- Make **`componentKey` the identity**, name the label. Compare each export to the previous `icons.json` (user drops it in) and produce a **changelog**: added / removed / renamed (same key, new name) / artwork changed (hash) with semver suggestion (rename or removal = major).
- Emit `deprecated` / `replacedBy` aliases so a rename ships as an alias for one major version.
- Expose "Apply name to layer" (opt-in write, via the same fix pipeline) so the Figma file stays the single source of truth.

### 4.7 Team settings
Settings live in `clientStorage` (per user, per machine). [verified] Two designers will export different namespaces/profiles. Add **import/export of `toolkit.config.json`** (and write the effective config into every ZIP for reproducibility); later optionally store it in the file's root plugin data (write, so opt-in).

---

## 5. Senior frontend engineer review

### 5.1 Bundle size and tree-shaking (the number that will bite first)
[measured, 700 icons, average fixture icon] Angular `icons.ts` **950 KB** (one object, not tree-shakable), sprite **893 KB**, mask CSS **2.2 MB**, test page **1.1 MB**, SVG folder **922 KB**.

- **Angular data:** generate **one exported constant per icon** (`export const cmnHome: CmnIconData`) plus a registry builder. Support both `name` (registry, convenient) and `[icon]="cmnHome"` (tree-shakable). Add `provideCmnIcons(...)` for lazy per-category chunks. Mark the package `sideEffects: false`.
- **Mask CSS:** at scale this is unusable as a single file. Keep it optional, **warn with the size in the overview** (already shown) and emit **per-category CSS** when "split by category" is on.
- **Sprite:** for large libraries a single 900 KB sprite is too heavy; per-category sprites (implemented) are the right default for apps; add a content hash in the filename for cache busting.
- **Test page:** embeds every icon twice (sprite + data). Fine for internal use; lazy-render rows (virtualise) above ~500 icons.

### 5.2 Angular component
- `[innerHTML]` + `bypassSecurityTrustHtml` re-parses markup per instance. For lists of icons prefer `<svg><use href="#cmn-name"/></svg>` against a **single sprite injected once** (Angular DI service), it is faster, caches, and shares DOM. Offer it as `strategy: 'sprite' | 'inline'`.
- Security hardening (defence in depth): the generator trusts SVG from Figma. Add an **allowlist sanitiser** in `themeSvg` (drop `script`, `foreignObject`, `on*` attributes, external `href`/`url()` references) so a malicious shared file cannot ship active content. Cheap and testable. [unverified exploit; verified absence of sanitiser]
- Trusted Types / CSP: document the policy name required when `bypassSecurityTrustHtml` is used.
- SSR: verify the component renders on the server (innerHTML on domino); add a test.
- Typed `label` input is good; add `title` support and a lint rule/doc for decorative vs meaningful icons.

### 5.3 CSS API (treat as a public contract and version it)
- Variables `--{ns}-icon-size|color|color-N|stroke-width` are the API. Freeze names, document, and add a changelog entry for any change.
- **Stroked icons at other sizes:** a 24px stroke icon shown at 16px scales its stroke to 1.33 px. Offer `vector-effect: non-scaling-stroke` (and `stroke-width` var in px) as an option; designers usually expect weight to stay constant. [unverified preference, verify with the design team]
- **RTL:** directional icons (arrows, chevrons) need mirroring. Add a manifest flag `mirrorInRtl` (from a tag such as `rtl` or name list) and a CSS rule `[dir=rtl] .{ns}-icon--mirror`.
- Wrap base CSS in `@layer` so consumers can override predictably; keep `forced-colors` and `print` rules.
- Cross-browser `var()` in attributes (V1): decide between `fill="var(...)"` and `style="fill:var(...)"` after the browser matrix.

### 5.4 Framework coverage and ordering
Angular-both-flavours is done. Recommended order for the *next* targets, by reach and effort: **Web Component** (framework-agnostic, one file) → **React** → **Vue** → **Iconify JSON** (opens Tailwind/Unplugin ecosystems). Do not add RN/Android/iOS until the web path has CI.

### 5.5 CI for the generator (what "done" means)
Currently core logic is unit-tested (34 tests) and Angular compile was checked by hand once. Make these automatic: [none exist yet]
1. **Compile gate:** `ngc` on generated modern (Angular latest) and classic (Angular 14) output.
2. **Render gate:** Playwright renders the test page and a sample Angular app; pixel-diff vs Figma PNG exports for the fixture set.
3. **Browser matrix** for `var()` themeing (V1).
4. **Size budget** per format at 700/2000 icons.
5. Snapshot of `icons.json` schema + JSON Schema validation.

### 5.6 Code review findings (plugin)
| # | Severity | Finding | Where | Fix |
|---|---|---|---|---|
| C1 | High | No git, no CI, no lint/format config, placeholder plugin id | repo root | `git init`, GitHub Actions (typecheck, test, build, ngc, Playwright), ESLint+Prettier, real plugin id |
| C2 | High | Plugin renames are not persisted; `apply-name` unused in UI | `ui.tsx`, `main/health.ts` | Expose opt-in "apply name"; add changelog/aliases (§4.6) |
| C3 | High | `main/health.ts` and usage code untested against Figma | `main/*` | Verification matrix V4–V8 + a Figma-API **mock fixture harness** (JSON node trees) for `scan`/`health` unit tests |
| C4 | Medium | Frames containing instances treated as vector icons | `main/facts.ts: isIconish` | Option to stop at instances (decision needed) |
| C5 | Medium | Variable↔colour matching by hex | `core/process.ts`, `core/svg.ts` | Leaf-order primary key (§4.4) |
| C6 | Medium | Token transform hard-coded | `core/svg.ts: tokenFromVariable` | Config + mapping table |
| C7 | Medium | Both duplicate names blocked | `core/audit.ts` | Keep first / auto-suffix |
| C8 | Medium | Replace-with-instance loses layer name, reactions; placement in auto-layout unverified | `main/health.ts` | V6; copy name when opted in; skip auto-layout parents until tested |
| C9 | Low | `processIcons` re-themes every icon on any setting change (141 ms @700 [measured]; fine today, linear growth) | `ui.tsx` memo | Cache themed result by `(rawKey, themeOptionsHash)` |
| C10 | Low | Settings change `formats` toggles recompute the whole model | `ui.tsx` | Split settings by concern |
| C11 | Low | Document scope: cancel only checked between nodes; `loadAllPagesAsync` memory on huge files | `main/scan.ts` | V8, add a node-count guard and a "scan page by page" mode |
| C12 | Low | Info-tip positioning uses viewport measurements; verify inside Figma's iframe | `ui/InfoTip.tsx` | Manual test at min window size |
| C13 | Info | Docs stale/inconsistent (PLAN.md vs DECISIONS vs code) | repo root | Consolidate into `docs/` with ADRs; archive the rest |

---

## 6. Workflow and handoff

### 6.1 Meet developers where they work
- **Dev Mode:** the plugin is `editorType: ["figma"]` only [verified], so it cannot run in Dev Mode, which is where developers inspect designs. Add a small **Dev Mode codegen plugin** (`editorType: ["dev"]`, `capabilities: ["codegen"]`) that, for a selected icon instance, outputs `<cmn-icon name="home" />`, the sprite snippet, and the CSS variable overrides read from the instance (size/colour/stroke), using the same naming core.
- **Code Connect:** generate `*.figma` Code Connect files from the manifest (`componentKey` → `<cmn-icon name>` with property mapping for size/colour). This makes Dev Mode and the **Figma MCP server** show the right snippet and component automatically, which is the reliable way for AI agents to resolve "which component is this", instead of relying on them reading `icons.json` by key.
- **Agents:** keep `AGENTS.md`/`icons.json`; add a **JSON Schema** for `icons.json` and an `llms.txt`.

### 6.2 Make the ZIP a real package
Add an **npm package scaffold** to the export: `package.json` (`exports`, `types`, `sideEffects:false`, peer deps), `README`, `CHANGELOG.md` (from the diff in §4.6), version suggestion, `LICENSE` placeholder. A CI job in the consumer repo can then publish. Network stays off in the plugin; publishing is a repo concern.

### 6.3 End-to-end process (proposed)
| Step | Who | Where | Output |
|---|---|---|---|
| 1. Author/maintain icons to the anatomy standard | Designers | Library file (branch) | Components |
| 2. Find problems → dry-run report → fix in branch | DS engineer | Plugin (Find problems) | Branch diff, fix report |
| 3. Merge + publish library | DS lead | Figma | Library version |
| 4. Export on the library file (release checklist) | DS engineer | Plugin (Export) | ZIP, `icons.json`, changelog |
| 5. Commit/PR to the icon package repo | DS engineer | Git | PR with diff |
| 6. CI: compile, render, size budget, pixel diff | CI | GitHub | Pass/fail |
| 7. Publish package, announce | Frontend lead | npm | Semver release |
| 8. Product teams: usage scan on product files | Designers/FE | Plugin (Only icons in use) | Used-icons list, override alerts → backlog |

Release checklist (per export): grid detected = expected · no Blocked · alerts reviewed · changelog bump agrees with semver · size budget OK · test page smoke-checked.

### 6.4 What a "category" means for code (decide once)
Recommended contract: category is **metadata + optional packaging**.
- Always in `icons.json`, test page and typed data (`CMN_CATEGORIES`).
- Optionally splits folders/sprites/CSS (done) and Angular lazy chunks (to do).
- **Never part of the icon name or class**, so moving an icon between categories in Figma is not a breaking change.

---

## 7. Prioritised roadmap

### 0.2 "Trust" (do before adding anything else)
| P | Item | Acceptance |
|---|---|---|
| P0 | `git init`, CI (typecheck, tests, build, `ngc` modern+classic, Playwright render), ESLint/Prettier | CI green on every PR |
| P0 | Verification matrix V1–V9 executed on a fixture Figma file; results in `docs/verification.md`; fix what fails | All rows pass or have a tracked workaround |
| P0 | Allowlist SVG sanitiser in `themeSvg` | Test with hostile SVG fixtures |
| P0 | Persist/handle renames: expose "apply name to layer", `toolkit.config.json` import/export | Rename survives a rescan; two users export identical output |
| P0 | Replace stale docs with `docs/plans/` design doc + plan, archive PLAN.md | One backlog, one source of truth |
| P1 | Variable matching by leaf order; configurable token transform + mapping table | Two same-hex variables map correctly |
| P1 | Duplicate-name policy (keep first / suffix) | Configurable, tested |
| P1 | Health scan: dry-run report, branch acknowledgement, keep layer name, skip auto-layout until V6 passes | Fixture screens pass before/after check |
| P1 | Fixture-based mock harness for `scan`/`health` unit tests | Coverage on `main/` |

### 0.3 "Handoff"
- Code Connect generation + Dev Mode codegen plugin.
- npm package scaffold + changelog/semver from previous `icons.json`.
- JSON Schema for `icons.json`, `llms.txt`.
- Angular per-icon tree-shakable exports + `provideCmnIcons` + sprite-injection strategy; Web Component target.

### 0.4 "Scale"
- Per-category lazy chunks and CSS; size budgets in CI; test page virtualisation.
- Multi-colour/Dark-mode token tables export; RTL mirroring flag; non-scaling stroke option.
- Library-wide usage analytics merge (scan several product files → one usage report).
- Triage mode for very messy files; detect hand-swapped nested icons.

### 1.0 exit criteria
Verified on ≥2 real libraries (including yours) · CI gates above · zero known data-loss paths in fixes · documented anatomy standard · one full release executed end to end (design → npm → app) by someone other than the author.

---

## 8. Decisions needed from you
1. **Fixes policy:** keep write-fixes in 0.2 behind "Labs" with branch acknowledgement, or ship dry-run only until V5–V7 pass? (Recommended: Labs + dry run first.)
2. **Composite icons** (frames made of instances): treat as icons or not? (C4)
3. **Identity/renames:** adopt `componentKey` as identity with alias/deprecation support? (§4.6)
4. **Stroked icons at other sizes:** constant stroke weight (non-scaling) or scale with size? Ask the design team.
5. **Dev Mode/Code Connect:** do your developers work in Dev Mode and does your plan include Code Connect? This decides whether 0.3 starts there or with the npm package.
6. **Packaging target:** monorepo package or a separate icons repo? Which registry (public npm, GitHub Packages, Azure Artifacts)?
7. **Token naming:** share a sample of your actual CSS token names so the mapping default matches reality.
