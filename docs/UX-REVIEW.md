# UX review and proposed redesign (v0.2.1)

Reviewed from the running UI (460 × 640 window, light theme) in four states: scan results (Icons tab), Issues tab, Settings and Export. Visual proposal: [`design/ux-redesign.html`](design/ux-redesign.html) (open in a browser; has a dark-mode toggle). Stage: working product, refinement.

> **Implementation status (unreleased, on `main`):** steps 1 to 7 of the plan are implemented and checked in a browser harness: stable skeleton (tabs, scan button, search field and Export button keep identical coordinates across first run, scanning and results), active states and 4-point spacing, tabbed Settings with shared format cards, S / M / L previews with hover preview and grid view, show-each-fact-once copy, consolidated Issues tab. Not done: auto-contrast preview tile, plural/i18n helper, dark-mode contrast check, replacing most remaining ⓘ tooltips with hints, a brand colour decision (the plugin follows Figma's brand token). Side effect: the UI bundle dropped from 472 KB to 328 KB because the stylesheet is now bundled once instead of once per importing file.

## Who this is for and what it must do
- **Design-system owner** (primary): scans a library, understands what is wrong, fixes it in Figma, exports a package developers trust.
- **Developer** (secondary): opens Dev Mode, copies code, downloads icons.
- **Goals the UI has to serve:** (1) understand the state of the library in seconds, (2) fix problems with confidence, (3) export the right formats without hunting for them, (4) never be surprised by a change to the Figma file.

---

## Design critique

### Overall impression
The product is capable and honest (nothing writes to the file without consent, results are real), but the UI reads like an engineering control panel: every option is visible at once, the same information appears in several places, and the things that show *where you are* (active tab, selected chip, selected segment) are too faint. The biggest opportunity is structure: put the flow **Scan → Review → Export** in the layout and move configuration out of the way, grouped by task.

### First impression (2 seconds)
- The eye lands on the **blue "Rescan page" button** at the top. After a scan it should not be the loudest element: the next step is reviewing and exporting.
- A second full-width blue button, **"Export 16 icons…"**, sits at the bottom. Two primaries of equal weight make the main action ambiguous.
- Four stacked rows above the tabs (scope control, "Only icons in use", scan button, helper text) push the results down by about 150 px.

### Usability
| Finding | Severity | Recommendation |
|---|---|---|
| **Settings is one 1,480 px scroll** with 10 sections and 43 labelled controls; "Export formats", the thing people most often change, is the last section | 🔴 Critical | Five tabs: **Output · Style · Scan · Team · Labs**, Output first, formats as cards (see mockup 3). Settings stops being a place you scroll and becomes a place you go to |
| **Formats live in two places** (Settings → Export formats, and the Export dialog rows with disabled states) | 🔴 Critical | One component rendered in both: cards with checkbox, one-line purpose and size estimate. Export shows the same cards plus "Change in Settings" |
| **Two competing primary actions** (Rescan at top, Export at bottom) | 🟡 Moderate | Before the first scan: "Scan" is primary. After: "Scan again" becomes secondary and **Export is the only primary**, in a sticky bar with the ready count |
| **Scan options are scattered**: scope segmented control, "Only icons in use" checkbox (+ ⓘ), then the helper line | 🟡 Moderate | One row: scope segmented control + button + gear. "Only icons used in designs" moves into Settings → Scan (and stays visible as a status chip when on) |
| **Issues tab repeats itself**: a summary box ("0 blocking icons · 2 alerted icons / 2 types of problem · 0 can be fixed automatically") lists the same two problems as the cards below it | 🟡 Moderate | One summary sentence, then cards. Each card: what, why it matters, *How to fix*, two actions |
| **Ⓘ tooltip on almost every control** is the primary way settings are explained; hover-only help is slow and invisible to keyboard users | 🟡 Moderate | Hint text under the control when it matters ("Matching names keep colour overrides…"); keep Ⓘ only for long explanations |
| **Jargon**: "T4 Componentised", "Strictness: Lenient", "Fix order: Remove blockers → Normalise names → …", "Include all" | 🟡 Moderate | See UX copy below |
| **Labs mixed into the flow** (the "Enable Labs" toggle sits between Team config and formats; fix actions appear in Issues) | 🟡 Moderate | Labs gets its own tab with the consequences stated once ("Can edit this file. Use a branch or a copy.") |
| Icon row meta line has up to five fragments ("Icons · used ×1 · Icon home · filled") | 🟢 Minor | One line: category · usage. Layer name and kind move to the detail view / hover |
| Empty / first-run state is just the controls | 🟢 Minor | Keep the same skeleton and explain in the content area, top-aligned; do not move or hide existing controls (mockups 6 and 7) |

### Visual hierarchy
- **What draws the eye first:** the top blue button. **Should be:** the library status ("16 icons · 2 warnings"), then the list.
- **Reading flow:** top-heavy. Controls (4 rows) → tabs → toolbar (3 rows: search + view switch, category dropdown, chips) → list. That is 7 rows of chrome before the first icon. Proposal: 2 rows above the tabs, 2 in the toolbar (search + view; chips with Category as a chip-dropdown).
- **Emphasis:** status information (tier, counts) is small grey text; decorative things (blue buttons, thumbnails) are strongest. Invert it.

### Active states (the specific complaint)
Measured in the running UI and in `src/styles.css`:
| Element | Today | Problem | Proposed |
|---|---|---|---|
| Tab | 2 px underline, same weight text | The only cue is a thin line; the label colour barely changes | 3 px underline, **bold**, brand colour, count badge tinted brand; hover tint |
| Scope / view segmented control | White pill on light grey, no other change | Looks like a hover state | Raised pill (shadow), **bold brand-coloured label** |
| Filter chip ("All 16") | Light blue fill, blue text | Disabled chips ("Blocked 0") look almost the same as inactive ones | Active = **filled brand with white text**; disabled = 45 % opacity + `not-allowed` |
| List row | No selected state at all; only a checkbox | You cannot tell which icon you looked at or located | Selected row: tint + 3 px brand bar on the left; hover tint |
| Checkbox / toggle | Default kit styling | Fine, but row-level state is missing | Keep, add row state above |
| Format (in Export/Settings) | Plain checkbox row | Enabled vs disabled differ by faint text colour | Card with brand border + soft fill when on |
| Focus | Kit default 2 px ring on some controls only | Inconsistent | One focus ring (2 px, offset 2) on every interactive element |
| Pressed | None | Buttons feel dead | `active` darkening on buttons |

### Spacing and spatial organisation
- Gutters mix 6, 8, 10 and 12 px; section gaps are 6 to 8 px. Related and unrelated things sit at nearly the same distance, so nothing groups.
- Settings uses a ragged label column (labels wrap: "Ignore variant values"), inputs of different widths, and a 12 px section title with only ~8 px separation from the previous section.
- The scrollbar gutter is carved out of the window padding (`padding: 0 8px 8px 0`), which makes the right margin uneven.
- **Proposal: a 4-point scale and a few rules.**
  - Tokens: 4 / 8 / 12 / 16 / 24. Window gutter 16. Between sections 24 (settings) or 16 (lists). Inside a card 12 × 16. Between controls in a form 12.
  - Controls are 32 px high; list rows 52 px (36 px thumbnail + two lines).
  - Forms: fixed 120 px label column, controls fill the rest, hint under the control in secondary text.
  - Group with **cards and group labels**, not with more whitespace alone.

### Consistency
| Element | Issue | Recommendation |
|---|---|---|
| Buttons | Blue primary, grey secondary, text links and icon buttons all have different heights (24 / 28) | Two heights only: 32 (default) and 36 (primary footer action) |
| Chips vs segmented vs tabs | Three selection patterns that look alike | Tabs = navigation between views, segmented = one of N for a setting, chips = filters. Distinct shapes (underline / raised pill / filled pill) |
| Terms | "Blocked / Alerts / Issues / Problems / Findings / Warnings" for the same concept; "Include / Exclude / Ready" | Use *Blocked* (won't export) and *Warnings* (exports, worth a look); *Issues* only as the tab name |
| Overlay screens | Settings, Export, Review fixes and Send are full-window overlays with different header layouts | One `Dialog` header: title left, close/done right; sticky footer for actions |

### Accessibility
- **Colour contrast:** white text on the default brand blue is about 3:1, below 4.5:1 for 11 px text. Use the plugin kit's `bg-brand`/`text-onbrand` pair only if the host theme meets 4.5:1; otherwise darken the brand in the plugin (the mockup uses `#0a6ed1`, 5.2:1). Check the warning chip (`text-warning` on `bg-warning-tertiary`) in dark mode.
- **Touch/click targets:** icon buttons are 28 px; raise to 32 px.
- **Text size:** 11 px body is the Figma plugin norm; keep it, but use 12 px for list names and form labels and keep 11 px for hints.
- **Keyboard:** dialogs now trap focus and close on Esc (done in 0.2.1); tabs support arrow keys; remaining: tooltip content is hover-only, and settings tabs need the same arrow-key behaviour.
- **State is not colour-only:** severity uses icon + text + colour (good); keep that for the new row states (bar + tint + bold).

### What works well
- The honest empty and error handling (clear messages for a missing selection, refused scans).
- Result list behaviours: include/exclude per icon, locate in Figma, filter chips with counts.
- Explaining *why* a rule matters, not only that it fired (Issues cards).
- Labs gating and the confirm-before-apply fix flow match the "never edit silently" goal.
- Light and dark themes follow Figma's tokens.

### Priority recommendations
1. **Tabbed Settings, Output first.** Five tabs, formats as cards with size estimates, one shared format component used by Settings and Export. Fixes the biggest usability problem and the one you named.
2. **Visible active states and one spacing scale.** Tabs, chips, segments, selected rows and format cards as in the table above; adopt the 4-point scale. Cheap (mostly CSS) and changes how the whole product feels.
3. **Restructure the main screen around Scan → Review → Export on one stable skeleton.** One scan row with a fixed-height status line, tabs and toolbar always present (disabled until there are results), a sticky Export bar as the only primary action. First run, scanning and results are the same layout; only the content area changes (see the layout rule above).
4. **Bigger icons and show each fact once.** 32 px icons in 52 px tiles, S / M / L, hover preview with size ladder, a real grid view; then remove the duplicated counts (Icons tab owns the number, Export button says "Export"). Together with plain-language copy and hints instead of tooltips (below).
5. **Consolidate Issues** into one summary sentence plus cards with "How to fix".

---

## Icon legibility (list and grid)

Today a list row has a 34 px tile with the icon drawn at **22 px** (`.thumb`, `src/styles.css`). Icons are the product's subject; they must be recognisable at a glance, including detailed or multi-colour ones.

| Change | Spec |
|---|---|
| Bigger list thumbnails | 52 px tile, icon at **32 px** (was 34 / 22); row height 68 px. S / M / L preview-size control next to the view switch: S = 24 px icon, M = 32, L = 48 (the row grows with it) |
| Real grid view | 3 tiles per row at 460 px, 76 px stage with the icon at **48 px**; selected tile = top bar + tint + border |
| Hover / focus preview | After 300 ms (or on keyboard focus) a popover **below** the row (never over it, flips above near the bottom): icon at 56 px and a 16 / 24 / 32 size ladder, so you see how it holds up small, with the real size label |
| Background switch | White · dark · checker, in the preview corner. White or very light icons are invisible on a light tile today; also auto-pick a contrasting tile when an icon's colours are too close to the tile |
| Rendering | Draw the exported SVG (real colours for multi-colour icons, `currentColor` for single-colour ones), `shape-rendering: geometricPrecision`, no scaling of stroke width below 1 px |
| Detail on click | Row click opens the existing detail (name, category, usage, findings); the preview is not a second source of truth |

Mockup screens 1 and 8 show the list (with the preview) and the grid.

## Say it once: no duplicated information

In the current UI the icon count appears up to seven times on one screen (status line, tab badge, "All" chip, "Select all", search placeholder, footer text, Export button). Rule: **each fact is shown once, in the place where the user needs it; every other element shows only what is new in that context.**

| Fact | Lives in | Removed from |
|---|---|---|
| Number of icons | Icons tab badge | status line, "All" chip, "Select all", search placeholder, footer text |
| Number of warnings / blocked | Issues tab badge and the Warnings / Blocked chips (filters) | status line, Issues summary repeats only "nothing blocks the export" |
| Scope (selection / page / document) | the scan control itself | helper text under it, status line |
| Grid size, tier details | Issues and Settings → Scan | main status line |
| Formats and sizes | Settings → Output cards; footer shows only "5 formats ▾" as a link | Export dialog title, button, footer text |
| What will be exported | the **Export** button: "Export" when all are selected, "Export 12 selected" otherwise | separate "ready" text |
| "Your file is never changed" | once, at first run, as a muted line | status line, helper text, every dialog |

Per-state consequences:
- **Status line** (fixed height, see the layout rule): results = "Scanned 12:04 · Library health good"; first run = "1 layer selected"; scanning = "Reading… 120 of 340" + progress; error = the error. Nothing there repeats the tabs or chips.
- **Footer:** left = "5 formats ▾" (a link to change formats); right = **Export**. Empty left side while scanning or before a scan; the button is disabled with a tooltip.
- **Export dialog:** title "Export", one summary line ("16 icons · 4 formats · 42 files · 41 KB"), button "Download ZIP". No second count in the title or button.
- **Settings → Output:** per-format size on each card; no totals footer that repeats them.
- **Tabs and chips:** counts on tabs (navigation) and on the filter chips that are subsets (Blocked, Warnings); the "All" chip carries no number.
- **Buttons:** verbs only ("Scan", "Export", "Download ZIP"); the noun and the number are already on screen.

## Layout rule: one stable skeleton (no reflow between states)

A centred first-run card, a results screen and a scanning screen that each arrange the window differently would make people re-find every control. Rule: **the window has one skeleton; states change content, never position.**

```
┌────────────────────────────────────────┐  fixed zones, top to bottom
│ Scan bar    [scope ▾────] [Scan/Cancel] ⚙│  1. right-anchored button, same y in every state
│ Status line (fixed 34 px)              │  2. text, or text + progress bar, same height
├────────────────────────────────────────┤
│ Icons n │ Issues n │ Skipped n         │  3. tabs always visible, counts 0 / – when unknown
├────────────────────────────────────────┤
│ Search · view switch                   │  4. toolbar always rendered; disabled until results
│ Chips: All · Blocked · Warnings · Cat  │
│ Select all                             │
│ ── content area (the only thing that   │  5. empty explanation, skeleton rows, or the list
│    changes between states) ──          │     starts at the top of the area, never centred
├────────────────────────────────────────┤
│ Status        [Export n icons]         │  6. sticky bar, same place; button disabled until ready
└────────────────────────────────────────┘
```

| State | Scan bar button | Status line | Toolbar | Content area | Footer |
|---|---|---|---|---|---|
| First run | **Scan selection** (primary) | "1 layer selected" | disabled, in place | top-aligned note: "Press Scan selection to list its icons… Read-only: your file is never changed." | no text · Export disabled |
| Scanning | **Cancel scan** (same spot) | "Reading… 120 of 340" + progress bar inside the fixed-height row | disabled | rows appear as they arrive, skeleton rows for the rest | no text · Export disabled |
| Results | **Scan again** (secondary) | "Scanned 12:04 · Library health good" | enabled | the list | "5 formats ▾" · **Export** |
| Nothing found | **Scan again** | "No icons found" | disabled | next steps: try Page or Document, or see Skipped | Export disabled |
| Error | **Scan again** | error message in the status row (red dot) | disabled | explanation of what to try | Export disabled |

Implementation rules that keep this true:
- Reserve space instead of adding rows: the status line has a fixed height; progress is drawn inside it, not below it.
- Anchor the scan button to the right edge; its width may change with the label but nothing to its left shifts (the scope control is the flexible element).
- Disable, don't hide: tabs, toolbar and the Export button always exist. Disabled controls use 45 % opacity and `not-allowed`, and a tooltip says why ("Scan first").
- Content that arrives later (rows, counts) fills reserved space; skeleton rows show where it will appear.
- Messages replace text in an existing slot; they never push content down. Transient messages use the status line or a toast, not a new banner.
- Mockup screens 1, 6 and 7 are the same layout in three states; measured in the browser, the tabs, scan button, search field and Export button sit at identical coordinates in all three.

## Proposed information architecture

```
Main window
 ├─ Scan bar:  [Selection | Page | Document] [Scan again] [⚙]
 ├─ Status:    ● 16 icons · 2 warnings · 24 × 24 grid · Library health good
 ├─ Tabs:      Icons · Issues · Skipped
 ├─ (content)
 └─ Sticky bar: ● 16 icons ready · 5 formats                [Export 16 icons]

Settings (dialog, 5 tabs, saved on this computer)
 ├─ Output   What to export (format cards)  ·  Package (prefix, ZIP name, folders by category)
 ├─ Style    Colour (themeable) · Design tokens · Strokes · Path precision
 ├─ Scan     What counts as an icon · How strict · Vector layer names · Categories · Duplicate names · Ignore lists
 ├─ Team     Export/import config · Publish to file (Labs) · Figma file URL · Dev resource link
 └─ Labs     Turn on · Branch acknowledgement · Composite frames · Project sync · Support (Copy diagnostics)

Export (dialog)
 ├─ Formats (same cards, read-mostly)  ·  Version (suggested, compared with…)  ·  Footer: Download ZIP / Send to project…
```

Where today's settings go (Settings has ~45 controls):

| Tab | Controls (today's section) |
|---|---|
| Output | Export formats (9), Namespace, ZIP name, Split output by category |
| Style | Themeable colours, Path precision, Design tokens (naming mode, prefix, drop parts, mapping, Fill from scan), Strokes (policy, table, convert to paths) |
| Scan | Scan mode, Max icon size, Library size, Strictness, Vector layer name (+fallback), Duplicate names, Share artwork for duplicates, Category from, Ignore folders, Ignore variant values, "Only icons used in designs" |
| Team | Export / import config, Publish to file, Figma file URL, Dev resource link (moved out of Labs), Attach dev resources |
| Labs | Enable Labs, Branch acknowledgement, Composite frames, Project sync, Copy diagnostics |

Principles: formats first; frequent before rare; each tab fits in about one screen (≤ 8 controls above the fold); "More options" disclosure for the rest.

---

## UX copy review

### Recommended copy
**Scan button:** "Scan page" (first time) → "Scan again" (after)
**Helper under scan (first run):** "Looks at every layer on this page. Your file is never changed."
**Status line (results):** "Scanned 12:04 · Library health good" (counts live on the tabs and chips)
**Select all:** "Select all"
**Search:** placeholder "Search"
**Footer:** "5 formats ▾" · **Export** (becomes **Export 12 selected** when some are deselected)
**Warning chip:** "Warnings 2"; **Blocked chip tooltip:** "Won't be exported until fixed."
**Issues summary:** "2 warnings. None can be fixed automatically." (status line already says nothing blocks the export)
**Issue card:** *Shadow or blur effect* · "Effects can't be themed, so the export draws the icon without them." · **How to fix:** "Remove the effect in Figma, then scan again."
**Fix order link:** "Suggested order for fixing a whole library"
**First run (content area, top-aligned):** "Press Scan selection to list its icons. Choose Page or Document to look wider." + muted "Read-only: your file is never changed."
**First run (status line):** "1 layer selected"
**Scanning:** "Reading… 120 of 340" · button "Cancel scan"
**Disabled Export:** no extra text; tooltip "Scan first" / "Available when the scan finishes"
**Empty state (nothing found):** "No icons found. Try Page or Document, or check Skipped for layers that were left out."
**Export dialog title:** "Export"; summary line "16 icons · 4 formats · 42 files · 41 KB"; **Primary:** "Download ZIP"; **Secondary:** "Send to project folder…"
**Settings header note:** "Saved on this computer. Nothing is written to your Figma file."

### Alternatives for the scope helper line
| Option | Copy | Tone | Best for |
|---|---|---|---|
| A | "Looks at every layer on this page. Your file is never changed." | Reassuring | Default |
| B | "Scans this page. Read-only." | Terse | After the first scan |
| C | "Scans this page. Nothing in your file changes." | Plain | If A wraps in a narrow window |

### Settings labels (current → proposed)
| Today | Proposed | Why |
|---|---|---|
| Strictness: Lenient / Standard / Strict | **Audit level:** Relaxed / Standard / Strict + hint "Strict turns missing components and default layer names into errors." | "Strictness" of what? |
| Vector layer name: Detect from file / Fixed; "Fallback name" | **Standard name for vector layers:** Detect from file / Always use…; hint "Matching names keep colour overrides when designers swap icons." | Explains the benefit, drops "fallback" |
| Duplicate names: Block / Category / Number | **Same name twice:** Stop export / Add category / Add number | Says the consequence |
| Ignore folders | **Folders to ignore in names** with hint "“icon/Home” becomes home, not icon-home" | Example beats definition |
| Ignore variant values | **Leave out of names:** `default` | |
| Library size: Auto-detect / Manual | **Grid size:** Detect / Set manually | "Library size" is ambiguous |
| Naming approach: Variable path (default) | **CSS variable names:** From Figma variable path / Include collection / Custom table / None | The setting is about output names |
| Themeable colours (CSS variables) | **Let developers change colours with CSS** | Benefit first |
| Path precision: 3 decimals | **Path detail:** 3 decimals (smaller files with fewer) | |
| Export formats | **What to export** | Task language |
| Enable Labs / experimental | **Turn on Labs** · "Can edit this Figma file. Work in a branch or a copy." | States the risk once, where it matters |
| Team config | **Share settings with your team** | |
| Support / Copy diagnostics | **Copy diagnostics for a bug report** | |

### Dialogs and states
| Context | Today | Proposed |
|---|---|---|
| Confirm fixes | "Review N fixes" | **"Apply 3 fixes?"** body: "This changes layers in this file. Undo with Cmd/Ctrl+Z." Buttons: **Apply 3 fixes** / **Cancel** |
| Scan refused | "A scan is already running." | "A scan is already running. Wait for it to finish, or cancel it." |
| Scan cancelled | (none) | "Scan stopped. 120 icons found so far." |
| Export done | "Exported 16 icons (97 files)" | "Downloaded 97 files" |
| Send to project success | "Written to your project folder" | "Sent 97 files to icons/. Review the changes in your repo before committing." |
| Companion unreachable | "Cannot reach the companion at … Is it running (node tools/icon-sync.mjs --dir …)?…" | "Can't reach the project helper at localhost:5199. Start it with `node tools/icon-sync.mjs --dir <project>`, then try again." |
| Tooltips | Long paragraphs | ≤ 2 sentences; example first |

### Rationale
Labels name the user's task or the outcome ("What to export", "Same name twice") instead of the implementation ("Naming approach", "Duplicate names policy"). Every destructive or file-changing action says what changes and how to undo it. Hints replace tooltips where the user decides something. One term per concept: **Blocked** (won't export), **Warnings** (exports, worth a look), **Issues** (the tab).

### Localization notes
- Avoid idioms ("sensible default"); keep sentences short; buttons grow 30 to 40 % in German and Portuguese, so keep labels under about 18 characters and let the footer buttons wrap or shrink.
- Counts need plural forms (use `Intl.PluralRules`; today `plural()` is English-only).
- Keep technical tokens (`--cmn-icon-color`, file names) in code font and untranslated.

---

## Implementation plan
| Step | Scope | Effort | Files |
|---|---|---|---|
| 1 | Spacing tokens + active/hover/pressed/focus states (CSS only) | S | `styles.css` |
| 2 | `SettingsTabs` component and the five-tab regrouping; shared `FormatCards` used by Settings and Export | M | `ui/Settings.tsx` split into `ui/settings/*`, `ui/ExportPanel.tsx` |
| 3 | Main screen on the stable skeleton: one scan row, fixed-height status line, always-present tabs/toolbar, sticky export bar, first-run and scanning content states | M | `ui.tsx`, `ui/` |
| 4 | Copy pass (labels, hints, issue cards, dialogs); hints replace most Ⓘ | S | `core/rules.ts`, `ui/*` |
| 5 | Issues tab consolidation | S | `ui.tsx`, `ui/Fixes.tsx` |
| 6 | Plural/i18n helper, 32 px icon buttons, contrast check in both themes | S | `ui/util.ts`, `styles.css` |
| 7 | Icon legibility: 52 / 32 px list thumbnails, S / M / L control, grid view at 48 px, hover/focus preview with size ladder and background switch; remove duplicated counts (status line, "All" chip, "Select all", footer text, Export button) | M | `ui.tsx` (`Thumb`, `Card`), `styles.css` |

Verification: re-run the browser harness (light and dark) for the five screens, and add a check that the tabs, scan button, search field and Export button keep the same coordinates across first run, scanning and results; check keyboard order and 4.5:1 contrast on the brand button and warning chips; the existing unit tests must stay green (the pure selectors and hooks are unaffected).

## Open questions for you
1. Should formats be editable in **both** Settings and the Export dialog (proposed, one shared component), or only in Settings?
2. Is "Library health" (tier T1 to T5) something designers care about? If not, drop it from the status line and keep it in Issues.
3. Brand colour: follow Figma's `bg-brand` token as is, or use a darker blue in the plugin for text contrast?
