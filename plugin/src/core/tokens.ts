import { TokenNaming } from '../types'
import { slugify } from './naming'

export const TOKEN_MODES: { value: TokenNaming['mode']; label: string; example: string; detail: string }[] = [
  { value: 'path', label: 'Variable path (default)', example: 'color/neutral/darkest → --color-neutral-darkest', detail: 'Turns the Figma variable name into a CSS variable by replacing “/” with “-”. Works when your token package is generated from the same Figma variables (Style Dictionary, Tokens Studio, Figma-variables exporters).' },
  { value: 'collection', label: 'Collection + path', example: 'Primitives · color/neutral/darkest → --primitives-color-neutral-darkest', detail: 'Also includes the variable collection name. Use when different collections reuse the same variable names (e.g. Primitives vs Semantic).' },
  { value: 'custom', label: 'Custom mapping table', example: 'color/icon/default = --icon-color', detail: 'You decide each CSS variable name, one mapping per line (figma/variable/name = --css-var). Variables not in the table fall back to the path rule. Best when your tokens are hand-named.' },
  { value: 'none', label: 'No token fallback', example: '(only --{ns}-icon-color slots)', detail: 'Icons only expose their own slot variables and ignore Figma variables. Choose this if your app does not define CSS tokens for these colours.' }
]

export function parseMapping(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    const from = line.slice(0, i).trim()
    let to = line.slice(i + 1).trim()
    if (!to) continue
    if (!to.startsWith('--')) to = '--' + to
    if (/^--[A-Za-z0-9_-]+$/.test(to)) map.set(from, to)
  }
  return map
}

function pathVar(variable: string, cfg: TokenNaming, collection?: string): string {
  const strip = new Set(cfg.stripSegments.split(',').map((s) => slugify(s)).filter(Boolean))
  const segs = variable.split('/').map((p) => slugify(p)).filter(Boolean)
  while (segs.length > 1 && strip.has(segs[0])) segs.shift()
  const parts: string[] = []
  const prefix = slugify(cfg.prefix)
  if (prefix) parts.push(prefix)
  if (cfg.mode === 'collection' && collection) {
    const c = slugify(collection)
    if (c) parts.push(c)
  }
  parts.push(...segs)
  return '--' + parts.join('-')
}

/** CSS variable name for a bound Figma variable, or null when tokens are disabled */
export function tokenVarName(variable: string, collection: string | undefined, cfg: TokenNaming): string | null {
  if (cfg.mode === 'none') return null
  if (cfg.mode === 'custom') {
    const hit = parseMapping(cfg.mapping).get(variable)
    if (hit) return hit
  }
  return pathVar(variable, cfg, collection)
}

export function tokenPreview(example: { variable: string; collection?: string }, cfg: TokenNaming): string {
  return tokenVarName(example.variable, example.collection, cfg) ?? '(none)'
}
