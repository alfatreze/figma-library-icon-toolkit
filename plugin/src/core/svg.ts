import { IconKind, PaintFact, SlotInfo, StrokePolicy, TokenNaming } from '../types'
import { safeViewBox, sanitizeSvgTree } from './sanitize'
import { tokenVarName } from './tokens'

export interface ThemeOptions {
  ns: string
  colorMode: 'themeable' | 'original'
  tokenNaming: TokenNaming
  strokePolicy: StrokePolicy
  precision: number
  /** resolved hex (#rrggbb) -> Figma variable (name + collection) */
  variableByHex: Map<string, { name: string; collection?: string }>
  /** paints in Figma tree order; when they line up 1:1 with the SVG's colours, variables are matched by order instead of by hex */
  paints?: PaintFact[]
}

type VarRef = { name: string; collection?: string }

/**
 * Match each SVG colour to the Figma variable bound to the same layer, by order, not by colour value.
 * Two different variables that resolve to the same hex stay apart (separate slots); an unbound paint that happens to share a hex
 * with a bound one no longer inherits the variable. Returns null when the sequences do not line up (then the hex map is used).
 */
export function alignVariables(drawables: { attr: 'fill' | 'stroke'; hex: string }[], paints: PaintFact[] | undefined): (VarRef | undefined)[] | null {
  if (!paints || paints.length !== drawables.length) return null
  const out: (VarRef | undefined)[] = []
  for (let i = 0; i < drawables.length; i++) {
    const p = paints[i]
    if (p.role !== drawables[i].attr || p.hex !== drawables[i].hex) return null
    out.push(p.variable ? { name: p.variable, collection: p.collection } : undefined)
  }
  return out
}

/** hex fallback: only when every variable-bound paint of that hex agrees, otherwise the match would be a guess */
export function unambiguousByHex(paints: PaintFact[] | undefined, fallback: Map<string, VarRef>): Map<string, VarRef> {
  if (!paints) return fallback
  const conflict = new Set<string>()
  const seen = new Map<string, string | undefined>()
  for (const p of paints) {
    if (seen.has(p.hex) && seen.get(p.hex) !== p.variable) conflict.add(p.hex)
    else seen.set(p.hex, p.variable)
  }
  const out = new Map(fallback)
  for (const h of conflict) out.delete(h)
  return out
}

export interface ThemedSvg {
  ok: boolean
  error?: string
  viewBox: string
  width: number
  height: number
  body: string
  standalone: string
  maskSvg: string | null
  slots: SlotInfo[]
  kind: IconKind
  strokeWidth: number | null
  hasGradient: boolean
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const SKIP_CONTAINERS = new Set(['defs', 'mask', 'clippath', 'pattern', 'lineargradient', 'radialgradient', 'filter', 'symbol', 'marker'])
const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000' }

export function slotVar(ns: string, index: number): string {
  return index === 1 ? `--${ns}-icon-color` : `--${ns}-icon-color-${index}`
}


export function normaliseColor(value: string | null): string | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  if (!v || v === 'none' || v === 'currentcolor' || v === 'transparent' || v.startsWith('url(') || v.startsWith('var(')) return null
  if (NAMED[v]) return NAMED[v]
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{8}$/.test(v)) return v.slice(0, 7)
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v)
  if (rgb) return '#' + [rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  return null
}

export function roundNumbers(value: string, precision: number): string {
  return value.replace(/-?\d*\.\d+/g, (m) => {
    const n = Number(m)
    if (!Number.isFinite(n)) return m
    const fixed = n.toFixed(precision)
    const s = fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed // never strip the zeros of a whole number (100 is not 1)
    return s === '-0' || s === '' ? '0' : s
  })
}

function insideSkipped(el: Element): boolean {
  let p: Element | null = el.parentElement
  while (p) {
    if (SKIP_CONTAINERS.has(p.localName.toLowerCase())) return true
    p = p.parentElement
  }
  return SKIP_CONTAINERS.has(el.localName.toLowerCase())
}

function serialiseChildren(root: Element): string {
  const ser = new XMLSerializer()
  let out = ''
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 1) out += ser.serializeToString(child)
    else if (child.nodeType === 3 && child.textContent && child.textContent.trim()) out += child.textContent
  }
  return out.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '').replace(/\n\s*/g, '')
}

function emptyResult(error: string): ThemedSvg {
  return {
    ok: false, error, viewBox: '0 0 24 24', width: 24, height: 24, body: '', standalone: '', maskSvg: null,
    slots: [], kind: 'filled', strokeWidth: null, hasGradient: false
  }
}

export function themeSvg(svgText: string, opts: ThemeOptions): ThemedSvg {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) {
    return emptyResult('Could not parse SVG exported by Figma')
  }

  sanitizeSvgTree(root)

  const width = parseFloat(root.getAttribute('width') ?? '') || 24
  const height = parseFloat(root.getAttribute('height') ?? '') || 24
  const viewBox = safeViewBox(root.getAttribute('viewBox'), `0 0 ${width} ${height}`)

  // 1. collect colours (fills + strokes) in document order
  const drawables: { el: Element; attr: 'fill' | 'stroke'; hex: string }[] = []
  let hasGradient = false
  let hasFill = false
  let hasStroke = false
  const all = Array.from(root.getElementsByTagName('*'))
  for (const el of all) {
    if (el === root) continue
    if (insideSkipped(el)) continue
    for (const attr of ['fill', 'stroke'] as const) {
      const raw = el.getAttribute(attr)
      if (raw && raw.trim().startsWith('url(')) hasGradient = true
      const hex = normaliseColor(raw)
      if (hex) {
        drawables.push({ el, attr, hex })
        if (attr === 'fill') hasFill = true
        else hasStroke = true
      } else if (raw && raw.trim().toLowerCase() === 'currentcolor') {
        if (attr === 'fill') hasFill = true
        else hasStroke = true
      }
    }
  }

  const aligned = alignVariables(drawables, opts.paints)
  const hexMap = aligned ? opts.variableByHex : unambiguousByHex(opts.paints, opts.variableByHex)
  const varOf = (i: number, hex: string): VarRef | undefined => (aligned ? aligned[i] : hexMap.get(hex))
  const keyOf = (i: number, hex: string) => `${hex}|${varOf(i, hex)?.name ?? ''}`
  const stats = new Map<string, { uses: number; first: number; hex: string; variable?: VarRef }>()
  drawables.forEach((d, i) => {
    const k = keyOf(i, d.hex)
    const s = stats.get(k)
    if (s) s.uses++
    else stats.set(k, { uses: 1, first: i, hex: d.hex, variable: varOf(i, d.hex) })
  })
  const ordered = [...stats.entries()].sort((a, b) => b[1].uses - a[1].uses || a[1].first - b[1].first)
  const slotByKey = new Map<string, number>()
  const slots: SlotInfo[] = ordered.map(([key, s], i) => {
    slotByKey.set(key, i + 1)
    const hex = s.hex
    const variable = s.variable
    return {
      index: i + 1,
      cssVar: slotVar(opts.ns, i + 1),
      hex,
      uses: s.uses,
      variable: variable?.name,
      token: variable ? tokenVarName(variable.name, variable.collection, opts.tokenNaming) ?? undefined : undefined
    }
  })

  // 2. stroke width
  const strokeWidths: number[] = []
  const strokeEls = all.filter((el) => !insideSkipped(el) && normaliseColor(el.getAttribute('stroke')) && el.getAttribute('stroke-width'))
  for (const el of strokeEls) strokeWidths.push(parseFloat(el.getAttribute('stroke-width')!))
  const strokeWidth = strokeWidths.length ? strokeWidths.sort((a, b) => a - b)[Math.floor(strokeWidths.length / 2)] : null

  // 3. build the mask (shape only) version before rewriting colours
  let maskSvg: string | null = null
  const kind: IconKind = slots.length > 1 ? 'multicolor' : hasFill && hasStroke ? 'mixed' : hasStroke ? 'stroked' : 'filled'
  if (!hasGradient && slots.length <= 1) {
    const clone = root.cloneNode(true) as Element
    const cAll = Array.from(clone.getElementsByTagName('*'))
    for (const el of cAll) {
      if (insideSkipped(el)) continue
      for (const attr of ['fill', 'stroke'] as const) {
        if (normaliseColor(el.getAttribute(attr))) el.setAttribute(attr, '#000')
      }
    }
    applyPrecision(clone, opts.precision)
    maskSvg = wrapSvg(width, height, viewBox, serialiseChildren(clone))
  }

  // 4. rewrite colours + stroke width
  const themed = opts.colorMode === 'themeable'
  if (themed) {
    for (const [di, d] of drawables.entries()) {
      const slot = slotByKey.get(keyOf(di, d.hex))!
      const info = slots[slot - 1]
      const fallback = slot === 1 ? 'currentColor' : d.hex
      const inner = info.token ? `var(${info.token}, ${fallback})` : fallback
      d.el.setAttribute(d.attr, `var(${info.cssVar}, ${inner})`)
    }
    for (const el of all) {
      if (insideSkipped(el)) continue
      const sw = el.getAttribute('stroke-width')
      const strokeVal = el.getAttribute('stroke')
      if (sw && strokeVal && strokeVal.trim().toLowerCase() !== 'none' && !strokeVal.startsWith('url(')) {
        el.setAttribute('stroke-width', `var(--${opts.ns}-icon-stroke-width, ${sw})`)
        if (opts.strokePolicy !== 'scale') el.setAttribute('vector-effect', 'non-scaling-stroke')
      }
    }
  }
  applyPrecision(root, opts.precision)

  const body = serialiseChildren(root)
  return {
    ok: true, viewBox, width, height, body, standalone: wrapSvg(width, height, viewBox, body),
    maskSvg, slots, kind, strokeWidth, hasGradient
  }
}

function applyPrecision(root: Element, precision: number): void {
  for (const el of Array.from(root.getElementsByTagName('*'))) {
    for (const attr of ['d', 'points']) {
      const v = el.getAttribute(attr)
      if (v) el.setAttribute(attr, roundNumbers(v, precision))
    }
  }
}

export function wrapSvg(width: number, height: number, viewBox: string, body: string): string {
  const w = Number.isFinite(width) ? width : 24
  const h = Number.isFinite(height) ? height : 24
  return `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="${safeViewBox(viewBox, `0 0 ${w} ${h}`)}" fill="none">${body}</svg>`
}

/** Prefix ids and their references so many icons can share one sprite/page without collisions. */
export function prefixIds(body: string, prefix: string): string {
  const ids = new Set<string>()
  body.replace(/\sid="([^"]+)"/g, (_m, id) => {
    ids.add(id)
    return _m
  })
  if (!ids.size) return body
  let out = body
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out
      .replace(new RegExp(`\\sid="${esc}"`, 'g'), ` id="${prefix}-${id}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${prefix}-${id})`)
      .replace(new RegExp(`href="#${esc}"`, 'g'), `href="#${prefix}-${id}"`)
  }
  return out
}
