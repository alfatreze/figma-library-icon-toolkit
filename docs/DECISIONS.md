# Decisions v2 — supersedes PLAN.md §2–3 and REVIEW.md §A1–A3, B1, B4, D2

Inputs: the product owner's answers + a reference export from a previous tool (14 icons, 11 formats).

## 0. What the reference export showed

| Finding | Evidence | Consequence for us |
|---|---|---|
| The reference tool does **not** flatten. It keeps one `<path>` per vector (1–6 per icon), keeps `fill-rule`/`clip-rule`, uses Figma's own SVG export | `pessoa_pcd.svg` has 6 paths; `closed_caption.svg` keeps `evenodd` | Flattening was my wrong assumption. Dropped. |
| Colour is hard-coded `#1F1D1D` in every SVG/React/Vue/RN/Vector Drawable | all files | Output is not themeable. We fix this. |
| `color` prop is declared but never applied (React/Angular/Vue: `fill` stays `#1F1D1D`) | `react/cmn_icon_vui.js` | Props must actually bind to the markup. |
| **Angular output is broken**: the `<path>` is HTML-escaped inside the template (`&lt;path d=&quot;…`) so it renders as text, not an icon | `angular/cmn_icon_audio_descricao.js` | Angular generator needs a compile + render test (see §6). |
| Angular selector is `app-cmn-icon-…` (hard-coded `app-` prefix), one component per icon | same | Replace with one `cmn-icon` component + data. |
| Diacritics are dropped to `_`: `Deficiência` → `defici_ncia` | `cmn_icon_defici_ncia_visual.svg` | Correct ASCII-fold (`deficiencia`). |
| `icon/` folder segment leaks into every name: `cmn_icon_…` | all names | Treat first path segment as a category, not part of the name. |
| Only 3 of 11 formats matter to you; the rest (PDF/PNG/JPEG/Base64/Vue/RN/Vector Drawable) are the backlog | — | Confirms MVP scope. |

## 1. Why were we flattening? (answer) → we won't

Flattening existed only to satisfy FontAwesome's single-`d` data tuple. You don't need that model, so the reason is gone,
and flattening is actively harmful: it destroys multi-colour layers, live (editable-width) strokes, per-layer
structure, and layer names. **New rule: structure-preserving export.** Consequences:

- Export each icon with Figma's own `exportAsync({format:'SVG_STRING'})` on the original node, no clone, no outline,
  no flatten. Coordinates, viewBox, `fill-rule`, masks and clips stay exactly as Figma emits them.
  (This also kills REVIEW A1 coordinate bug, A3 winding problem, and A2 mutation concern.)
- Post-process the SVG string **in the UI** (DOMParser) only to make it themeable (§3).
- Each icon is classified, not converted:

| Kind | Detected by | Output behaviour |
|---|---|---|
| `filled` | only fills, one colour | `fill="currentColor"` |
| `stroked` (line icon) | live strokes, no/transparent fills | `stroke="currentColor"`, `stroke-width="var(--cmn-icon-stroke-width, 2)"`, `fill="none"` |
| `multicolor` | ≥2 distinct paints | primary → `currentColor`, others → `var(--cmn-icon-color-2, #hex)` … |
| `mixed` | strokes + fills | both mapped; flagged info |

- **Editable stroke width caveat (verify in spike):** SVG strokes are always centred. Figma strokes with
  *inside/outside* alignment, or variable-width/profile strokes, can't be represented as a live stroke; Figma exports
  them as expanded geometry or masks. Those get an audit alert ("stroke alignment not centre: not editable in code").
  Optional per-icon toggle "keep strokes live" vs "as drawn".

## 2. Never modify the user's file (answer) → agreed, enforced by design

- No `clone`, `flatten`, `outlineStroke`, rename, or property write on any user node. Our pipeline only reads.
- Remove the temp-container sweep, undo-stack concerns and `ilt-temp` pluginData from the plan: they no longer apply.
- Only permitted writes: **none to the canvas**. Selection (`selection = [node]`) and viewport changes are not
  document edits; they're allowed for "locate".
- Settings: `clientStorage` (per user). Team-shared settings via a **settings.json export/import**, not by writing plugin
  data into the file. (Optional later: root-level pluginData as an explicit opt-in.)
- Future audit **fixes** are a separate, explicit, opt-in mode: each fix is a described change, previewed as a diff,
  applied only on confirm, one undo step. The audit engine returns `Finding {ruleId, nodeId, severity, message,
  fixHint?}`; `fixHint` is data only. No code path in v1 can write.
- forge archetype: this is **local-audit + spec-generation** (no backend): `skills/plugin-architecture/references/patterns/local-audit.md`.

## 3. Output model (replaces the FontAwesome tuple)

FontAwesome stays only as inspiration for: one canonical name → many artifacts, a base class + per-icon modifier,
size utilities, CSS-driven colour/size.

### 3.1 Canonical icon id and derived names
Single source of truth: **kebab-case id** + library namespace. All other forms are deterministic derivations:

| Artifact | Form | Example for `Audio descricao` |
|---|---|---|
| Canonical id | `<ns>:<name>` (Iconify-style) | `cmn:audio-descricao` |
| SVG file | `<ns>-<name>.svg` | `cmn-audio-descricao.svg` |
| CSS class | `.cmn-icon--<name>` | `cmn-icon--audio-descricao` |
| HTML/Angular tag | `<cmn-icon name="audio-descricao">` | |
| TS const / component | camel / Pascal | `cmnAudioDescricao`, `CmnIconAudioDescricao` |
| Android drawable (backlog) | snake_case (platform rule) | `cmn_audio_descricao` |

Your `cmn_` underscore convention survives only where the platform requires snake_case; elsewhere kebab is the
web norm and what a dev or agent will grep for.

### 3.2 Prefix & class naming best practices (what I'd adopt, and why)
Surveyed conventions: Font Awesome (`fa-solid fa-house`), Bootstrap Icons (`bi bi-house`), Iconify (`mdi:home`,
`i-mdi-home` for Tailwind/UnoCSS), Material Symbols (ligature text), Shoelace (`<sl-icon name>`),
Lucide/Heroicons/Carbon (PascalCase components `HomeIcon`).

1. **Namespace = short, lowercase, 2–4 chars, unique** (`cmn`), kept separate from the name. Never baked into the
   *meaning* of the name; it is always one prefix, applied mechanically.
2. **Name = what it depicts, kebab-case, no size/colour/state in it.** Variants are a suffix or property
   (`-filled`, `-outline`), never `Property 1=Default`.
3. **No redundant words**: drop `icon`, folder names and platform words. (`cmn_icon_audio_descricao` → `audio-descricao`.)
4. **One language, with aliases.** Names are Portuguese (domain terms like *libras* don't translate). Keep PT as the
   id and put English synonyms in `tags` in the manifest so devs/agents can search either.
5. **ASCII only**, lowercase, `[a-z0-9-]`, must start with a letter; reserved/colliding names are audit errors.
6. **Base class + modifier, BEM-style:** `cmn-icon` (layout/size/colour behaviour) + `cmn-icon--<name>` (which
   icon). Reason: the pair is trivially greppable (`cmn-icon--([a-z0-9-]+)`) for mass replace, never collides with
   utility frameworks, and the base class carries the CSS variables.
7. **Properties are CSS custom properties with Figma-matching names:**
   `--cmn-icon-size`, `--cmn-icon-color`, `--cmn-icon-color-2…`, `--cmn-icon-stroke-width`. These mirror what a designer
   overrides on an instance (size, fill, stroke fill, stroke weight), so design→code is a 1:1 mapping.

### 3.3 Make it consumable by AI agents (cheap, high value)
Ship `icons.json` (manifest) and a short `AGENTS.md` in every export:

```jsonc
{
  "namespace": "cmn", "version": 1, "generatedAt": "…",
  "cssVariables": { "size": "--cmn-icon-size", "color": "--cmn-icon-color",
                    "stroke": "--cmn-icon-stroke-width" },
  "icons": [{
    "id": "cmn:audio-descricao", "name": "audio-descricao", "category": "acessibilidade",
    "kind": "filled", "viewBox": "0 0 24 24",
    "colorSlots": [{ "var": "--cmn-icon-color", "default": "currentColor", "figmaVariable": "color/icon/primary" }],
    "strokeWidth": null,
    "tags": ["audio description", "ad"],
    "figma": { "componentKey": "…", "nodeId": "12:34", "layerName": "icon/Audio descricao" },
    "usage": { "html": "<i class=\"cmn-icon cmn-icon--audio-descricao\" aria-hidden=\"true\"></i>",
               "angular": "<cmn-icon name=\"audio-descricao\" />" },
    "audit": { "errors": 0, "warnings": 1 }
  }]
}
```
`AGENTS.md` states the naming grammar, the Figma-property→CSS-variable mapping table, and the replace recipe
("find instance of component `<key>` → emit `usage.angular`; map fill override → `--cmn-icon-color`, stroke weight →
`--cmn-icon-stroke-width`, size → `--cmn-icon-size`"). The `figma.componentKey` is the join between design and code.
If a fill is bound to a Figma variable, record its name in `colorSlots[].figmaVariable` (read via `boundVariables`).

### 3.4 Formats (MVP)
- **SVG** (`svg/<ns>-<name>.svg`): themeable SVG per §1 (not hard-coded `#1F1D1D`). Option "As drawn (original colours)".
- **Angular**: a typed data file + **one** standalone component, no FontAwesome, no per-icon components:
  ```ts
  // icons.ts (generated)
  export const CMN_ICONS = {
    'audio-descricao': { viewBox: '0 0 24 24', kind: 'filled',
      paths: [{ d: 'M12 1C…', fillRule: 'evenodd', slot: 1 }] },
  } as const;
  export type CmnIconName = keyof typeof CMN_ICONS;

  // cmn-icon.component.ts (generated, standalone)
  @Component({ selector: 'cmn-icon', standalone: true, changeDetection: OnPush,
    template: `<svg [attr.viewBox]="icon().viewBox" aria-hidden="true" focusable="false">
      @for (p of icon().paths; track $index) { <svg:path [attr.d]="p.d" [attr.fill-rule]="p.fillRule" .../> }
    </svg>` })
  export class CmnIcon { name = input.required<CmnIconName>(); /* size/color via CSS vars */ }
  ```
  Paths render through bindings (`svg:path`), never through string-escaped markup (escaped markup renders as text, not an icon).
  Per-icon tree-shakeable constants are also exported for apps that want `import { cmnAudioDescricao }`.
- **HTML**: `cmn-icons.css` + `index.html` cheatsheet. Default technique = CSS `mask` with `-webkit-mask` fallback for
  single-colour icons, **inline-SVG snippets/sprite for stroked/multicolour** (masks can't do multi-colour or live
  stroke width). Include the forced-colors and print rules from REVIEW B3. The cheatsheet shows the copyable markup per icon.

## 4. Audit & alerts (scan-time, read-only) — click a row → select + zoom on canvas

`figma.currentPage.selection = [node]; figma.viewport.scrollAndZoomIntoView([node])`
(use `figma.setCurrentPageAsync` first if the node is on another page). Each finding has severity; **errors block export
by default** (overridable per icon), warnings/info don't.

| Rule | Severity | Why |
|---|---|---|
| Name: duplicate / empty / non-ASCII / uppercase / spaces / contains `icon` / variant-style (`Property 1=…`) | error/warn | naming grammar §3.2 |
| Not a component (loose frame) / detached instance | warn | no `componentKey` for design↔code join |
| Stroke alignment inside/outside, variable-width, or dash that can't be live | warn | not editable in code |
| Fills/strokes not bound to a variable; off-palette hard-coded colour (e.g. `#1F1D1D`) | warn | theming drift |
| >1 distinct colour (informational: becomes colour slots) | info | |
| Effects (shadow/blur), opacity < 1, blend mode ≠ normal | warn | not representable / changes look |
| Raster image fill, text layer (font dependency) | error | not a vector icon |
| Hidden or locked layers inside, empty groups | warn | export noise |
| Mask / clipping complexity | info | works, may bloat |
| Size not equal to the library size (default 24×24), non-square, artwork outside live area, clipped | warn | grid consistency |
| Fractional coordinates / not pixel-snapped | info | blur at small sizes |
| Rotated/flipped child transforms | info | |
| Frame has a background fill / clipsContent off | warn | leaks into export |
| Component description/tags missing | info | feeds `tags` in manifest |

Rule configuration (enabled, severity, expected size, allowed colours/variables) lives in settings.

## 5. Updated MVP scope & architecture
- Read-only pipeline: detect (A4 rules from REVIEW) → audit → export strings → UI transforms (themeable SVG) → generators → ZIP.
- Removed: clone/flatten/outline, SVGO (precision rounding only), FA tuple, unicode/codepoints, per-icon Angular components.
- Kept: create-figma-plugin UI kit, resizable window (REVIEW B6), typed messaging, forge method.
- `core/` is DOM-free and takes already-parsed SVG structures; the UI layer parses with DOMParser.

## 6. Revised spike (M0) and tests
Spike on a fixture file (read-only), checking `exportAsync` fidelity for: stroke-only icon (centre/inside/outside),
multi-path multi-colour, evenodd hole, mask, rotated child, padded frame, variable-bound fill, component set,
instance of library component. Pass criteria:
1. Themeable SVG re-rendered (default `currentColor`) pixel-matches Figma's PNG export.
2. Stroke width change via `--cmn-icon-stroke-width` visibly changes a centred-stroke icon.
3. Generated Angular compiles (`ng build`) **and renders** (Playwright screenshot diff) – a check that catches escaped-markup bugs.
4. File's version history unchanged after a run.

## 7. Remaining open questions
1. Multi-colour **primary slot**: default = most frequent colour (by area), others secondary in layer order. OK?
2. Component sets: one icon per variant with name `<set>-<variant-values>` (e.g. `home-filled`)? Or ignore variants?
3. Library default size 24×24 and name language PT with EN tags: confirm.
4. Angular target: signals (`input()`, `@for`, Angular 17+) or classic `@Input`/`*ngFor`? Which minimum version?
5. Do you want the mask-based HTML default, or inline SVG as default and mask as the lightweight option?

---

# Addendum (round 2) — overrides §3.4 HTML default and §7 open questions

## 8. Multi-colour + Figma variables: initial approach

### 8.1 Research findings (sources at the end)
- Multi-colour theming works with **inline SVG or `<symbol>`/`<use>` sprites** using per-path CSS variables:
  `fill="var(--slot, fallback)"`. CSS custom properties inherit into `<use>` shadow content, so sprites can be
  multi-colour; but any *hard-coded* fill inside the symbol removes outside control of that path.
- `mask-image` is alpha-only: one layer = one colour. It can never be multi-colour and can't carry live strokes.
- No source confirms that Figma's `exportAsync` SVG keeps variable bindings. Treat it as **not preserved** (resolved hex
  only) and read bindings yourself from the node tree (`node.fills[i].boundVariables.color`, `figma.variables`).
  Also reported: SVG output can change between exports and image-fill exports can contain empty `<pattern>`s, which
  reinforces the "image fill = error" audit rule.
- Variables → CSS is a known pipeline (variables API → `:root` / `[data-theme]` per mode); we only need *names*, not values.

### 8.2 Adopted approach (v1)
1. **Slots.** Distinct paints in an icon become ordered colour slots. Slot 1 = primary (most-used by path count; ties →
   first in layer order; overridable per icon in the list). Slots 2..n = secondary.
2. **Output chain per path** (safe if any layer is undefined):
   ```
   fill="var(--cmn-icon-color, var(--color-icon-primary, currentColor))"        /* slot 1 */
   fill="var(--cmn-icon-color-2, var(--color-icon-secondary, #6B7280))"          /* slot 2 */
   ```
   - `--cmn-icon-color-N`: the icon library's own override knob (always present).
   - middle layer: the design-system token, derived from the **bound Figma variable name** by a configurable transform
     (default `color/icon/secondary` → `--color-icon-secondary`). Present only when the paint is variable-bound and
     the setting "Use design tokens" is on. If the consumer doesn't define the token, it falls through.
   - terminal fallback: `currentColor` for slot 1, the resolved hex for others (= "as drawn").
3. **Variable matching** (SVG path ↔ Figma layer) is the fragile part. Order of preference: (a) `svgIdAttribute: true` ids
   (layer names) when unique; (b) resolved hex + opacity lookup against the node tree's bound paints; (c) depth-first order.
   Ambiguity (two variables resolving to the same hex) → info alert, fall back to (c).
4. **Modes** (light/dark): not baked in. We emit token *names*; the consuming app's CSS resolves modes. Alert when a
   variable has multiple modes with different values ("icon will follow your theme").
5. Strokes follow the same chain: `stroke="var(--cmn-icon-stroke-color, var(--color-icon-primary, currentColor))"`,
   `stroke-width="var(--cmn-icon-stroke-width, 2)"`.
6. Manifest `colorSlots` records slot, CSS var, token name, Figma variable id/name, default hex.
7. Audit: unbound hard-coded paint (e.g. `#1F1D1D`) = warning; bound variable missing from the configured token map = info.

**Spike tests to add:** `var()` as a presentation attribute vs `style="fill:var(…)"` across Chrome/Safari/Firefox; icon
with 2–3 colours with and without variables; same hex from two variables; variable with light/dark modes; nested
instance with a fill override (`boundVariables` on the instance vs the main component).

### 8.3 Future experiments (tagged, not v1)
- `light-dark()` / `color-scheme` fallbacks instead of token names; `color-mix()` for derived tints (`--cmn-icon-color-2`
  = `color-mix(in srgb, currentColor 40%, transparent)`) to make duotone from a single colour.
- Per-slot opacity vars (`--cmn-icon-opacity-2`), `@property`-registered vars for animation.
- Export the variables themselves (`tokens.css` per mode) so the icon pack is self-contained.
- Layer-name convention for explicit slots (e.g. layer `…/accent`) as an override to auto-detection.
- Style Dictionary / Tokens Studio compatible token mapping.
- Gradient support via `<linearGradient>` with `stop-color: var(…)`.
- Non-web targets (React Native, Android Vector Drawable, SwiftUI) can't use CSS vars: need per-slot props instead.

## 9. Variants
Each variant becomes its own icon. Name = `<set>-<values>` in property order, values only, kebab-case:
`Home` + `Style=Filled` → `home-filled`; `Size=16, Style=Outline` → `home-16-outline`.
Configurable ignore list for values like `default`. Collisions after folding are errors. `componentKey` is per variant
(manifest keeps `set` and `properties` for agents).

## 10. Library size & grid: detect first, override manually
- On scan, compute the **modal frame size** (W×H) across icons and report it: "Detected 24×24 (13 of 14 icons)".
  Outliers get a warning and a zoom-to link.
- Also infer **live area/padding** from artwork bounds relative to the frame (min padding across icons; sample set uses 1 px).
- Settings: *Library size* = Auto (default) / manual W×H; *Live-area padding* = Auto / manual; optional allowed
  sizes list (e.g. 16, 20, 24, 32) for multi-size libraries, in which case size becomes part of validation per set.
- The chosen size is written to the manifest (`grid: { size: 24, padding: 1 }`) and used as the default `--cmn-icon-size`
  basis and in audit rules (off-grid, non-square, outside live area).

## 11. Angular: both flavours
Generator option `Angular style`: **Modern** (≥17.1: signal `input()`, `@for`, standalone, OnPush) and **Classic**
(≥14: standalone, `@Input()`, `*ngFor`, OnPush). Default: emit both into `angular/` and `angular-classic/` so teams pick;
NgModule-only (<14) is out of scope. The shared `icons.ts` data + `CmnIconName` type is identical in both.
Generated README states the supported ranges. CI compiles and renders both in sample apps (Angular 14/16 and 17+/latest).

## 12. What the mask technique is (and the other three), plainly
All four ways to put an SVG on a page:

| Technique | How it works | Multi-colour | Live stroke width | Recolour from CSS | Notes |
|---|---|---|---|---|---|
| **Inline SVG** | `<svg>…</svg>` pasted in the HTML/template | ✅ via `var()` | ✅ | ✅ | Most control, repeats markup. Best for Angular components. |
| **Sprite + `<use>`** | one file/block of `<symbol id>`; page has `<svg><use href="#id"/></svg>` | ✅ via inherited `var()`; hard-coded fills block it | ✅ | ✅ (inheritance only) | Not old: it's what many design systems ship. External file needs same-origin/server (fails on `file://`). |
| **CSS `mask`** | an empty `<i>` gets `background-color: currentColor` and the SVG is used as a **stencil**: `mask: url("data:image/svg+xml,…") center/contain no-repeat`. Only the SVG's shape (alpha) shows through the coloured background. | ❌ one colour | ❌ | ✅ colour only | Very tidy markup and class-based (`<i class="cmn-icon cmn-icon--home">`), but invisible to assistive tech and in forced-colors unless handled (REVIEW B3). |
| `<img>` / `background-image` | SVG as an image | ❌ | ❌ | ❌ | Not themeable; decorative only. |

**Decision:** `<use>` sprites are not obsolete, they are the best fit for HTML. HTML export default =
**sprite**; mask is an optional extra file `cmn-icons-mask.css` for single-colour, class-only usage.
Inline snippets are in the manifest/test page for copy-paste. (This replaces §3.4's mask-first HTML.)

- Default HTML markup: `<svg class="cmn-icon" aria-hidden="true" focusable="false"><use href="cmn-sprite.svg#audio-descricao"/></svg>`
- Naming grammar stays: sprite symbol id = `<name>` (`#audio-descricao`), mask class = `cmn-icon--<name>`.
- The **test page embeds the sprite inline** (not as an external file) so it works when opened by double-click.

## 13. Test page (`index.html`) — part of the MVP export
A single self-contained file (no CDN, no network, works via `file://`, built from the manifest):
- **Search** (live, `/` focuses it): matches name, tags/aliases (PT + EN), category, original layer name; match highlighting;
  query kept in the URL hash. Filters: kind (filled/stroked/multicolor), category, has-warnings, size.
- **Grid** of icon cards (name, kind badge, warning badge) + list/compact toggle; result count; empty state.
- **Playground controls** bound to the CSS variables: size slider, colour pickers for `--cmn-icon-color` and `-color-2…`,
  stroke-width slider (enabled only for stroked icons), light/dark/forced-colors preview, background swatch.
- **Detail drawer** per icon: large preview at 16/24/32/48, the three snippets (sprite HTML, mask class, Angular modern/
  classic) with copy buttons (`execCommand` fallback), colour slots with token names, file names, audit findings.
- Keyboard accessible, a11y labels, reduced-motion respected; uses the exact same sprite/CSS shipped in the ZIP, so what
  you see is what developers get (it doubles as a visual regression artifact).
- ZIP layout updated: `svg/`, `sprite/cmn-sprite.svg`, `html/{cmn-icons-mask.css,index.html}`, `angular/`, `angular-classic/`, `icons.json`, `AGENTS.md`.

## 14. Open questions left
1. Token-name transform default (`color/icon/secondary` → `--color-icon-secondary`): do your Figma variable names and CSS token names follow that pattern? If you can share a variable collection name sample, I'll match it.
2. Primary-slot rule (most-used colour) accepted? (not answered explicitly: I assumed yes.)

Sources: [Multi-coloured SVG symbols with CSS variables](https://www.freecodecamp.org/news/lets-make-your-svg-symbol-icons-multi-colored-with-css-variables-cddd1769fca4/),
[Customizable SVG icons with CSS variables](https://codepen.io/AmeliaBR/post/customizable-svg-icons-css-variables),
[Many methods for using SVG icons](https://chenhuijing.com/blog/the-many-methods-for-using-svg-icons/),
[Inline SVG vs IMG vs sprite](https://www.allsvgicons.com/blog/inline-svg-vs-img-vs-sprite/),
[Implementing icons](https://dev.to/madsstoumann/implementing-icons-5875),
[csswg forced-colors SVG issue](https://github.com/w3c/csswg-drafts/issues/6310),
[Figma ExportSettings](https://developers.figma.com/docs/plugins/api/ExportSettings),
[Figma variables → CSS bridge](https://cdn.jsdelivr.net/npm/figma-code-agent@1.0.2/knowledge/design-tokens-variables.md).
