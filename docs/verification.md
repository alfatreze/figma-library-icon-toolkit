# Verification checklist (run on a fixture Figma file)

Create a test file with one page per case. Record results here (pass / fail / notes). Items marked **new** were added with Labs.

| # | Check | How | Result |
|---|---|---|---|
| V1 | `var()` in SVG presentation attributes works in Safari, Firefox, Chrome, Edge | open `html/index.html` from an export, change colours/stroke | |
| V2 | Export fidelity: inside/outside strokes, masks, rotated children | fixture icons, compare with Figma PNG | |
| V3 | Variable matching: two variables with the same hex, aliases, modes | fixture icon with 2 variables | |
| V4 | Main component of a **remote** library instance is readable/exportable | product file with library instances, "Only icons in use" | |
| V5 | `detachedInfo` for frames detached from local and library components | detach icons, run Find problems | |
| V6 | Replace-with-instance: auto-layout parents, constraints, rotation, reactions | fixture screens before/after | |
| V7 | One undo (Cmd+Z) reverts a whole batch of fixes | apply 5 fixes, undo once | |
| V8 | Document scan on 5k–20k nodes: time, memory, cancel | large file | |
| V9 | Plugin runs for view-only users; Dev Mode code snippets appear | open as viewer; Dev Mode → Code | |
| V10 **new** | Manifest accepted with `editorType: [figma, dev]` + `capabilities: [codegen]` | import manifest | |
| V11 **new** | `vector-effect: non-scaling-stroke` keeps weight inside `<use>` sprites (Chrome/Safari/Firefox) | test page, stroke icon, size slider | |
| V12 **new** | "Convert strokes to paths" (`strokeGeometry`) matches Figma's own render, incl. rotated/nested layers | pixel diff vs Figma PNG | |
| V13 **new** | Composite frames (frames of instances) behave as described in Labs | library with composite icons | |
| V14 **new** | Companion sync: `devAllowedDomains` localhost call works from the plugin iframe | run `tools/icon-sync.mjs`, Test connection | |
| V15 **new** | Token naming modes produce the names your CSS defines | compare with your tokens | |

| V16–V20 **new** | See `DECISIONS-v4.md` (manifest with vscode/preferences, shared config as viewer, branch merge, preferences, React render) | |
