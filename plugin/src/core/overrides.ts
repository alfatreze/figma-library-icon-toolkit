import { FormatId, Finding, OverrideClass, Settings, UsageInfo } from '../types'

export type Support = 'ok' | 'partial' | 'no'

export interface OverrideInfo {
  label: string
  /** how each export type can reproduce this override on the code side */
  support: Record<FormatId, Support>
  note: string
}

const ALL_NO: Record<FormatId, Support> = { svg: 'no', sprite: 'no', html: 'no', mask: 'no', angular: 'no', react: 'no', webComponent: 'no' }

/**
 * What can be reproduced in code, per export type.
 * - sprite / html / angular: inline SVG with CSS variables → colour, stroke weight and size are live.
 * - svg: standalone file: size is fixed by width/height; variables only work when the SVG is inlined (not <img>).
 * - mask: single-colour silhouette; no live stroke weight, no multi-colour.
 */
export const OVERRIDES: Record<OverrideClass, OverrideInfo> = {
  color: {
    label: 'Colour (fill/stroke)',
    support: { svg: 'partial', sprite: 'ok', html: 'ok', mask: 'partial', angular: 'ok', react: 'ok', webComponent: 'ok' },
    note: 'Use --{ns}-icon-color(-N). Standalone SVG only when inlined; mask classes are single-colour.'
  },
  strokeWeight: {
    label: 'Stroke weight',
    support: { svg: 'partial', sprite: 'ok', html: 'ok', mask: 'no', angular: 'ok', react: 'ok', webComponent: 'ok' },
    note: 'Use --{ns}-icon-stroke-width. Not possible with mask classes.'
  },
  size: {
    label: 'Size (instance resized)',
    support: { svg: 'partial', sprite: 'ok', html: 'ok', mask: 'ok', angular: 'ok', react: 'ok', webComponent: 'ok' },
    note: 'Use --{ns}-icon-size. Standalone SVG has a fixed width/height.'
  },
  strokeStyle: { label: 'Stroke alignment / cap / join / dash', support: ALL_NO, note: 'Not reproducible: SVG strokes are centred and use the exported style.' },
  geometry: { label: 'Nested layer position / size / rotation', support: ALL_NO, note: 'The exported artwork uses the main component geometry.' },
  opacity: { label: 'Layer opacity', support: ALL_NO, note: 'Opacity overrides are not exported; apply CSS opacity on the host instead.' },
  visibility: { label: 'Layer visibility', support: ALL_NO, note: 'Hidden/shown nested layers are not exported; model them as separate icons.' },
  effects: { label: 'Effects (shadow/blur)', support: ALL_NO, note: 'Effects are not representable.' },
  blend: { label: 'Blend mode', support: ALL_NO, note: 'Blend modes are not exported.' },
  radius: { label: 'Corner radius', support: ALL_NO, note: 'Radius overrides are not exported.' },
  swap: { label: 'Nested component swap', support: ALL_NO, note: 'The exported artwork uses the main component, not the swapped content.' },
  properties: { label: 'Component properties', support: ALL_NO, note: 'Boolean/text/instance-swap properties are not exported.' }
}

export const FORMAT_LABEL: Record<FormatId, string> = {
  svg: 'SVG files',
  sprite: 'SVG sprite',
  html: 'HTML',
  mask: 'CSS mask',
  angular: 'Angular',
  react: 'React',
  webComponent: 'Web Component'
}

export function enabledFormats(settings: Settings): FormatId[] {
  const f = settings.formats
  const out: FormatId[] = []
  if (f.svg) out.push('svg')
  if (f.sprite) out.push('sprite')
  if (f.html) out.push('html')
  if (f.mask) out.push('mask')
  if (f.angularModern || f.angularClassic) out.push('angular')
  if (f.react) out.push('react')
  if (f.webComponent) out.push('webComponent')
  return out
}

export function overrideFindings(usage: UsageInfo | undefined, settings: Settings): Finding[] {
  if (!usage) return []
  const enabled = enabledFormats(settings)
  const unsupported: { cls: OverrideClass; formats: FormatId[]; count: number }[] = []
  const partial: { cls: OverrideClass; formats: FormatId[]; count: number }[] = []
  for (const [cls, count] of Object.entries(usage.overrides) as [OverrideClass, number][]) {
    if (!count) continue
    const info = OVERRIDES[cls]
    const no = enabled.filter((f) => info.support[f] === 'no')
    const part = enabled.filter((f) => info.support[f] === 'partial')
    if (no.length) unsupported.push({ cls, formats: no, count })
    else if (part.length) partial.push({ cls, formats: part, count })
  }
  const out: Finding[] = []
  const fmt = (xs: FormatId[]) => xs.map((x) => FORMAT_LABEL[x]).join(', ')
  if (unsupported.length) {
    out.push({
      ruleId: 'override-unsupported',
      severity: 'warn',
      message: unsupported
        .map((u) => `${OVERRIDES[u.cls].label} (${u.count}× in use) not supported by ${fmt(u.formats)}`)
        .join('; '),
      fixHint: 'These overrides are lost in code. Use a dedicated icon variant instead of overriding it.',
      formats: [...new Set(unsupported.flatMap((u) => u.formats))]
    })
  }
  if (partial.length) {
    out.push({
      ruleId: 'override-partial',
      severity: 'info',
      message: partial
        .map((u) => `${OVERRIDES[u.cls].label} (${u.count}× in use) only partly supported by ${fmt(u.formats)}`)
        .join('; '),
      formats: [...new Set(partial.flatMap((u) => u.formats))]
    })
  }
  return out
}

export function describeUsage(usage: UsageInfo): string[] {
  const lines: string[] = []
  lines.push(`${usage.instances} instance${usage.instances === 1 ? '' : 's'}${usage.remote ? ' from a linked library' : ''} on ${usage.pages.length} page${usage.pages.length === 1 ? '' : 's'}`)
  if (usage.sizes.length) lines.push(`Sizes used: ${usage.sizes.join(', ')}`)
  const ov = Object.entries(usage.overrides).filter(([, n]) => n)
  if (ov.length) lines.push(`Overrides: ${ov.map(([k, n]) => `${OVERRIDES[k as OverrideClass].label} ×${n}`).join(', ')}`)
  if (usage.colors.length) lines.push(`Override colours: ${usage.colors.map((c) => c.variable ?? c.hex).join(', ')}`)
  return lines
}
