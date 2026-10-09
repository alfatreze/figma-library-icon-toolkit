import { Finding, GridInfo, Profile, RawIcon, Settings, Severity } from '../types'
import { hasCopyMarker, isAutoName, validateName } from './naming'
import { contrastRatio } from './contrast'
import { overrideFindings } from './overrides'

export interface AuditContext {
  profile: Profile
  grid: GridInfo
  name: string
  duplicate: boolean
  kindColors: number
  themedOk: boolean
  settings: Settings
}

const LIGHT_PAGE = '#ffffff'
const DARK_PAGE = '#1e1e1e'
const MIN_CONTRAST = 3

/** Severity per rule and profile. Structure rules escalate with stricter profiles. */
const STRUCTURE: Record<string, Record<Profile, Severity | null>> = {
  'not-component': { lenient: 'info', standard: 'warn', strict: 'error' },
  'unbound-color': { lenient: null, standard: 'info', strict: 'warn' },
  'theme-contrast': { lenient: null, standard: 'info', strict: 'warn' },
  'no-description': { lenient: null, standard: 'info', strict: 'warn' },
  'not-in-set': { lenient: null, standard: null, strict: 'warn' },
  'auto-name': { lenient: 'warn', standard: 'error', strict: 'error' },
  'off-grid': { lenient: 'warn', standard: 'warn', strict: 'error' }
}

function sev(rule: string, profile: Profile, fallback: Severity): Severity | null {
  const m = STRUCTURE[rule]
  return m ? m[profile] : fallback
}

export function auditIcon(icon: RawIcon, ctx: AuditContext): Finding[] {
  const out: Finding[] = []
  const add = (ruleId: string, fallback: Severity, message: string, fixHint?: string) => {
    const s = sev(ruleId, ctx.profile, fallback)
    if (s) out.push({ ruleId, severity: s, message, fixHint })
  }
  const f = icon.facts

  // blockers: not exportable as a vector icon
  if (icon.exportError) add('export-failed', 'error', `Figma could not export this node: ${icon.exportError}`)
  if (f.hasImage) add('raster-fill', 'error', 'Contains a raster image fill; icons must be vector.', 'Replace the image with vector artwork.')
  if (f.hasText) add('text-layer', 'error', 'Contains a text layer; it depends on a font.', 'Outline the text (Cmd+Shift+O) in a copy.')
  if (f.leafCount === 0) add('empty', 'error', 'No vector content found.', 'Remove or fill the empty frame.')
  if (!ctx.themedOk && !icon.exportError) add('svg-parse', 'error', 'The exported SVG could not be parsed.')

  // naming
  const nameError = validateName(ctx.name)
  if (nameError) add('invalid-name', 'error', nameError, 'Rename the layer (or the row in the plugin).')
  if (ctx.duplicate) add('duplicate-name', 'error', `Duplicate name "${ctx.name}".`, 'Give each icon a unique name.')
  if (isAutoName(icon.setName ?? icon.rawName)) add('auto-name', 'warn', 'Layer still has a default Figma name.', 'Give the layer a meaningful name.')
  if (hasCopyMarker(icon.rawName)) add('copy-name', 'warn', 'Name looks like a duplicate ("Copy").', 'Remove the copy suffix or delete the duplicate.')
  if (/^property\s*\d+\s*=/i.test(icon.rawName)) add('variant-name', 'info', 'Variant property still has the default name ("Property 1").', 'Rename the variant property (e.g. "Style").')

  // structure
  const richer = (icon.fixes ?? []).some((f) => f.kind !== 'convert-frame' && f.kind !== 'layer-names' && f.kind !== 'duplicate-component')
  if ((icon.sourceKind === 'frame' || icon.sourceKind === 'loose') && !richer) {
    add('not-component', 'info', 'Not a component, so there is no stable component key for code ↔ design mapping.', 'Convert the frame to a component.')
  }
  if (icon.sourceKind === 'component' && !icon.setName && Object.keys(icon.variantProps).length === 0) {
    add('not-in-set', 'info', 'Standalone component (not part of a variant set).')
  }
  if (!icon.description.trim() && (icon.sourceKind === 'component' || icon.sourceKind === 'component-set' || icon.sourceKind === 'instance')) {
    add('no-description', 'info', 'No component description (used as search tags in the export).', 'Add a description with comma-separated aliases.')
  }

  // content hygiene
  if (f.hasEffects) add('effects', 'warn', 'Has effects (shadow/blur) that are not representable as themeable SVG.', 'Remove effects from the icon.')
  if (f.hasBlend) add('blend-mode', 'warn', 'Uses a blend mode other than Normal.')
  if (f.hasOpacity) add('opacity', 'warn', 'Layer opacity below 100% is baked in and cannot be themed.')
  if (f.hasHidden) add('hidden-layers', 'warn', 'Contains hidden layers.', 'Delete hidden layers.')
  if (f.hasLocked) add('locked-layers', 'info', 'Contains locked layers.')
  if (f.emptyContainers) add('empty-groups', 'warn', 'Contains empty groups/frames.', 'Delete empty groups.')
  if (f.hasMask) add('mask', 'info', 'Uses a mask (exported as clip/mask, works but is heavier).')
  if (f.hasGradient) add('gradient', 'warn', 'Gradient fill cannot be themed; exported as drawn.')
  if (f.hasRotation) add('rotation', 'info', 'Contains rotated or flipped layers.')
  if (f.rootBackground) add('background', 'warn', 'The icon frame has a background fill that will leak into the export.', 'Remove the frame fill.')
  if (f.nonCenterStroke) add('stroke-align', 'warn', 'Stroke is aligned inside/outside: not editable as a live stroke in code.', 'Use centre-aligned strokes or outline them.')
  if (f.dashedStroke) add('dashed-stroke', 'info', 'Uses dashed strokes.')

  // colour
  const hardcoded = f.paints.filter((p) => !p.variable)
  if (hardcoded.length) add('unbound-color', 'info', 'Colours are hard-coded (not bound to variables).', 'Bind fills/strokes to colour variables.')
  // a colour that stays fixed in code (secondary slots, gradients) cannot follow the theme: check it on both a light and a dark page (WCAG 1.4.11, 3:1)
  if (hardcoded.length && (ctx.kindColors > 1 || f.hasGradient)) {
    const weak = new Map<string, string[]>()
    for (const p of hardcoded) {
      if (p.opacity <= 0.01) continue
      const on: string[] = []
      if ((contrastRatio(p.hex, LIGHT_PAGE) ?? 21) < MIN_CONTRAST) on.push('light')
      if ((contrastRatio(p.hex, DARK_PAGE) ?? 21) < MIN_CONTRAST) on.push('dark')
      if (on.length) weak.set(p.hex, on)
    }
    if (weak.size) {
      const list = [...weak].map(([hex, on]) => `${hex} on ${on.join(' and ')}`).join(', ')
      add('theme-contrast', 'info', `Fixed colour with low contrast (under ${MIN_CONTRAST}:1): ${list}.`, 'Bind it to a variable that changes with the theme, or pick a colour that works on both.')
    }
  }
  if (ctx.kindColors > 1) add('multicolor', 'info', `${ctx.kindColors} colours detected; exported as colour slots.`)

  // grid
  const g = ctx.grid
  if (g.width && g.height) {
    if (Math.abs(icon.width - g.width) > 0.01 || Math.abs(icon.height - g.height) > 0.01) {
      add('off-grid', 'warn', `Size ${fmt(icon.width)}×${fmt(icon.height)} differs from library size ${fmt(g.width)}×${fmt(g.height)}.`, 'Resize the frame to the library size.')
    }
  }
  if (Math.abs(icon.width - icon.height) > 0.01) add('non-square', 'info', 'Icon box is not square.')
  if (icon.padding) {
    const p = icon.padding
    if (Math.min(p.left, p.top, p.right, p.bottom) < -0.01) add('overflow', 'warn', 'Artwork extends outside the icon frame.', 'Keep artwork inside the frame.')
    else if (g.padding > 0 && Math.min(p.left, p.top, p.right, p.bottom) < g.padding - 0.01) {
      add('live-area', 'info', `Artwork is closer to the edge than the library padding (${fmt(g.padding)}px).`)
    }
  }
  out.push(...overrideFindings(icon.usage, ctx.settings))
  return out
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100)
}

