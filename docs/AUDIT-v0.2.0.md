# Code audit of v0.2.0 (security, architecture, Figma-side correctness)

> **Status (after the follow-up work on `main`, unreleased):** see the table at the end. Everything marked done has tests; nothing has been run inside Figma.

Method: three independent read-only reviews (nothing was run or changed), then a spot check of the highest-impact claims.
**Confirmed by reading the code:** A1, A2, A3 (companion `subdir`), A5. **Everything else is reported but not re-verified**; treat it as a lead and reproduce before fixing.
Effort: S under half a day, M about a day, L several days.

## 1. Fix first (security and data integrity)

| # | Finding | Where | Fix | Effort |
|---|---|---|---|---|
| A1 | **Imported/published config reaches generated code unvalidated.** `parseConfig` only checks `typeof`, so `strokePolicy` (and any enum) can hold arbitrary text, which is interpolated into generated TS/JS and committed to the product repo by the companion. | `core/config.ts:29`, `generators/icondata.ts:57`, `generators/webcomponent.ts` | Allow-list enums and ranges in `parseConfig`/`parseShared`; re-validate at the generator boundary. Add a test per enum setting. | S |
| A2 | **Fix-preview SVG is never sanitised** (the only unsanitised `innerHTML` sink; it runs where the companion token lives). | `ui/Fixes.tsx:24`, data from `main/scan.ts`, `main/diagnose.ts` | Run `sanitizeSvgTree` on `fix.svg`/`target.svg` or render via `<img src="data:…">`. | S |
| A3 | **Companion accepts any `subdir`**, including `.` and `.git/hooks` (a hook file is code execution on the next commit; `.` can overwrite `package.json`, workflows). `safeRel` only blocks traversal. | `tools/icon-sync.mjs:41-46,84-88` | Reject `.`, dotted first segments, `node_modules`; refuse any path with a `.git` segment; optional `--subdir` allow-list. | S |
| A4 | **`sanitizeSvgTree` is a blocklist** with gaps: CDATA inside `title`/`desc` (mXSS), tab/newline in `javascript:`, non-SVG elements (`img`, `link`, `form`…), `url()` in `marker-*`/`cursor`, foreign namespaces. | `core/sanitize.ts`, `core/svg.ts` serialise | Switch to an allow-list of SVG elements/attributes; drop comments/CDATA/PIs; strip whitespace and control characters before scheme checks; only `url(#id)`. | M |
| A5 | **`viewBox` is concatenated into markup unvalidated** (`"` breaks out of the attribute in svg files, sprite, test page, React/Angular/Web Component output). | `core/svg.ts` `wrapSvg`, `generators/*` | Validate with a numeric regex, else fall back to `0 0 w h`. | S |
| A6 | **Previous `icons.json` (file or repo) reaches generators unvalidated** (`deprecated[].name` into sprite ids, CSS selectors, README). | `core/changelog.ts` `parseCatalog`, `nextDeprecated`, `generators/svg-files.ts`, `css.ts` | Schema-validate (slug/semver); escape at each emit point. | S |
| A7 | **Main-thread handlers trust the UI.** `ATTACH_DEV_RESOURCES` (no scheme/id/count check), `SAVE_BASELINE` (no size cap; any `target` writes into the file), `APPLY_FIXES` request fields. | `main.ts` | Re-validate in main: `https://` only, id regex, caps (e.g. 2 MB baseline), `target` allow-list, numeric/length checks. | S |
| A8 | **`decodeSnapshot` has no output cap** (zip bomb in plugin data freezes the main thread) and no schema check of `icons[]`. | `core/baseline.ts:66` | Bound input length, use streaming inflate with a limit, validate shape. | S |
| A9 | Companion hardening: follows symlinks; trusts `.icon-toolkit.json` for deletions (can delete `package.json`); 200 MB in-memory body; no Host check (DNS rebinding); branch regex allows `a..b`; entry guard `import.meta.url === file://${argv[1]}` breaks on paths with spaces (like this repo's). | `tools/icon-sync.mjs` | `realpath` + `lstat` containment, delete only generated patterns, 20 MB cap + `content-length`, Host allow-list, `git check-ref-format`, `pathToFileURL`. | M |
| A10 | CI/supply chain: no `permissions:` in `ci.yml`; `ng-latest` toolchain uses `latest` with no lockfile; actions pinned to tags not SHAs; release has no checksums/attestation. | `.github/workflows/*`, `scripts/toolchains/*` | `permissions: contents: read`; commit lockfiles (keep one deliberate "latest" job as non-blocking); pin SHAs; attest release zip. | S |

Chain to keep in mind: A2/A4 (UI XSS) can reach the companion token, and A3 turns a companion write into code execution. Fixing A2 and A3 breaks the chain.

## 2. Correctness bugs in the Figma-side code

| # | Sev | Finding | Where | Fix |
|---|---|---|---|---|
| B1 | High | One throwing node kills the whole scan: `gatherFacts` fallback is unguarded; `diag.addComponent`/`componentFixes` too. UI gets `SCAN_ERROR` and loses all icons. | `main/scan.ts:231-249` | Per-candidate try/catch; emit the icon with `exportError`; continue. |
| B2 | Med | Diagnose phase ignores cancel and never yields; a re-SCAN while busy is dropped silently (UI waits forever). | `scan.ts:229-241`, `main.ts:114` | Check `cancelled()` and yield every ~200 items; reply `SCAN_ERROR('busy')`. |
| B3 | Med | `COMPONENT_SET` children are not added to `seenComponents`, so instances of variants become duplicate "instance" candidates; traversal order affects standalone components. | `scan.ts:84-91,119` | Pre-collect component keys or drop instance groups whose key is a candidate. |
| B4 | Med | Frames/groups **inside instances** become `frame` candidates; apply only checks the direct parent, so deeper cases throw after leaf renames were applied. | `scan.ts:133-149`, `apply.ts:61,107` | `insideInstance` flag; check ancestors in apply. |
| B5 | Med | Icon instances nested in components are never counted (usage undercount). | `scan.ts:95,102` | Visit children of fitting components for usage. |
| B6 | Med | Replace-with-instance only carries `fills`; stroke-only icons lose colour though the UI promises it. Colour matching by leaf index trusts equal counts. | `apply.ts:75-84` | Also copy `strokes`; match by name/order check. |
| B7 | Med | Leaf renames applied before `createComponentFromNode`; no rollback; `commitUndo` skipped if the loop throws; fixes not guarded against a concurrent scan/apply. | `apply.ts:108-115`, `main.ts:140-157` | Rename after success or roll back; `try/finally` around `commitUndo`; busy flag shared with scan. |
| B8 | Med | `outlinedSvg` ignores text, opacity, blend, effects, clip, `figma.mixed`; viewBox uses node box not render bounds (clips stroke overhang). | `main/outline.ts:15-53` | Return null when unsupported; use `absoluteRenderBounds` for non-frame roots. |
| B9 | Med | Duplicate detection: signature ignores stroke weight/cap/join (Light/Regular/Bold variants flagged "duplicate", high confidence); 32-bit FNV with no equality check (~1% collision at 10k); `refs.find` is O(n) per node. | `main/diagnose.ts:50-91,170-185,254-266` | Include stroke in shape or downgrade confidence; key maps by the full signature; index refs in a Map. |
| B10 | Med | `geometryHash` reads only `d="…"`; circles, rects, lines, polygons, stroke-width ignored, so different icons hash equal (and `assignAliases` could alias them) and stroke edits never show as "changed". | `core/process.ts:36` | Hash all geometry-relevant attributes; `colorHash` should include opacity. |
| B11 | Med | Changelog matching is order-dependent: duplicates in the previous catalog overwrite each other (false removals, major bump); two current icons can match one previous entry; chained renames drop the older alias. | `core/changelog.ts:60-76,125-128` | Two passes (keys then names) with list-valued maps; keep alias chains; guard against live-name aliases. |
| B12 | Med | Common names (`delete`, `new`, `import`, `export`, `default`, `switch`…) are blocked as reserved; check the Pascal/camel forms instead. | `core/naming.ts:3-10,84-87` | Validate the identifiers actually generated. |
| B13 | Med | Codegen handler has no try/catch or 15 s guard; `iconsUsed` does up to 4000 serial awaits and truncates silently. | `main/codegen.ts:138-188` | try/catch, race against ~12 s, return partial result with a notice. |
| B14 | Med | `exportAsync` is strictly serial (~5 min at 10k icons) and every SVG is cached; `loadAllPagesAsync` has no progress/cancel. | `scan.ts:201,241-297` | Batch 6-8 with `Promise.all`, drop cache after emit, load pages one by one with cancel. |
| B15 | Med | Override aggregation calls `getNodeByIdAsync` per override per instance; global variable-name caches never cleared (stale names). | `main/overrides.ts:66-68`, `facts.ts:18-19` | Cache per id, cap per group, clear caches at scan start. |
| B16 | Med | `roundNumbers` with precision 0 corrupts numbers (`100` → `1`). | `core/svg.ts:87-94` | Strip trailing zeros only when the string contains `.`. (Check whether the UI can select 0.) |
| B17 | Low | Local baseline identity includes page ids and file name (loses baseline on rename/new page; duplicated file shares the key); `clientStorage` has no eviction; save debounce lost on quick close; window size not clamped; UI_READY/LOCATE/PUBLISH_CONFIG have no top-level try/catch. | `main/baseline.ts`, `main.ts`, `settings.ts` | Store id + name fallback, cap stored baselines, flush on close, clamp, wrap handlers. |
| B18 | Low | `variantProps` order, `localeCompare` tie-break is locale-dependent (stable numbering for the "number" duplicate policy should not depend on locale); slug fold misses `Ł đ ı`; emoji-only names slugify to "". | `core/naming.ts` | Use plain code-point comparison; extend fold; reject empty slugs before suffixing. |

## 3. Architecture and maintainability

1. **`ui.tsx` is a 1235-line component with about 45 `useState`s** (scan, fixes, baseline, sync, filters mixed with derived data and handlers). Scan-start resets ~14 setters by hand. Split into hooks (`useScan`, `useFixes`, `useBaseline`, `useSync`, `useSharedConfig`, `useFilters` with a `RESET_FOR_SCAN` action), pure `ui/selectors.ts` (unit-tested), and panels (`IconsTab`, `IssuesTab`, `SkippedTab`). **L**, do it hook by hook.
2. **`types.ts` (502 lines) mixes settings, domain, fix types and 25 `*Handler` message interfaces.** Split into `types/{settings,domain,fixes,messages}.ts`; replace the handler interfaces with one `Messages` map (`{ SCAN_BATCH: [RawIcon[], number] }`) and typed `emitTo`/`onMsg` wrappers so name/args mismatches fail at compile time. **M**
3. **Settings versioning is ad hoc.** One key with no embedded version; inline migrations; failures silently reset to defaults; `core/config.ts` `KEYS` is hand-maintained (forgetting a new shared setting means it never reaches `toolkit.config.json`); no enum validation (see A1). Add `settingsVersion` + migrations, derive shared keys from a schema, and a test that every `Settings` key is classified shared or local. **M**
4. **Generators are string templates with copy-paste.** Angular modern/classic are near copies; registry/loader logic repeats in angular, react and webcomponent; `camelNs`/`K`/`camelToPascal` duplicate `naming.ts` helpers; adding a target touches 5-6 places (`index.ts`, `types.ts`, `overview.ts`, Settings UI, path-prefix chain). Introduce a `Target` registry `{id, label, detail, settingKey, prefix, build}` iterated by `buildFiles`, the overview and Settings; share header/escape helpers. **L** (registry), **S** (helper dedupe)
5. **Snippet sources diverge**: `core/snippets.ts` (also interpolates `label` unescaped into HTML/JSX, a small injection/breakage bug), `testpage.ts` client JS, and the generators. Generate the test page's snippet table from `snippets.ts`; escape labels. **M / S**
6. **Duplicated UI helpers**: `download`, `copyText`, `notify`, `plural`, `cx`, `kb` live in several files. One `ui/util.ts`. **S**
7. **Empty `catch {}` blocks (30+) and no logging.** Add a ring-buffered `log.ts` plus a "Copy diagnostics" button and a `tryOr(fn, fallback, label)` helper; stop swallowing error types in `ui.tsx`. **M**
8. **Hash helper lives in `core/fixes.ts`** but is used by changelog, baseline and process: move to `core/hash.ts`. Overlapping file names (`main/baseline.ts` vs `core/baseline.ts`, same for overrides): rename for clarity. **S**
9. **Performance on large libraries.** `processIcons` reruns (with DOM-parsing `themeSvg` per icon) on any `settings` change, including window size, Labs and sync token; split into stage 1 (theming, depends on 6 settings) memoised per icon, and stage 2 (naming/audit/aliases); pass only the relevant slice to `useMemo`. `computeOverview` builds every format whenever the export panel is open (debounce/cache). Batches are `concat`ed (O(n²)); `categoryGroups` copies arrays in a loop; zip runs on the UI thread with no progress (use fflate async). Each icon keeps `body`, `standalone`, `maskSvg` and raw SVG (about 4x memory). **M**
10. **Bundle**: `ui.js` is 437 KB against a 540 KB budget; tighten to about 460 KB and lazy-load the generators on Export. **S/M**
11. **Test gaps**: nothing for `ui/*`, `main/scan.ts`, `diagnose.ts`, `facts.ts`, `codegen.ts`; no snapshot tests of generator output. Extend `fakeFigma` for scan/diagnose/facts; add hook/selector tests after the ui split; snapshot a small fixture per target. **M**
12. **Accessibility**: tabs lack `tabpanel`/`aria-controls`/arrow keys; dialogs lack focus trap, initial focus, Esc and focus restore; no `aria-live` for scan progress or status; `title`-only tooltips are not keyboard accessible; contrast of warn chips in dark mode unchecked. Shared `<Dialog>`, live region, tab keyboard handling. **M**

Strengths worth keeping: clean core/main/ui layering (`core` is DOM-free except `svg.ts`), shared generator helpers, strong core tests plus real-toolchain compile and render checks, companion with token + `timingSafeEqual` + loopback bind, correct dynamic-page API usage, slugified names everywhere, `scanning` always reset in `finally`.

## 4. Suggested order

1. **Security batch (S items, one PR):** A1, A2, A3, A5, A6, A7, A8, A10 + tests. Then A4 (allow-list sanitiser) and A9.
2. **Scan robustness (one PR):** B1, B2, B7, B6, B16, B12, then B3/B4/B5.
3. **Identity and diff correctness:** B10, B11, B9 (they affect versioning and aliases, which are public-API behaviour).
4. **Structure:** `ui/util.ts`, `core/hash.ts`, typed messages, settings schema + migrations, `Dialog` a11y, `processIcons` stage split.
5. **Large refactors:** ui.tsx hooks split, generator `Target` registry, `fakeFigma` coverage for scan/diagnose/facts.

Target layout (from the architecture review):

```
plugin/src/
  types/        settings, domain, fixes, messages, index
  protocol/     messages map + typed emit/on
  settings/     schema, migrations, shared-keys
  core/         naming, hash, svg(+svgDom), process (stage1/stage2), audit, ...
    generators/ targets.ts (registry), _shared/{header,naming,registry,escape}, angular/, react/, webcomponent/, html/
  main/         index, scan, facts, diagnose, codegen, apply, storage/{settings,baseline,shared}
  ui/           App (shell), hooks/, selectors.ts, util/, panels/, components/{Dialog,Tabs,InfoTip}
  log.ts
```

## 5. Status of the follow-up work

| Item | Status | Notes |
|---|---|---|
| A1 config validation | **done** | `core/settingsSchema.ts` (every setting classified shared/local at compile time, enum/range checks, migrations); `parseConfig`, saved settings and `exportConfig` use it; generators also normalise the stroke policy |
| A2 fix-preview sanitising | **done** | `sanitizeSvgString` in `ui/Fixes.tsx` |
| A3 companion subdir/paths | **done** | plain subfolder only, no dot-segments, allowed file types, tests incl. `.git/hooks` |
| A4 allow-list sanitiser | **done** | `core/sanitize.ts` rewritten; CDATA/comment/text nodes removed; only `url(#id)` / `#href` |
| A5 viewBox | **done** | `safeViewBox` in `wrapSvg` and `themeSvg` |
| A6 previous catalog | **done** | `parseCatalog` validates every field; invalid entries dropped |
| A7 handler validation | **done** | `main/guards.ts` (+ `safe()` wrapper so no handler leaves the UI waiting) |
| A8 baseline decode | **done** | streaming inflate with a cap, size limit, entry validation |
| A9 companion hardening | **done** | symlink refusal, managed-list allow-list, 20 MB cap, Host check, `check-ref-format`, `pathToFileURL`, `ICON_SYNC_TOKEN` |
| A10 CI/supply chain | **partly** | read-only token, release job scoped, lockfiles + `npm ci` for pinned toolchains, `latest` job non-blocking, notices check, release checksum. Actions pinned by SHA, release zip attested (`actions/attest-build-provenance`, verify with `gh attestation verify`; untested until the next release) |
| B1-B8, B11-B16, B18 | **done** | scan isolation/yield/cancel/busy reply, page-by-page load, parallel export, set variants, inside-instance, usage in components, stroke colour carry, rename-after-success, outline limits and render bounds, two-pass changelog + alias chains, reserved-word rule removed, codegen timeout, override lookups capped, caches cleared, precision 0, locale-independent ordering |
| B9 duplicates | **partly** | stroke weight/cap/join in the signature, 64-bit hash, indexed lookups. Confidence is not downgraded for colour-only state variants |
| B10 geometry hash | **done** | shapes, stroke attrs, transforms; plain filled paths keep their old hash (no false "changed" on upgrade). Strokes/non-path icons change once |
| B17 baseline identity | **done** | first page id instead of name + all page ids; at most 20 local baselines |
| Arch 1 `ui.tsx` | **partly** | `useScan`, `useBaselines`, `useSync`, `ui/selectors.ts`, `ui/companion.ts` extracted (1177 → about 1000 lines). `useFixes` (also restored the `FIX_RESULT`/`FIXES_APPLIED` listeners lost in the hook refactor), list/issue components in `ui/components/`, `IconsPanel`/`IssuesPanel`/`SkippedPanel` in `ui/panels/`. `useFilters` reducer (`ui/hooks/useFilters.ts`, unit-tested) |
| Arch 2 types + messages | **done** | `types/{settings,domain,fixes,messages}.ts`; one `Messages` map ties each message name to its arguments |
| Arch 3 settings versioning | **done** | see A1 |
| Arch 4 generators | **partly** | `Target` registry (`generators/targets.ts`) drives `buildFiles`, the overview and file ownership; helper duplication removed. Angular modern/classic now built from shared pieces (decorator, registry, host bindings, inputs, sprite template); output pinned byte for byte by a snapshot (`test/angular.test.ts`). **Not done:** the registry/loader logic that angular, react and webcomponent still repeat |
| Arch 5-6 snippets | **done** | label/colour escaping; the test page now prints `core/snippets.ts` strings |
| Arch 7 logging | **done** | `log.ts` ring buffer, `tryOr`, Settings → Copy diagnostics; empty `catch {}` in `main/` now log |
| Arch 8 naming | **partly** | `core/hash.ts`; dead exports removed. **Not done:** renaming `main/baseline.ts` vs `core/baseline.ts` |
| Arch 9 performance | **done** | per-icon theme cache, only relevant settings re-run processing, throttled batches, overview not rebuilt on format toggles, ZIP toast before the blocking work, O(n²) spots removed. **Not done:** zip in a worker |
| Arch 10 bundle | **partly** | budget now 490 KB (the bundle grew with validation); generators are not lazy-loaded because the plugin bundler emits one file |
| Arch 11 tests | **partly** | added: scan, guards, security, hooks, dialog, selectors, baseline housekeeping. **Still untested:** `diagnose.ts`, `facts.ts`, `codegen.ts` |
| Arch 12 accessibility | **partly** | `Dialog` (focus move, trap, Esc, restore), tab keyboard, live region. keyboard-accessible hints (`data-hint`), `theme-contrast` rule for fixed colours. `tabpanel` / `aria-controls` / `aria-labelledby` on every tab. dark-mode contrast of chips, pills and badges fixed and guarded by `test/contrast-css.test.ts` (light-mode kit tints stay at about 3.8:1) |
