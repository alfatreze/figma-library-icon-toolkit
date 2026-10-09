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
| V14 **new** | Publish to a repository: `networkAccess.allowedDomains` lets the plugin iframe call api.github.com and gitlab.com (CORS and token header) | Settings → Output → Test connection on a throwaway repo, for GitHub and GitLab | |
| V15 **new** | Token naming modes produce the names your CSS defines | compare with your tokens | |

| V16–V20 **new** | See `DECISIONS-v4.md` (manifest with vscode/preferences, shared config as viewer, branch merge, preferences, React render) | |

## Added after v0.1.0 (all unverified inside Figma; the code paths are covered by mock-based tests, which encode our assumptions about the API)
| # | Check | How | Result |
|---|---|---|---|
| V21 | Manifest accepted with `capabilities: [codegen, vscode, inspect]` and the `webcomponent` codegen language. If rejected, remove `inspect` first | import manifest | |
| V22 | Inspect panel opens in Dev Mode, `figma.mode === 'inspect'`, selection events arrive, `UI_READY` handshake works, ZIP downloads | Dev Mode → plugin panel on a frame with icons | |
| V23 | Inspect panel uses the config published in the file for a viewer who never ran the plugin | open as another user/viewer | |
| V24 | Selecting a **component** (not an instance) in Dev Mode lists it (scan treats selected components as icons even with usage-only) | select main component | |
| V25 | `addDevResourceAsync` / `getDevResourcesAsync` on COMPONENT nodes: links appear in Dev Mode, re-running adds nothing, one undo | Labs → Dev resources → Attach | |
| V26 | Shared baseline: written to root and first page (chunked 90 kB), survives a branch merge, readable by another user; local baseline is keyed by file identity (fileKey absent for public plugins) | export, reopen, branch, merge | |
| V27 | Repo baseline: reading `<folder>/icons.json` from the default branch through the host API | Export → Version → Read from the repository | |
| V32 **new** | Publish end to end on a throwaway repo: plan matches the repo, one branch, one commit, pull / merge request opens, default branch untouched, second publish sends only changes, removed icons are deleted only if previously published | Export → Publish to repository…, GitHub and GitLab; try a repo with more than 600 icons for the chunked upload | |
| V33 **new** | Token handling: not present in a published config, an export, diagnostics or the network log of any other host; revoking the token gives the "did not accept the token" message | Settings → Copy diagnostics; browser devtools network tab | |
| V34 **new** | Outputs: two outputs on one repository (different folders, different packages) publish as one branch and one request; overlapping folders block Publish; a saved v0.4 repository and token appear as one output | Settings → Output → Add output; Export → Publish | |
| V28 | Replace-with-instance in an **auto-layout** parent: order, sizing (FILL/FIXED), absolute children, reactions kept, name kept; no stray instance on failure | fixture screens (V6 extended) | |
| V29 | Variable matching by order: SVG paint order equals Figma tree order for nested groups, boolean ops, mixed fills/strokes. When the sequences differ the hex fallback is used (and ambiguous hexes get no variable) | icons with 2 variables of the same hex; icons with hidden layers | |
| V30 | Code Connect: `npx figma connect publish` accepts the generated `code-connect/` folder (Organization/Enterprise plan) | run the CLI in a test repo | |
| V31 | Generated code in a real app: Angular lazy category chunk loads and renders by name; `[icon]` tree-shaking leaves only used icons in the bundle (check with a production build) | sample app | |

