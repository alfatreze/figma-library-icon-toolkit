# Supported Figma Library Structures — from engineered to haphazard

Goal: the plugin must work on the library you *have* (messy included), tell you honestly how good it is, and show the
shortest path to the next level. It is **read-only**: it never restructures your file; it reports and recommends.
Builds on DECISIONS.md (§1 structure-preserving export, §4 audit, §9 variants, §10 size detection).

## 1. Two separate ideas: structure *axes* and maturity *tiers*

A library is described by independent **axes** (what it does) and summarised by a **tier** (how far along it is).

### 1.1 Axes (each detected per icon, aggregated per scan)

| Axis | Values, best → worst |
|---|---|
| **Container** | component in a component set → standalone component → instance (of local/library component) → frame → group → loose vector/boolean → image/text |
| **Identity** | published `componentKey` → local component id → node id only |
| **Naming** | `category/name` + variant props → `category/name` slash path → flat consistent names → mixed/auto-names (`Frame 123`, `Vector`) |
| **Variants** | component-set properties (`Style`, `Size`) → suffix naming (`home-filled`) → duplicate frames per style |
| **Size/grid** | one library size, uniform live area → multi-size sets → mixed sizes → unsized/cropped |
| **Colour** | variable-bound → style-bound → hard-coded single colour → multi-colour hard-coded → gradients/images |
| **Stroke** | centre-aligned live strokes (editable) → outlined fills → inside/outside strokes → variable-width/dashed |
| **Content hygiene** | only vector leaves → + masks/booleans → hidden/locked/empty layers → text/effects/rasters |
| **Organisation** | page per category/section → one grid frame → scattered across pages/frames |
| **Metadata** | description + tags/aliases → description only → none |
| **Distribution** | published team library → local file only |

### 1.2 Tiers (summary label shown after a scan)

| Tier | Name | Typical shape |
|---|---|---|
| **T5** | Engineered | Published library; component sets with props; variable-bound colours; tags; uniform grid |
| **T4** | Componentised | Standalone components, slash naming, uniform size, hard-coded or style colours |
| **T3** | Framed | Uniform frames in a grid, good names, **not** components |
| **T2** | Loose | Groups/vectors, mixed sizes, inconsistent names |
| **T1** | Haphazard | Auto-names, text/raster/effects, detached/duplicated pieces, hidden junk |

The tier of the *library* = the tier reached by ≥ 80% of icons (configurable); outliers are listed individually.
Tier is a **label for communication**, never a gate: export works at every tier (see §4).

## 2. Structure profiles (concrete layouts the plugin recognises)

Layer trees are illustrative.

### P5 — Engineered library (T5)
```
Page: Icons / Accessibility
 └ Section "Acessibilidade"
    ├ COMPONENT_SET  "icon/audio-descricao"   props: Style=[outline,filled]
    │   ├ COMPONENT  Style=outline   (24×24 frame, transparent, clip on)
    │   │   └ VECTOR  fill = variable color/icon/primary
    │   └ COMPONENT  Style=filled
    └ COMPONENT_SET  "icon/libras" …
```
- Detector: `ComponentSetAdapter`. Icon = each variant component; id = variant `componentKey`; name =
  `<set>-<variant values>` (DECISIONS §9); category = parent section/path; tags = component description.
- Gets: everything (themeable colour with token names, `componentKey` mapping for agents, variants, stable updates,
  published-library diffing).

### P4 — Standalone components (T4)
```
Page: Icons
 ├ COMPONENT "icon/Audio descricao"  (24×24)
 ├ COMPONENT "icon/Libras"
 └ …
```
- Detector: `ComponentAdapter`. Name from slash path; first segment (`icon`) is *category/namespace*, not part of the name.
- Gets: all export features; variants only via naming suffix (`-filled`); colours themeable via hard-coded→slot mapping
  (variable names unavailable unless bound).
- Likely your current state (names like `icon/Audio descricao`), **to be confirmed on your real file**.

### P3 — Framed grid (T3)
```
Page: Icon sheet
 └ FRAME "Icons" (auto-layout / grid)
    ├ FRAME "icon/Audio descricao" (24×24) → VECTORs
    └ …
```
- Detector: `FrameGridAdapter` (selected frame → direct children that are icon-sized frames/groups).
- Identity: node id only (no `componentKey`). Manifest sets `figma.sourceKind: "frame"`, `componentKey: null`; agents
  can't resolve design instances, so the audit raises "not a component" (warn) and the Fix Plan puts *Convert to
  components* first.

### P2 — Loose artwork (T2)
```
Page: Misc
 ├ GROUP "Group 12"  (random size)
 ├ VECTOR "Vector"
 └ BOOLEAN_OPERATION "Union" …
```
- Detector: `LooseArtworkAdapter` (only when explicitly enabled: "Include loose layers"). Candidates are top-level
  vector-ish nodes within a max size. Names are not trusted: auto-names (`Group 12`, `Vector`, `Frame 123`) become
  `unnamed-<n>` placeholders that **block export until renamed in the plugin's list** (UI-only rename; never written back to Figma).
- Size isn't a frame, so bounds = `absoluteBoundingBox` and the export is cropped to artwork; flagged "no frame/grid".

### P1 — Haphazard (T1)
Mixed containers on one page, text and raster layers, effects, hidden/locked junk, duplicates, detached instances,
`Copy of…`, old/new versions side by side.
- Detector: all adapters under "Triage mode". Output is a **health report first**, export second. Nothing is excluded
  silently: every skipped node appears with a reason.

### P-X — Mixed-library / multi-source
Instances of a *published* library placed on a local sheet (very common for consumers' files):
- `InstanceAdapter` resolves `await instance.getMainComponentAsync()`, dedupes by **main component**, takes the main
  component's name/key/description (not the instance's), exports the **main component** node when accessible (remote
  components might be unreadable: warn and export the instance's rendering instead).

## 3. Adapter architecture

```ts
interface StructureAdapter {
  id: 'component-set' | 'component' | 'instance' | 'frame-grid' | 'loose';
  matches(node: SceneNode): boolean;                           // cheap, sync
  collect(root: SceneNode, ctx: ScanContext): Promise<IconCandidate[]>;
}
interface IconCandidate {
  node: SceneNode; sourceKind: AdapterId;
  identity: { componentKey?: string; nodeId: string };
  rawName: string; category: string[]; variantProps?: Record<string,string>;
  description?: string; size: {w:number;h:number}; boundVariables?: …;
}
```
- Precedence per node: `component-set` → `component` → `instance` → `frame-grid` → `loose`. First match wins; never descend
  into a matched candidate (DECISIONS A4). Adapters are pure/read-only and unit-testable on JSON fixtures.
- **Scan modes** (UI segmented control): *Auto* (default: all adapters except `loose`), *Components only*,
  *Frames in selection*, *Include loose layers*, *Triage (all)*. Auto reports which adapters fired and how many icons each.
- Everything downstream (audit, naming, export, manifest) depends only on `IconCandidate`, so adding a structure later is
  one adapter file.

## 4. What works at each tier (capability matrix)

| Capability | T5 | T4 | T3 | T2 | T1 |
|---|---|---|---|---|---|
| SVG export | ✅ | ✅ | ✅ | ⚠ cropped to artwork | ⚠ per icon, errors block |
| Themeable colour (slots/`currentColor`) | ✅ + token names | ✅ hex→slot | ✅ hex→slot | ✅ hex→slot | ⚠ only if vector-only |
| Editable stroke width | ✅ (centre strokes) | ✅ | ✅ | ⚠ | ⚠ |
| Variants as icons | ✅ real props | ⚠ naming suffix | ⚠ naming suffix | ❌ | ❌ |
| `componentKey` ↔ code mapping for agents | ✅ | ✅ (local key; stable once published) | ❌ node id only | ❌ | ❌ |
| Detect changes between exports (diff) | ✅ key + hash | ✅ | ⚠ node id | ⚠ | ❌ |
| Tags/aliases from descriptions | ✅ | ⚠ | ❌ | ❌ | ❌ |
| Mass-replace by agents in design files | ✅ | ✅ | ❌ | ❌ | ❌ |
| Size/grid validation | ✅ | ✅ | ✅ | ⚠ no frame | ❌ |

Export is never refused because of tier. What changes is (a) severity of findings, (b) what the manifest can promise,
(c) the Fix Plan.

## 5. Strictness profiles (how the audit judges the same file)

| Profile | Intent | Behaviour |
|---|---|---|
| **Lenient** (default for T1–T3 files) | "Get me an export now" | Structure findings are warnings; only unexportable things (raster, text, empty) are errors |
| **Standard** | Healthy library | Missing components/tags = warning; naming, size, hidden layers = error |
| **Strict** | Design-system grade | Target tier T5: not-a-component, unbound colours, missing tags/descriptions, non-set variants = error |

The profile is a setting (per user, exportable as `settings.json` for team consistency). "Target tier" shows as a progress
indicator: *You are T3 → Target T4: 42 issues in 3 steps*.

## 6. Fix Plan (read-only remediation guidance)

After every scan the plugin can generate a **Fix Plan**: an ordered list of steps that move the library up a tier,
each with the count of affected icons, a "zoom to first" link, and a plain-language how-to for the designer.
Copy/export as Markdown or CSV (columns: step, ruleId, severity, node name, node id, page, fixHint) to hand to a designer or an agent.

Ordered "staircase" (earlier steps unlock the later ones; the plugin orders by dependency, not by count):

1. **Remove blockers** — raster fills, text layers, effects, hidden/locked/empty layers (they make exports unreliable).
2. **Normalise names** — one grammar (`category/name`), ASCII, no auto-names, no `Copy of`, no `icon` redundancy.
3. **Establish the grid** — wrap artwork in uniform frames at the detected/target size; transparent; clip content; consistent padding.
4. **Fix strokes deliberately** — decide per icon: *live stroke (centre aligned)* or *outlined*; fix inside/outside alignment.
5. **Convert to components** — each icon frame → component (unlocks `componentKey`, instances, diffing).
6. **Group variants into component sets** — Style/Size properties instead of suffix naming.
7. **Bind colours to variables** — primary/secondary slots to design tokens; remove hard-coded hex.
8. **Add metadata** — component descriptions with tags/aliases (PT + EN).
9. **Publish the library** — stable keys for consumers; enable change tracking.

Per-icon "fix hints" are data in the finding (`fixHint: { action: 'wrap-in-frame', params: { size: 24 } }`) so that:
- **now:** they render as human instructions;
- **later (explicit opt-in "Fix mode")**: the same hints can be applied by the plugin with a diff preview and a single
  undo step, or handed to an agent. No code path in v1 writes to the file.

## 7. How the three product features use the structure

- **Naming:** `IconCandidate.category/rawName/variantProps` → canonical id. Unnamed or colliding → UI-only override
  list (kept in plugin settings keyed by node id; never written to the file).
- **Locate:** every finding and list row stores `nodeId` (+ page id) → select + `scrollAndZoomIntoView`.
- **Manifest/agents:** `figma.sourceKind`, `componentKey` (nullable), `tier`, and per-icon `fixPlan` references make the
  limits explicit: an agent reading `componentKey: null` knows mass-replace by component isn't possible for that icon.

## 8. Test fixtures (one Figma file, one page per structure)

| Page | Content | Verifies |
|---|---|---|
| `P5-engineered` | component sets with Style/Size, variable-bound fills, tags | variants, tokens, keys |
| `P4-components` | the 14 sample icons as components | parity with a reference export |
| `P3-frames` | same icons as plain frames | frame adapter, `componentKey: null` |
| `P2-loose` | ungrouped vectors, mixed sizes | loose adapter, placeholder names |
| `P1-haphazard` | text, raster, effects, hidden layers, duplicates, `Copy of`, detached instances | triage report, blockers |
| `PX-library-instances` | instances of a published library | main-component resolution, remote-readability warning |
| `stress-1000` | 1000 icons | performance/virtualisation |

Unit tests run adapters against JSON snapshots of these nodes (no Figma needed); the spike validates the real API behaviour.

## 9. Impact on the plan
- `src/core/detect/` becomes `adapters/*` + `classify-tier.ts` + `fix-plan.ts`; audit rules take a `profile` argument.
- New UI: *Scan mode* control, *Structure summary* header ("T3 Framed · 14 icons · target T4"), *Fix Plan* tab/export.
- M1 (detection) now = adapters + tier classification; Fix Plan export lands with M2 (audit) so triage is useful from the first build.
- Spike additions: adapter behaviour on remote library instances, `getMainComponentAsync` readability, component-set property
  extraction, description access.

## 10. Open questions
1. What structure is your real library in today (P4 components? P3 frames?). A Figma link (or screenshot of the layers panel) lets me calibrate defaults.
2. Default profile on first run: Lenient (recommended) or Standard?
3. Should loose-layer detection (P2) be in the MVP, or only P3–P5 plus Triage reporting for P1/P2?
