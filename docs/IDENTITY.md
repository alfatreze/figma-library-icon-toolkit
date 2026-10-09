# Icon identity, renames and versions (Labs): decision brief

You asked for this to be made really clear before deciding. This page explains the problem, the options, what is implemented, and what each choice costs.

## The problem in one example
A designer renames the Figma component `Search` to `Magnifier`.
- Your code uses `<cmn-icon name="search">`.
- The next export contains `magnifier` and no `search`.
- The app silently loses the icon (or fails to compile). Nobody changed the code, so nobody expected it.

**An icon's name is the public API of your library.** Renaming or deleting an icon is a *breaking change*, but Figma treats it as a normal edit.

## Options

| | A. Name is the identity (before) | B. Component key is the identity (implemented, Labs) | C. Frozen id registry (future) |
|---|---|---|---|
| How icons are matched between exports | by name | by Figma **component key** (stable across renames), name as fallback | by an id stored in the file |
| Rename in Figma | looks like *one removed + one added* (breaking, unnoticed) | detected as **renamed**; old name becomes a **deprecated alias** | same as B, no dependence on component keys |
| Delete / recreate a component | same as rename | new key → looks like remove + add (correct) | can be re-linked manually |
| Needs | nothing | icons to be **components** (frames have no key), a previous `icons.json` to compare | writes data into your file |
| Edits your Figma file | no | no | yes |
| Effort for the team | none | load last `icons.json` before exporting | high |

## What is implemented (option B)
1. Every icon in `icons.json` has `identity: { by: "componentKey", key }` (or `by: "name"` for frames) and an artwork `hash` (geometry only: recolouring does not count as a drawing change).
2. In **Export → overview → Identity & version** you load your previous `icons.json`. The tool compares and shows **added / renamed / removed / changed**.
3. It suggests a **semantic version** (stored as `libraryVersion`): removal or rename = **major**, new icon = **minor**, artwork change = **patch**.
4. Renamed icons are written to `deprecated: [{ name, replacedBy, since }]` and the old name **keeps working** for one major version:
   - Angular: `name="search"` resolves to `magnifier` (types accept both; the old one is marked deprecated).
   - SVG sprite and CSS mask: alias symbols / selectors for the old names.
5. A `CHANGELOG.md` entry is generated (prepend it to your changelog).
6. Nothing is sent anywhere; the comparison runs inside the plugin.

## What you would decide
- **Adopt B for real use?** Recommended if designers rename icons after release. Cost: one extra step per export (load last `icons.json`), and the icons must be components.
- **Deprecation window.** Aliases stay while the replacement exists and survive until the next *major* (a later export without the rename drops them). Change this rule if you want longer.
- **Variants.** Variant icons are named `<set>-<values>`; renaming a variant *value* in Figma renames those icons (breaking). Use stable variant values.
- **Where the previous `icons.json` lives.** Easiest: in the icons package repo. With **Project sync (Labs)** it is already in the repo, so a future version can read it from there automatically (not built).

## Not covered / limits
- Moving an icon between categories is never a breaking change (category is metadata).
- If a component is deleted and recreated, Figma gives it a new key: that is correctly reported as remove + add.
- Frames (no component) fall back to name matching: renames look like remove + add.
