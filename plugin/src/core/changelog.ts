import { hash32 } from './hash'

/** Minimal shape of an icon entry in icons.json (current or previous export) */
export interface CatalogIcon {
  name: string
  hash?: string // geometry only
  colorHash?: string // colours + variable bindings
  category?: string[]
  figma?: { componentKey?: string | null; nodeId?: string; layerName?: string }
}

export interface PreviousCatalog {
  namespace?: string
  libraryVersion?: string
  /** a selection exported from Dev Mode: not a catalog of the whole library */
  partial?: boolean
  icons: CatalogIcon[]
  deprecated?: { name: string; replacedBy: string; since: string }[]
}

export interface Change {
  name: string
  from?: string
}

export interface Diff {
  added: Change[]
  removed: Change[]
  renamed: { from: string; to: string }[]
  changed: Change[]
  /** same drawing, different colours or variable bindings */
  recoloured: Change[]
  /** layer renamed in Figma but the code name is identical (accents, case, spacing, ignored folder) */
  relabelled: { name: string; from: string; to: string }[]
  /** moved to another category (never breaking) */
  moved: { name: string; from: string; to: string }[]
  unchanged: number
  bump: 'major' | 'minor' | 'patch' | 'none'
  matchedBy: { key: number; name: number }
}

export type Identity = 'componentKey' | 'name'

const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/
const SEMVER = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[0-9A-Za-z.-]{1,30})?$/
const HASH = /^[0-9a-z]{1,40}$/
const MAX_ICONS = 50000
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max && !/[\u0000-\u001f]/.test(v) ? v : undefined)

/**
 * Reads an icons.json (loaded by hand or fetched from the repo) as DATA: only the fields the diff needs survive, each validated.
 * Names end up in sprite ids, CSS selectors and Markdown, so anything that is not a slug is dropped here rather than escaped later.
 */
export function parseCatalog(input: string): PreviousCatalog {
  const data = JSON.parse(input) as Record<string, unknown>
  if (!data || typeof data !== 'object' || !Array.isArray(data.icons)) throw new Error('This does not look like an icons.json from this tool')
  if (data.icons.length > MAX_ICONS) throw new Error('This icons.json is too large')
  const seen = new Set<string>()
  const icons: CatalogIcon[] = []
  for (const raw of data.icons as unknown[]) {
    if (!raw || typeof raw !== 'object') continue
    const i = raw as Record<string, unknown>
    if (typeof i.name !== 'string' || !SLUG.test(i.name)) continue
    const fig = (i.figma && typeof i.figma === 'object' ? i.figma : {}) as Record<string, unknown>
    const category = Array.isArray(i.category) && i.category.length < 20 && i.category.every((c) => typeof c === 'string' && SLUG.test(c)) ? (i.category as string[]) : undefined
    icons.push({
      name: i.name,
      hash: typeof i.hash === 'string' && HASH.test(i.hash) ? i.hash : undefined,
      colorHash: typeof i.colorHash === 'string' && HASH.test(i.colorHash) ? i.colorHash : undefined,
      category,
      figma: { componentKey: text(fig.componentKey, 100) ?? null, nodeId: text(fig.nodeId, 60), layerName: text(fig.layerName, 300) }
    })
    seen.add(i.name)
  }
  if (!icons.length && data.icons.length) throw new Error('No valid icons found in this file')
  const deprecated = Array.isArray(data.deprecated)
    ? (data.deprecated as unknown[]).flatMap((d) => {
        const x = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
        return typeof x.name === 'string' && SLUG.test(x.name) && typeof x.replacedBy === 'string' && SLUG.test(x.replacedBy) && typeof x.since === 'string' && SEMVER.test(x.since)
          ? [{ name: x.name, replacedBy: x.replacedBy, since: x.since }]
          : []
      })
    : undefined
  return {
    namespace: typeof data.namespace === 'string' && SLUG.test(data.namespace) ? data.namespace : undefined,
    libraryVersion: typeof data.libraryVersion === 'string' && SEMVER.test(data.libraryVersion) ? data.libraryVersion : undefined,
    ...(data.partial === true ? { partial: true } : {}),
    icons,
    deprecated
  }
}

/**
 * Compare two exports. Identity = componentKey when both sides have one, otherwise the name.
 * - same identity, new name → renamed (breaking for code that uses the old name)
 * - same identity, new artwork hash → changed
 * - only in current → added; only in previous → removed
 */
export function diffCatalogs(prev: PreviousCatalog, cur: CatalogIcon[]): Diff {
  // Two passes so the result does not depend on list order: component keys first, then names for what is left.
  // A previous entry is matched at most once (list-valued maps: duplicated keys or names in an old catalog no longer overwrite each other).
  const byKey = new Map<string, CatalogIcon[]>()
  const byName = new Map<string, CatalogIcon[]>()
  for (const p of prev.icons) {
    const k = p.figma?.componentKey
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), p])
    byName.set(p.name, [...(byName.get(p.name) ?? []), p])
  }
  const used = new Set<CatalogIcon>()
  const take = (list: CatalogIcon[] | undefined) => list?.find((x) => !used.has(x))
  const matched: (CatalogIcon | undefined)[] = cur.map(() => undefined)
  const diff: Diff = { added: [], removed: [], renamed: [], changed: [], recoloured: [], relabelled: [], moved: [], unchanged: 0, bump: 'none', matchedBy: { key: 0, name: 0 } }
  cur.forEach((c, i) => {
    const k = c.figma?.componentKey
    const p = k ? take(byKey.get(k)) : undefined
    if (p) {
      used.add(p)
      matched[i] = p
      diff.matchedBy.key++
    }
  })
  cur.forEach((c, i) => {
    if (matched[i]) return
    const p = take(byName.get(c.name))
    if (p) {
      used.add(p)
      matched[i] = p
      diff.matchedBy.name++
    }
  })
  for (const [i, c] of cur.entries()) {
    const p = matched[i]
    if (!p) {
      diff.added.push({ name: c.name })
      continue
    }
    let touched = false
    if (p.name !== c.name) {
      diff.renamed.push({ from: p.name, to: c.name })
      touched = true
    }
    if (p.hash && c.hash && p.hash !== c.hash) {
      diff.changed.push({ name: c.name })
      touched = true
    }
    if (p.colorHash && c.colorHash && p.colorHash !== c.colorHash) {
      diff.recoloured.push({ name: c.name })
      touched = true
    }
    const pl = p.figma?.layerName
    const cl = c.figma?.layerName
    if (p.name === c.name && pl && cl && pl !== cl) {
      diff.relabelled.push({ name: c.name, from: pl, to: cl })
      touched = true
    }
    const pc = (p.category ?? []).join('/')
    const cc = (c.category ?? []).join('/')
    if (p.category && c.category && pc !== cc) {
      diff.moved.push({ name: c.name, from: pc || '(none)', to: cc || '(none)' })
      touched = true
    }
    if (!touched) diff.unchanged++
  }
  for (const p of prev.icons) if (!used.has(p)) diff.removed.push({ name: p.name })
  diff.bump = diff.removed.length || diff.renamed.length ? 'major' : diff.added.length ? 'minor' : diff.changed.length || diff.recoloured.length ? 'patch' : 'none'
  return diff
}

export function bumpVersion(version: string | undefined, bump: Diff['bump']): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '')
  let [a, b, c] = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [1, 0, 0]
  if (!m) return '1.0.0'
  if (bump === 'major') [a, b, c] = [a + 1, 0, 0]
  else if (bump === 'minor') [b, c] = [b + 1, 0]
  else if (bump === 'patch') c += 1
  return `${a}.${b}.${c}`
}

/** deprecated aliases: carries forward earlier ones and adds this release's renames */
export function nextDeprecated(prev: PreviousCatalog | null, diff: Diff | null, version: string, currentNames: Set<string>) {
  // follow rename chains (a→b, then b→c makes a→c) so an older alias keeps pointing at a name that exists
  const next = new Map<string, string>()
  for (const r of diff?.renamed ?? []) next.set(r.from, r.to)
  const resolve = (name: string) => {
    let n = name
    for (let hops = 0; hops < 10 && next.has(n) && !currentNames.has(n); hops++) n = next.get(n)!
    return n
  }
  const out = (prev?.deprecated ?? []).map((d) => ({ ...d, replacedBy: resolve(d.replacedBy) })).filter((d) => !currentNames.has(d.name) && currentNames.has(d.replacedBy))
  // an old name that is a live icon again (a swap) must not also be an alias
  if (diff) for (const r of diff.renamed) if (!currentNames.has(r.from)) out.push({ name: r.from, replacedBy: r.to, since: version })
  return out
}

export function changelogMarkdown(diff: Diff, version: string, date: string): string {
  const lines = [`## ${version} (${date})`, '']
  const list = (title: string, items: string[]) => {
    if (!items.length) return
    lines.push(`### ${title}`, ...items.map((i) => `- ${i}`), '')
  }
  list('Breaking: removed', diff.removed.map((r) => `\`${r.name}\``))
  list('Breaking: renamed (old name kept as a deprecated alias)', diff.renamed.map((r) => `\`${r.from}\` → \`${r.to}\``))
  list('Added', diff.added.map((r) => `\`${r.name}\``))
  list('Artwork changed', diff.changed.map((r) => `\`${r.name}\``))
  list('Recoloured (same drawing)', diff.recoloured.map((r) => `\`${r.name}\``))
  list('Layer renamed in Figma (code name unchanged)', diff.relabelled.map((r) => `\`${r.name}\`: “${r.from}” → “${r.to}”`))
  list('Moved category (not breaking)', diff.moved.map((r) => `\`${r.name}\`: ${r.from} → ${r.to}`))
  if (diff.bump === 'none' && !diff.relabelled.length && !diff.moved.length) lines.push('No changes.', '')
  else if (diff.bump === 'none') lines.push('No code-facing changes.', '')
  return lines.join('\n')
}
