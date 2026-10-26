import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../src/core/contrast'

/**
 * Every text-on-background pair that styles.css sets from the Figma theme tokens must stay readable in light and dark mode.
 * Pairs whose tokens are translucent (rgba) cannot be measured here and are skipped. Dark mode may override a class with a
 * `:global(.figma-dark) .x` rule; the override is applied before measuring.
 */
const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const theme = readFileSync(join(__dirname, '../node_modules/@create-figma-plugin/ui/lib/css/theme.css'), 'utf8')

const tokens = (name: string): Record<string, string> => {
  const a = theme.indexOf(name)
  const body = theme.slice(a, theme.indexOf('}', a))
  return Object.fromEntries([...body.matchAll(/--figma-color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}
const TOKENS = { light: tokens(':root .figma-light'), dark: tokens(':root .figma-dark') }

interface Pair { fg?: string; bg?: string }
/** the kit token a colour value names; `var(--ilt-x, var(--figma-color-y))` is our own darker light-mode colour with the kit token as the fallback */
const token = (v: string) => (/var\(--ilt-([\w-]+),\s*var\(--figma-color-([\w-]+)\)\)/.exec(v)?.slice(1).join('|') ?? /var\(--figma-color-([\w-]+)\)/.exec(v)?.[1])
/** our own light-mode colours, declared once in styles.css */
const ILT: Record<string, string> = Object.fromEntries([...css.matchAll(/--ilt-([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1], m[2]]))
const resolve = (mode: 'light' | 'dark', t: string): string | undefined => {
  const [own, kit] = t.includes('|') ? t.split('|') : [undefined, t]
  return mode === 'light' && own && ILT[own] ? ILT[own] : TOKENS[mode][kit]
}

/** class (last class of the selector, plus the ancestor classes to tell `.tabActive .count` from `.count`) -> fg / bg tokens */
function collect() {
  const base = new Map<string, Pair>()
  const dark = new Map<string, Pair>()
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const props = m[2]
    const bg = token(/(?:^|;|\s)background(?:-color)?:\s*([^;]+)/.exec(props)?.[1] ?? '')
    const fg = token(/(?:^|;|\s)color:\s*([^;]+)/.exec(props)?.[1] ?? '')
    if (!bg && !fg) continue
    for (const sel of m[1].split(',').map((s) => s.trim())) {
      if (/:hover|:active|:disabled|::|\[|>|\+/.test(sel)) continue
      const isDark = sel.startsWith(':global(.figma-dark)')
      const key = sel.replace(':global(.figma-dark)', '').trim()
      const target = isDark ? dark : base
      target.set(key, { ...target.get(key), ...(bg ? { bg } : {}), ...(fg ? { fg } : {}) })
    }
  }
  return { base, dark }
}

const solid = (v: string | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : null)

function measure(mode: 'light' | 'dark') {
  const { base, dark } = collect()
  const out: { sel: string; fg: string; bg: string; ratio: number }[] = []
  for (const [sel, pair] of base) {
    const merged = mode === 'dark' ? { ...pair, ...dark.get(sel) } : pair
    if (!merged.fg || !merged.bg) continue
    const f = solid(resolve(mode, merged.fg))
    const b = solid(resolve(mode, merged.bg))
    if (!f || !b) continue
    out.push({ sel, fg: merged.fg, bg: merged.bg, ratio: contrastRatio(f, b)! })
  }
  return out
}

describe('styles.css colour pairs', () => {
  it('finds the pairs (guards the parser)', () => {
    expect(measure('dark').length).toBeGreaterThan(8)
    expect(measure('dark').some((p) => p.sel === '.pillWarn')).toBe(true)
  })
  it('declare the darker light-mode colours for every tint pair they replace', () => {
    expect(Object.keys(ILT).sort()).toEqual(['text-brand-on-tint', 'text-danger-on-tint', 'text-success-on-tint', 'text-warning-on-tint'])
    const tinted = measure('light').filter((p) => ['.pillError', '.pillWarn', '.conf_high', '.countError'].includes(p.sel))
    expect(tinted).toHaveLength(4)
    expect(tinted.every((p) => p.ratio >= 4.5)).toBe(true)
  })
  it('stay readable in dark mode (4.5:1)', () => {
    const weak = measure('dark').filter((p) => p.ratio < 4.5)
    expect(weak.map((p) => `${p.sel} ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)}`)).toEqual([])
  })
  it('stay readable in light mode (4.5:1; the kit\'s own text colours on its tints are only 3.2 to 3.9:1, so those use darker ones)', () => {
    const weak = measure('light').filter((p) => p.ratio < 4.5)
    expect(weak.map((p) => `${p.sel} ${p.fg} on ${p.bg} = ${p.ratio.toFixed(2)}`)).toEqual([])
  })
})
