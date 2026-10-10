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
    if (/^--[A-Za-z0-9_*-]+$/.test(to)) map.set(from, to)
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

/**
 * Mapping lookup, most specific first:
 *  1. `Collection::variable/name = --css`   (exact, scoped to a collection)
 *  2. `variable/name = --css`               (exact)
 *  3. `Collection::prefix/* = --css-*`      (wildcard, scoped)
 *  4. `prefix/* = --css-*`                  (wildcard; `*` in the target is replaced by the rest of the path, slugified; longest prefix wins)
 */
function mapped(variable: string, collection: string | undefined, table: Map<string, string>): string | null {
  if (collection) {
    const scoped = table.get(`${collection}::${variable}`)
    if (scoped) return scoped
  }
  const exact = table.get(variable)
  if (exact) return exact
  let best: { len: number; out: string } | null = null
  for (const [from, to] of table) {
    if (!from.endsWith('*') || !to.includes('*')) continue
    let key = from.slice(0, -1)
    const scope = key.indexOf('::')
    if (scope >= 0) {
      if (!collection || key.slice(0, scope) !== collection) continue
      key = key.slice(scope + 2)
    }
    if (!variable.startsWith(key) || (best && key.length <= best.len)) continue
    const rest = variable.slice(key.length).split('/').map((x) => slugify(x)).filter(Boolean).join('-')
    if (rest) best = { len: key.length, out: to.replace('*', rest) }
  }
  return best?.out ?? null
}

/** CSS variable name for a bound Figma variable, or null when tokens are disabled */
export function tokenVarName(variable: string, collection: string | undefined, cfg: TokenNaming): string | null {
  if (cfg.mode === 'none') return null
  if (cfg.mode === 'custom') {
    const hit = mapped(variable, collection, parseMapping(cfg.mapping))
    if (hit) return hit
  }
  return pathVar(variable, cfg, collection)
}

/** Starting point for the custom table: one line per variable found in the scan, named by the current rules, grouped by collection. */
export function suggestMapping(vars: { variable: string; collection?: string }[], cfg: TokenNaming): string {
  const byCollection = new Map<string, Set<string>>()
  for (const v of vars) {
    const c = v.collection ?? ''
    if (!byCollection.has(c)) byCollection.set(c, new Set())
    byCollection.get(c)!.add(v.variable)
  }
  const base: TokenNaming = { ...cfg, mode: cfg.mode === 'collection' ? 'collection' : 'path' }
  const lines: string[] = []
  for (const [c, names] of [...byCollection].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`# ${c || '(no collection)'}`)
    for (const n of [...names].sort()) lines.push(`${n} = ${tokenVarName(n, c || undefined, base)}`)
  }
  return lines.join('\n')
}

export function tokenPreview(example: { variable: string; collection?: string }, cfg: TokenNaming): string {
  return tokenVarName(example.variable, example.collection, cfg) ?? '(none)'
}

// ---- the mapping table as data ---------------------------------------------------------------------------------------------------
// The text of the custom mapping stays the single source of truth (it is what the team config carries); the visual table edits it line by line.

export const mappingKey = (variable: string, collection?: string) => (collection ? `${collection}::${variable}` : variable)

/** a CSS custom property name as the mapping accepts it: starts with --, letters digits _ - only */
export function normaliseCssVar(input: string): string {
  const t = input.trim()
  if (!t) return ''
  return t.startsWith('--') ? t : '--' + t
}
export const validCssVar = (v: string) => /^--[A-Za-z0-9_-]+$/.test(v)

/** the CSS name written for this variable in the mapping text (a line for exactly this variable, not a wildcard), or '' */
export function explicitMapping(mapping: string, variable: string, collection?: string): string {
  return parseMapping(mapping).get(mappingKey(variable, collection)) ?? ''
}

/** the mapping text with this variable's line set to `cssVar` (added, replaced) or removed when `cssVar` is empty; other lines and comments are kept */
export function setMappingEntry(mapping: string, variable: string, collection: string | undefined, cssVar: string): string {
  const key = mappingKey(variable, collection)
  const to = normaliseCssVar(cssVar)
  const lines = mapping.split(/\r?\n/)
  let found = false
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    const i = line.indexOf('=')
    if (line && !line.startsWith('#') && !line.startsWith('//') && i > 0 && line.slice(0, i).trim() === key) {
      if (!found && to) out.push(`${key} = ${to}`)
      found = true
      continue
    }
    out.push(raw)
  }
  if (!found && to) {
    while (out.length && out[out.length - 1].trim() === '') out.pop()
    out.push(`${key} = ${to}`)
  }
  return out.join('\n')
}
