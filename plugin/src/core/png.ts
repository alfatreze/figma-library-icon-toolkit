import { Icon, PngColour, PngRow, RawIcon } from '../types'

/**
 * PNG export rows, modelled on Figma's export section: every row has a size (a Figma constraint), a suffix and a colour, and gives one file
 * per icon. The plan here is pure (which files, how big, which icons are skipped and why); drawing the pixels is `ui/png.ts`.
 * Everything typed by the user or read from the file is validated here before it reaches a file name or an SVG.
 */

/** the largest side we draw, so one typo (9999x) cannot exhaust memory */
export const MAX_PNG_SIDE = 4096

export type PngSize = { type: 'scale'; value: number } | { type: 'width' | 'height'; value: number }

/** "2x", "0.5x", "512w", "512h" as in Figma; one dimension only, the other follows the icon's proportions */
export function parseSize(input: string): PngSize | null {
  const t = input.trim().toLowerCase()
  let m = /^(\d{1,2}(?:\.\d{1,2})?)x$/.exec(t)
  if (m) {
    const value = parseFloat(m[1])
    return value > 0 && value <= 32 ? { type: 'scale', value } : null
  }
  m = /^(\d{1,4})([wh])$/.exec(t)
  if (m) {
    const value = parseInt(m[1], 10)
    return value > 0 && value <= MAX_PNG_SIDE ? { type: m[2] === 'w' ? 'width' : 'height', value } : null
  }
  return null
}

/** the pixel size of an icon for a size entry, or null when it is empty or larger than MAX_PNG_SIDE */
export function pixelSize(width: number, height: number, size: PngSize): { w: number; h: number } | null {
  if (!(width > 0) || !(height > 0)) return null
  const f = size.type === 'scale' ? size.value : size.type === 'width' ? size.value / width : size.value / height
  const w = Math.round(width * f)
  const h = Math.round(height * f)
  return w >= 1 && h >= 1 && w <= MAX_PNG_SIDE && h <= MAX_PNG_SIDE ? { w, h } : null
}

/** only characters that are safe in a file name; this is what the suffix becomes */
export const cleanSuffix = (s: string): string => s.replace(/[^A-Za-z0-9@._-]/g, '').slice(0, 40)

/** "#abc" / "#AABBCC" → "#aabbcc"; anything else → null */
export function normaliseHex(input: string): string | null {
  const t = input.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(t)) return t
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t)
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : null
}

/** a Figma export constraint as the text a person would type */
export function constraintText(c: { type?: unknown; value?: unknown }): string | null {
  if (typeof c.value !== 'number' || !Number.isFinite(c.value)) return null
  const v = Math.round(c.value * 100) / 100
  const text = c.type === 'SCALE' ? `${v}x` : c.type === 'WIDTH' ? `${v}w` : c.type === 'HEIGHT' ? `${v}h` : null
  return text && parseSize(text) ? text : null
}

/** the distinct PNG export settings found on the scanned layers, in the order they were met; used as the starting rows */
export function rowsFromFigma(raws: Pick<RawIcon, 'pngExports'>[], newId: () => string): { rows: PngRow[]; icons: number } {
  const seen = new Set<string>()
  const rows: PngRow[] = []
  let icons = 0
  for (const r of raws) {
    if (!r.pngExports?.length) continue
    icons++
    for (const e of r.pngExports) {
      const size = e.size.trim().toLowerCase()
      const suffix = cleanSuffix(e.suffix)
      if (!parseSize(size)) continue
      const k = `${size}|${suffix}`
      if (seen.has(k)) continue
      seen.add(k)
      rows.push({ id: newId(), size, suffix, colour: { kind: 'drawn' } })
    }
  }
  return { rows: rows.slice(0, 12), icons }
}

/** one colour a row can use, offered in the dropdown: a variable in one mode, with the colour it has there */
export interface PngColourOption {
  colour: Extract<PngColour, { kind: 'variable' }>
  hex: string
}

export interface ScanVariable {
  variable: string
  collection?: string
  /** the colour of the variable's first use when it has a single mode */
  hex?: string
  modes?: Record<string, string>
}

export function colourOptions(vars: ScanVariable[]): PngColourOption[] {
  const out: PngColourOption[] = []
  for (const v of [...vars].sort((a, b) => (a.collection ?? '').localeCompare(b.collection ?? '') || a.variable.localeCompare(b.variable))) {
    const base = { variable: v.variable, collection: v.collection ?? '' }
    if (v.modes && Object.keys(v.modes).length) {
      for (const [mode, hex] of Object.entries(v.modes)) {
        const h = normaliseHex(hex)
        if (h) out.push({ colour: { kind: 'variable', ...base, mode }, hex: h })
      }
    } else {
      const h = v.hex ? normaliseHex(v.hex) : null
      if (h) out.push({ colour: { kind: 'variable', ...base, mode: '' }, hex: h })
    }
  }
  return out
}

/** the hex a colour stands for: null for "as drawn", undefined when a variable is not in the scan (anymore) */
export function resolveColour(c: PngColour, options: PngColourOption[]): string | null | undefined {
  if (c.kind === 'drawn') return null
  if (c.kind === 'hex') return normaliseHex(c.hex) ?? undefined
  return options.find((o) => o.colour.variable === c.variable && o.colour.collection === c.collection && o.colour.mode === c.mode)?.hex
}

/** The icon can be recoloured: one colour (any number of opacities), no gradient, and the colour is still a CSS variable fallback (themeable colours on). */
export function canRecolour(icon: Icon): boolean {
  return icon.svgOk && icon.slots.length === 1 && icon.kind !== 'multicolor' && icon.standalone.includes('currentColor') && !/="url\(/.test(icon.standalone)
}

export interface PngItem {
  path: string
  icon: Icon
  rowId: string
  w: number
  h: number
  /** the colour to draw in, or null for the colour the icon has in Figma */
  hex: string | null
}

export interface PngPlan {
  items: PngItem[]
  /** icons a coloured row could not draw (several colours, a gradient, themeable colours off) */
  skipped: { name: string; rowId: string; reason: string }[]
  /** rows or file names that cannot be used; the export is blocked while there are any */
  problems: { rowId?: string; text: string }[]
}

const SKIP_MANY = 'several colours or a gradient: exported only on rows set to “as drawn”'
const SKIP_FIXED = 'its colours are fixed in the export (Settings → Style → Themeable colours is off): exported only on rows set to “as drawn”'

export function planPng(icons: Icon[], rows: PngRow[], options: PngColourOption[], fileBase: (icon: Icon) => string): PngPlan {
  const plan: PngPlan = { items: [], skipped: [], problems: [] }
  const taken = new Map<string, string>() // path → "icon + row" that owns it
  const usable = icons.filter((i) => i.svgOk)
  for (const [n, row] of rows.entries()) {
    const label = `Row ${n + 1}`
    const size = parseSize(row.size)
    if (!size) {
      plan.problems.push({ rowId: row.id, text: `${label}: “${row.size.trim() || '(empty)'}” is not a size. Use 2x, 512w or 512h.` })
      continue
    }
    const hex = resolveColour(row.colour, options)
    if (hex === undefined) {
      plan.problems.push({ rowId: row.id, text: `${label}: ${row.colour.kind === 'hex' ? 'the colour is not a valid hex (#rgb or #rrggbb)' : 'the variable is not in the scan; scan again or pick another colour'}.` })
      continue
    }
    const suffix = cleanSuffix(row.suffix)
    for (const icon of usable) {
      if (hex !== null && !canRecolour(icon)) {
        plan.skipped.push({ name: icon.name, rowId: row.id, reason: icon.slots.length <= 1 && icon.kind !== 'multicolor' && !icon.standalone.includes('currentColor') ? SKIP_FIXED : SKIP_MANY })
        continue
      }
      const px = pixelSize(icon.width, icon.height, size)
      if (!px) {
        plan.problems.push({ rowId: row.id, text: `${label}: ${icon.name} would be larger than ${MAX_PNG_SIDE}px or empty at ${row.size.trim()}.` })
        continue
      }
      const path = `png/${fileBase(icon)}${suffix}.png`
      const owner = taken.get(path)
      if (owner !== undefined) {
        if (!plan.problems.some((p) => p.text.includes(`“${path}”`))) plan.problems.push({ rowId: row.id, text: `${label} writes “${path}” as well as ${owner}. Give the rows different suffixes.` })
        continue
      }
      taken.set(path, `row ${n + 1}`)
      plan.items.push({ path, icon, rowId: row.id, w: px.w, h: px.h, hex })
    }
  }
  return plan
}

/**
 * The SVG to draw for one item: the exported themed SVG with the target size and the colour set through `color` (every themeable colour
 * falls back to currentColor), and without `non-scaling-stroke`, so strokes grow with the icon like they do in Figma's own PNG export.
 */
export function svgForPng(icon: Icon, w: number, h: number, hex: string | null): string {
  const colour = normaliseHex(hex ?? icon.slots[0]?.hex ?? '#000000') ?? '#000000'
  const open = /^<svg\b[^>]*>/.exec(icon.standalone)
  if (!open) return icon.standalone
  const tag = open[0].replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '').replace(/^<svg/, `<svg width="${Math.round(w)}" height="${Math.round(h)}" style="color:${colour}"`)
  return (tag + icon.standalone.slice(open[0].length)).replace(/\svector-effect="non-scaling-stroke"/g, '')
}
