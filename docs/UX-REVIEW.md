# UX review and proposed redesign (v0.2.1)

Reviewed from the running UI (460 × 640 window, light theme) in four states: scan results (Icons tab), Issues tab, Settings and Export. Visual proposal: [`design/ux-redesign.html`](design/ux-redesign.html) (open in a browser; has a dark-mode toggle). Stage: working product, refinement.

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
| Empty / first-run state is just the controls | 🟢 Minor | A short explanation and one button (mockup 6) |

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
3. **Restructure the main screen around Scan → Review → Export.** One scan row with a status line, a sticky Export bar as the only primary action, a real first-run state.
4. **Plain-language copy and hints instead of tooltips** (below).
5. **Consolidate Issues** into one summary sentence plus cards with "How to fix".

---

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
**Status line:** "16 icons · 2 warnings · 24 × 24 grid · Library health: good"
**Select all:** "Select all 16"
**Footer:** "16 icons ready · 5 formats" / **Export 16 icons**
**Warning chip:** "Warnings 2"; **Blocked chip tooltip:** "Won't be exported until fixed."
**Issues summary:** "2 warnings affect 2 icons. Nothing blocks the export. None can be fixed automatically."
**Issue card:** *Shadow or blur effect* · "Effects can't be themed, so the export draws the icon without them." · **How to fix:** "Remove the effect in Figma, then scan again."
**Fix order link:** "Suggested order for fixing a whole library"
**Empty state (first run):** "Find and export your icons. Choose where to look, then scan. Your file is never changed."
**Empty state (nothing found):** "No icons found. Try Page or Document, or check Skipped for layers that were left out."
**Export dialog title:** "Export 16 icons"; **Primary:** "Download ZIP · 16 icons, 42 files"; **Secondary:** "Send to project folder…"
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
| Export done | "Exported 16 icons (97 files)" | "Downloaded 16 icons · 97 files" |
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
| 3 | Main screen: one scan row, status line, sticky export bar, first-run state | M | `ui.tsx`, `ui/` |
| 4 | Copy pass (labels, hints, issue cards, dialogs); hints replace most Ⓘ | S | `core/rules.ts`, `ui/*` |
| 5 | Issues tab consolidation | S | `ui.tsx`, `ui/Fixes.tsx` |
| 6 | Plural/i18n helper, 32 px icon buttons, contrast check in both themes | S | `ui/util.ts`, `styles.css` |

Verification: re-run the browser harness (light and dark) for the five screens; check keyboard order and 4.5:1 contrast on the brand button and warning chips; the existing unit tests must stay green (the pure selectors and hooks are unaffected).

## Open questions for you
1. Should formats be editable in **both** Settings and the Export dialog (proposed, one shared component), or only in Settings?
2. Is "Library health" (tier T1 to T5) something designers care about? If not, drop it from the status line and keep it in Issues.
3. Brand colour: follow Figma's `bg-brand` token as is, or use a darker blue in the plugin for text contrast?
