import { GridInfo, Icon, RawIcon, Settings } from '../types'

export function detectGrid(raws: RawIcon[], settings: Settings): GridInfo {
  if (settings.libSizeMode === 'manual') {
    return {
      width: settings.libWidth, height: settings.libHeight,
      count: raws.filter((r) => near(r.width, settings.libWidth) && near(r.height, settings.libHeight)).length,
      total: raws.length, padding: minPadding(raws), detected: false
    }
  }
  const counts = new Map<string, { w: number; h: number; n: number }>()
  for (const r of raws) {
    const w = round(r.width)
    const h = round(r.height)
    const k = `${w}x${h}`
    const c = counts.get(k)
    if (c) c.n++
    else counts.set(k, { w, h, n: 1 })
  }
  let best: { w: number; h: number; n: number } | null = null
  for (const c of counts.values()) if (!best || c.n > best.n) best = c
  return {
    width: best ? best.w : 0, height: best ? best.h : 0, count: best ? best.n : 0,
    total: raws.length, padding: minPadding(raws), detected: true
  }
}

function minPadding(raws: RawIcon[]): number {
  let min = Infinity
  for (const r of raws) {
    if (!r.padding) continue
    const m = Math.min(r.padding.left, r.padding.top, r.padding.right, r.padding.bottom)
    if (m >= 0 && m < min) min = m
  }
  return min === Infinity ? 0 : Math.round(min * 100) / 100
}

const round = (n: number) => Math.round(n * 100) / 100
const near = (a: number, b: number) => Math.abs(a - b) < 0.01

export type Tier = 'T5' | 'T4' | 'T3' | 'T2' | 'T1'

export const TIER_LABEL: Record<Tier, string> = {
  T5: 'Engineered',
  T4: 'Componentised',
  T3: 'Framed',
  T2: 'Loose',
  T1: 'Haphazard'
}

export function iconTier(icon: Icon, raw: RawIcon): Tier {
  if (icon.findings.some((f) => f.severity === 'error' && ['raster-fill', 'text-layer', 'auto-name', 'empty'].includes(f.ruleId))) return 'T1'
  if (raw.sourceKind === 'loose') return 'T2'
  if (raw.sourceKind === 'frame') return 'T3'
  const bound = raw.facts.paints.length > 0 && raw.facts.paints.every((p) => !!p.variable)
  if ((raw.sourceKind === 'component-set' || Object.keys(raw.variantProps).length > 0) && bound && raw.description.trim()) return 'T5'
  return 'T4'
}

/** The library tier is the highest tier reached by at least `share` of icons. */
export function libraryTier(tiers: Tier[], share = 0.8): Tier {
  if (!tiers.length) return 'T1'
  const order: Tier[] = ['T5', 'T4', 'T3', 'T2', 'T1']
  for (const t of order) {
    const reached = tiers.filter((x) => order.indexOf(x) <= order.indexOf(t)).length
    if (reached / tiers.length >= share) return t
  }
  return 'T1'
}
