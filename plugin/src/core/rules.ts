export interface RuleInfo {
  title: string
  why: string
  fix: string
  step: number
}

export const STEPS: { step: number; title: string }[] = [
  { step: 1, title: 'Remove blockers' },
  { step: 2, title: 'Normalise names' },
  { step: 3, title: 'Establish the grid' },
  { step: 4, title: 'Fix strokes, effects & overrides' },
  { step: 5, title: 'Convert to components' },
  { step: 6, title: 'Group variants into sets' },
  { step: 7, title: 'Bind colours to variables' },
  { step: 8, title: 'Add metadata' }
]

export const RULES: Record<string, RuleInfo> = {
  'export-failed': { title: 'Figma could not export', why: 'Figma returned an error exporting this layer as SVG.', fix: 'Check the layer for unsupported content, then rescan.', step: 1 },
  'svg-parse': { title: 'SVG could not be read', why: 'The exported SVG was not valid.', fix: 'Rescan; if it persists, simplify the layer.', step: 1 },
  'raster-fill': { title: 'Raster image inside icon', why: 'Images cannot be themed or scaled like vectors.', fix: 'Replace the image with vector artwork.', step: 1 },
  'text-layer': { title: 'Text layer inside icon', why: 'Text depends on a font and cannot be themed as a shape.', fix: 'Outline the text (Cmd/Ctrl+Shift+O).', step: 1 },
  empty: { title: 'No vector content', why: 'There is nothing to export in this layer.', fix: 'Delete it or add artwork.', step: 1 },
  effects: { title: 'Shadow / blur effects', why: 'Effects are not representable in a themeable SVG.', fix: 'Remove effects from the icon.', step: 1 },
  'hidden-layers': { title: 'Hidden layers inside', why: 'Hidden layers add noise and can leak into exports.', fix: 'Delete hidden layers.', step: 1 },
  'empty-groups': { title: 'Empty groups / frames', why: 'They add noise to the export.', fix: 'Delete the empty groups.', step: 1 },
  background: { title: 'Frame has a fill', why: 'The frame background leaks into the export.', fix: 'Remove the frame fill.', step: 1 },
  'locked-layers': { title: 'Locked layers inside', why: 'Locked layers are exported but easy to forget.', fix: 'Unlock and review them.', step: 1 },
  'invalid-name': { title: 'Invalid name', why: 'Names must be a-z, 0-9 and "-", starting with a letter, and at most 80 characters.', fix: 'Rename the layer (or the row in the plugin).', step: 2 },
  'duplicate-name': { title: 'Duplicate name', why: 'Two icons resolve to the same name; the second would overwrite the first.', fix: 'Give each icon a unique name.', step: 2 },
  'auto-name': { title: 'Default Figma name', why: 'Names like "Frame 12" say nothing about the icon.', fix: 'Give the layer a meaningful name.', step: 2 },
  'duplicate-resolved': { title: 'Duplicate name resolved', why: 'Two icons had the same name. The plugin renamed one for the export (category prefix or number), but the new name depends on the library layout and can change.', fix: 'Rename one of them in Figma so each icon has a unique, stable name.', step: 2 },
  'copy-name': { title: 'Looks like a copy', why: '"Copy of…" usually means a duplicate or leftover.', fix: 'Remove the suffix or delete the duplicate.', step: 2 },
  'variant-name': { title: 'Default variant property name', why: '"Property 1" is not meaningful in code.', fix: 'Rename the variant property (e.g. Style).', step: 2 },
  'off-grid': { title: 'Off the library grid', why: 'Icon size differs from the library size.', fix: 'Resize the frame to the library size.', step: 3 },
  'non-square': { title: 'Not square', why: 'Icon box is not square.', fix: 'Use a square frame unless intentional.', step: 3 },
  overflow: { title: 'Artwork outside the frame', why: 'Parts of the artwork extend past the icon box.', fix: 'Keep artwork inside the frame.', step: 3 },
  'live-area': { title: 'Tighter than library padding', why: 'Artwork is closer to the edge than the rest of the library.', fix: 'Match the padding of the other icons.', step: 3 },
  'stroke-align': { title: 'Inside/outside stroke', why: 'SVG strokes are centred; these cannot stay editable in code.', fix: 'Use centre-aligned strokes, or outline them.', step: 4 },
  'dashed-stroke': { title: 'Dashed stroke', why: 'Exported as drawn; fine but check scaling.', fix: 'No action unless unintended.', step: 4 },
  opacity: { title: 'Opacity below 100%', why: 'Baked in; cannot be themed from CSS.', fix: 'Use solid colours (or a secondary colour).', step: 4 },
  'blend-mode': { title: 'Blend mode', why: 'Non-normal blend modes may render differently in code.', fix: 'Use Normal.', step: 4 },
  gradient: { title: 'Gradient fill', why: 'Gradients cannot be themed; exported as drawn.', fix: 'Use solid colours for themeable icons.', step: 4 },
  mask: { title: 'Uses a mask', why: 'Exported as SVG mask/clip: works but heavier.', fix: 'Flatten with a boolean operation if possible.', step: 4 },
  rotation: { title: 'Rotated / flipped layers', why: 'Transforms can bloat or shift exported paths.', fix: 'Apply transforms to the geometry.', step: 4 },
  'override-unsupported': { title: 'Overrides lost in code', why: 'Instances override properties that the selected export formats cannot reproduce, so code will look different from the design.', fix: 'Create a dedicated icon variant instead of overriding, or avoid the override.', step: 4 },
  'override-partial': { title: 'Overrides partly supported', why: 'These overrides work with CSS variables in some formats but not all.', fix: 'Use the sprite/Angular output for these icons.', step: 4 },
  'detached-identical': { title: 'Detached icon (same artwork)', why: 'Detached from a component but still identical: it no longer receives library updates or instance overrides.', fix: 'Replace it with an instance of the component.', step: 5 },
  'detached-match': { title: 'Same artwork as an existing component', why: 'Looks identical to a component but is not linked to it.', fix: 'Replace it with an instance of that component.', step: 5 },
  'detached-changed': { title: 'Detached icon with changes', why: 'Detached from, or very close to, a component but different (size, colour or shape).', fix: 'Replace with an instance (size and colour carried as overrides) or keep it as a new component.', step: 5 },
  'detached-unresolved': { title: 'Detached from an unavailable component', why: 'The source component lives in a library that is not available in this file.', fix: 'Enable the library, or turn the layer into a component.', step: 5 },
  'wrap-loose': { title: 'Loose icon (no icon frame)', why: 'Loose shapes have no icon box, so size and padding are inconsistent.', fix: 'Wrap in a library-size frame and make it a component.', step: 5 },
  'layer-names': { title: 'Layer names are not override-safe', why: 'Fill/stroke overrides survive an icon swap only if the layers inside have matching names.', fix: 'Rename the vector layers to the standard names.', step: 2 },
  'duplicate-component': { title: 'Duplicate components', why: 'Several components contain identical artwork.', fix: 'Keep one, swap instances to it, delete the others (Figma cannot merge components).', step: 6 },
  'not-component': { title: 'Not a component', why: 'Without a component there is no stable key to map design ↔ code.', fix: 'Convert the frame to a component.', step: 5 },
  'not-in-set': { title: 'Standalone component', why: 'Variants (filled/outline/size) are cleaner as a component set.', fix: 'Group related versions into a component set.', step: 6 },
  'unbound-color': { title: 'Colours not bound to variables', why: 'Hard-coded colours drift from the design system.', fix: 'Bind fills/strokes to colour variables.', step: 7 },
  multicolor: { title: 'Multi-colour icon', why: 'Each colour becomes a CSS slot; make sure that is intended.', fix: 'No action unless unintended.', step: 7 },
  'no-description': { title: 'No description / tags', why: 'Descriptions become search tags in the export.', fix: 'Add comma-separated aliases to the component description.', step: 8 }
}

export function ruleInfo(id: string): RuleInfo {
  return RULES[id] ?? { title: id, why: '', fix: '', step: 8 }
}
