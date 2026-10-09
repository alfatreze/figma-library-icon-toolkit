# Problem detection and fixes: research, catalogue and fixes

> **Update:** this is no longer a separate scan or mode. The same single scan that finds icons also runs these checks (one traversal, one SVG export per layer); problems appear in **Issues**, and the ones with an automatic fix show a **"review with preview"** list there.

## What the Figma community and API say

| Problem | What is known | Source |
|---|---|---|
| Detached instances leave no trace in the UI | Historically a detached instance is "just a frame"; people relied on version history, hidden "signature" shapes, or plugins that scan the file. | [Figma forum: how to find detached nodes](https://forum.figma.com/t/how-to-find-detached-nodes/10755/6) |
| **The Plugin API now records it** | Frames expose `detachedInfo`: `{type:'local', componentId}` or `{type:'library', componentKey}`. This makes detection exact (no guessing) and gives the exact component to re-attach to. | [DetachedInfo](https://developers.figma.com/docs/plugins/api/DetachedInfo) (also in `@figma/plugin-typings` 1.141) |
| Existing tools | Finders/re-linkers exist (e.g. Fix Your Mess, Linkit, Master); none documented as matching by vector geometry. | [Fix Your Mess](https://neuron.notion.site/How-we-created-the-Fix-Your-Mess-b887901ea09e42e8b40bab14e8ba0707), [Linkit](https://forum.figma.com/showcase-your-work-14/new-plugin-linkit-to-link-instances-back-to-master-components-45449) |
| Replacing a node with an instance | No built-in "replace"; create the instance, copy placement, remove the old node. `swapComponent` preserves overrides with Figma's own heuristics. | [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/) |
| **Overrides survive a swap only if layer names match** | Figma keeps a change on swap only when the layer names of the current and target instance match; icons need the same vector layer name across the library, ideally one layer. | [Forum: instance-swapped icons](https://forum.figma.com/t/instance-swapped-icons-dont-preserve-across-variants/91759), [Forum: every icon best practice](https://forum.figma.com/ask-the-community-7/every-icon-best-practice-you-need-to-know-18030) |
| Overridden nested icons stop following the main component | Once an instance icon is swapped or recoloured it no longer inherits later main changes; "Reset all changes" reveals overrides; "Fix instance overrides" (Quick Actions) repairs some cases. | [Forum: preserve overrides](https://forum.figma.com/suggest-a-feature-11/preserve-overrides-in-instances-swapped-inside-component-11459) |
| Icon construction | Dedicated frame (not group/rectangle) of identical size, one vector layer, consistent default colour, outlined strokes if colour overrides are expected. | [All SVG Icons: create & export an icon library](https://allsvgicons.com/blog/create-export-icon-library-figma/), forum guide above |
| Comparing geometry | `vectorPaths` are relative to the node and change with edits, so normalise before comparing; geometry alone is weak evidence → treat as candidates to review. | [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/) |

## Heuristics implemented

| Class | Detection | Confidence | Fix actions |
|---|---|---|---|
| **Detached, identical** | frame has `detachedInfo`; artwork signature equals the component's | high | Replace with instance · or make a new component |
| **Detached, changed** | `detachedInfo` but size/colour/shape differs | medium (size/colour) / low (shape edited) | Replace with instance (size and fill colour carried as overrides) · or make a new component |
| **Same artwork, not linked** | no `detachedInfo`, identical geometry (or same shape) to a component in scope | high / medium | Replace with instance · or new component |
| **Detached, unresolved** | `detachedInfo` points to a library component not readable here | low | Make a new component |
| **Icon frame is not a component** | icon-like frame (vector-only, ≤ max size), no match | high | Convert to component |
| **Loose icon** | group/vector/boolean/shape with no icon frame | medium | Wrap in a library-size frame, centre, convert |
| **Layer names not override-safe** | vector leaves inside a component not named `Vector`, `Vector 2`… (ordered by colour slot then z-order) | high | Rename layers |
| **Duplicate components** | identical geometry signature in several components | high | none (Figma cannot merge components): Locate and review |

Artwork signature = FNV hash of normalised path data (2 decimals) per leaf + leaf position/size inside the icon box (`geom`), and a position-free variant (`shape`).

## Safety model
- Detection is read-only. **Only applying a fix (Issues → Review & apply, Labs) can edit the file**, per fix, after a review dialog that shows before → after previews.
- All fixes in one run are one undo step (`figma.commitUndo()`), so Cmd/Ctrl+Z reverts them together.
- Each fix re-checks that the layer still exists and has the same type; nothing is applied to an unknown/stale layer.
- "Replace with instance" copies position/rotation/size/auto-layout props/opacity, carries fill colours as overrides when the leaf counts match, then removes the original. It never runs on layers inside instances.

## Not yet covered (ideas)
- Re-point instances of duplicate components to one master (`swapComponent`).
- Detect detached icons whose artwork was edited *and* renamed using fuzzy path matching.
- Outline strokes / flatten nested groups as an automatic fix (destructive; deliberately left manual).
- Library-wide naming normalisation proposals (`category/name`) applied to layers.
- Checking instance-swap component properties on parent components (nested icon slots).
