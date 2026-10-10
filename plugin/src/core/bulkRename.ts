import { Icon } from '../types'
import { slugify } from './naming'

/**
 * Bulk rename: a small pipeline of steps (find and replace, case style, prefix / suffix) applied to layer names, with a preview before
 * anything is written. Pure: planning never touches the Figma file. The path part of a name ("Category/Home") is kept unless the
 * scope says "whole name"; only the last segment, the icon's own name, is changed by default.
 */

export type CaseStyle = 'none' | 'kebab' | 'snake' | 'camel' | 'pascal' | 'title' | 'lower' | 'upper'

export interface RenameRules {
  find: string
  replace: string
  /** treat `find` as a regular expression */
  regex: boolean
  caseSensitive: boolean
  caseStyle: CaseStyle
  addPrefix: string
  addSuffix: string
  removePrefix: string
  removeSuffix: string
  /** change the whole layer name (including folders) instead of its last segment only */
  wholeName: boolean
}

export const NO_RULES: RenameRules = { find: '', replace: '', regex: false, caseSensitive: false, caseStyle: 'none', addPrefix: '', addSuffix: '', removePrefix: '', removeSuffix: '', wholeName: false }

export const MAX_LAYER_NAME = 200
export const MAX_REGEX = 200

export const CASE_LABEL: Record<CaseStyle, string> = {
  none: 'Keep as is',
  kebab: 'kebab-case',
  snake: 'snake_case',
  camel: 'camelCase',
  pascal: 'PascalCase',
  title: 'Title Case',
  lower: 'lowercase',
  upper: 'UPPERCASE'
}

const words = (s: string): string[] =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

export function applyCase(s: string, style: CaseStyle): string {
  switch (style) {
    case 'none':
      return s
    case 'kebab':
      return slugify(s)
    case 'snake':
      return words(s).map((w) => w.toLowerCase()).join('_')
    case 'camel':
      return words(s).map((w, i) => (i ? cap(w) : w.toLowerCase())).join('')
    case 'pascal':
      return words(s).map(cap).join('')
    case 'title':
      return words(s).map(cap).join(' ')
    case 'lower':
      return s.toLowerCase()
    case 'upper':
      return s.toUpperCase()
  }
}

/** an invalid or over-long regular expression is reported, never thrown or run (a pathological pattern could freeze the plugin) */
export function regexProblem(rules: RenameRules): string | null {
  if (!rules.regex || !rules.find) return null
  if (rules.find.length > MAX_REGEX) return `The pattern is longer than ${MAX_REGEX} characters.`
  if (/(\([^)]*[+*][^)]*\))[+*{]/.test(rules.find)) return 'A repeated group with a repeat inside can run for a very long time here: simplify the pattern.'
  try {
    new RegExp(rules.find)
  } catch {
    return 'This is not a valid regular expression.'
  }
  return null
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** the new name for one old name (the part before the last "/" is kept unless `wholeName`) */
export function renameOne(name: string, rules: RenameRules): string {
  const cut = rules.wholeName ? -1 : name.lastIndexOf('/')
  const dir = cut >= 0 ? name.slice(0, cut + 1) : ''
  let leaf = cut >= 0 ? name.slice(cut + 1) : name
  if (rules.find && !regexProblem(rules)) {
    const re = new RegExp(rules.regex ? rules.find : escapeRe(rules.find), rules.caseSensitive ? 'g' : 'gi')
    leaf = leaf.replace(re, rules.regex ? rules.replace : rules.replace.replace(/\$/g, '$$$$'))
  }
  if (rules.removePrefix && leaf.startsWith(rules.removePrefix)) leaf = leaf.slice(rules.removePrefix.length)
  if (rules.removeSuffix && leaf.endsWith(rules.removeSuffix)) leaf = leaf.slice(0, -rules.removeSuffix.length)
  leaf = applyCase(leaf, rules.caseStyle)
  // prefix and suffix are added last, so a case style does not rewrite them
  leaf = `${rules.addPrefix}${leaf}${rules.addSuffix}`
  return `${dir}${leaf}`.replace(/[\u0000-\u001f]/g, ' ').trim()
}

export interface RenameRow {
  nodeId: string
  from: string
  to: string
  /** why this row cannot be applied, if it cannot */
  problem?: 'empty' | 'too-long' | 'duplicate' | 'taken'
}

export interface RenamePlan {
  /** names that would change and can be applied */
  changes: RenameRow[]
  /** would change, but collide or are invalid */
  blocked: RenameRow[]
  unchanged: number
  /** layers that cannot be renamed here: variants (rename the component set), instances */
  skipped: number
}

/** layers whose own name is the icon's name: components and loose frames, not variants of a set and not instances */
export const renamable = (i: Icon): boolean => (i.sourceKind === 'component' || i.sourceKind === 'frame' || i.sourceKind === 'loose') && !i.setName && Object.keys(i.variantProps).length === 0

const key = (s: string) => s.trim().toLowerCase()

/**
 * What the rules would do to `targets`. A new name must be non-empty, not absurdly long and unique: not the same as another new
 * name, and not the name of any other layer of the scan that keeps its name (`all` is the whole scan, `targets` the part being renamed).
 */
export function planRename(targets: Icon[], all: Icon[], rules: RenameRules): RenamePlan {
  const plan: RenamePlan = { changes: [], blocked: [], unchanged: 0, skipped: 0 }
  const rows: RenameRow[] = []
  for (const i of targets) {
    if (!renamable(i)) {
      plan.skipped++
      continue
    }
    const to = renameOne(i.layerName, rules)
    if (to === i.layerName) plan.unchanged++
    else rows.push({ nodeId: i.nodeId, from: i.layerName, to })
  }
  const moving = new Set(rows.map((r) => r.nodeId))
  const kept = new Set(all.filter((i) => !moving.has(i.nodeId)).map((i) => key(i.layerName)))
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(key(r.to), (counts.get(key(r.to)) ?? 0) + 1)
  for (const r of rows) {
    const problem = !r.to ? 'empty' : r.to.length > MAX_LAYER_NAME ? 'too-long' : (counts.get(key(r.to)) ?? 0) > 1 ? 'duplicate' : kept.has(key(r.to)) ? 'taken' : undefined
    if (problem) plan.blocked.push({ ...r, problem })
    else plan.changes.push(r)
  }
  return plan
}

export const PROBLEM_TEXT: Record<NonNullable<RenameRow['problem']>, string> = {
  empty: 'would be empty',
  'too-long': 'too long',
  duplicate: 'same new name as another layer in this rename',
  taken: 'another layer already has this name'
}

/** how many of the names are not in the given case style: the naming-pattern check */
export function patternCheck(targets: Icon[], style: Exclude<CaseStyle, 'none'>): { total: number; off: number } {
  const list = targets.filter(renamable)
  const off = list.filter((i) => {
    const leaf = i.layerName.slice(i.layerName.lastIndexOf('/') + 1)
    return applyCase(leaf, style) !== leaf
  }).length
  return { total: list.length, off }
}
