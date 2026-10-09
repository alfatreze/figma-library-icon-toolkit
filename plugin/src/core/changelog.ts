import { hash32 } from './fixes'

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

export function artworkHash(body: string): string {
  return hash32(body)
}

export function parseCatalog(text: string): PreviousCatalog {
  const data = JSON.parse(text) as Partial<PreviousCatalog>
  if (!data || !Array.isArray(data.icons)) throw new Error('This does not look like an icons.json from this tool')
  return data as PreviousCatalog
}

/**
 * Compare two exports. Identity = componentKey when both sides have one, otherwise the name.
 * - same identity, new name → renamed (breaking for code that uses the old name)
 * - same identity, new artwork hash → changed
 * - only in current → added; only in previous → removed
 */
export function diffCatalogs(prev: PreviousCatalog, cur: CatalogIcon[]): Diff {
  const byKey = new Map<string, CatalogIcon>()
  const byName = new Map<string, CatalogIcon>()
  for (const p of prev.icons) {
    const k = p.figma?.componentKey
    if (k) byKey.set(k, p)
    byName.set(p.name, p)
  }
  const used = new Set<CatalogIcon>()
  const diff: Diff = { added: [], removed: [], renamed: [], changed: [], recoloured: [], relabelled: [], moved: [], unchanged: 0, bump: 'none', matchedBy: { key: 0, name: 0 } }
  for (const c of cur) {
    const k = c.figma?.componentKey
    let p = k ? byKey.get(k) : undefined
    if (p) diff.matchedBy.key++
    else {
      p = byName.get(c.name)
      if (p && !used.has(p)) diff.matchedBy.name++
      else p = undefined
    }
    if (!p) {
      diff.added.push({ name: c.name })
      continue
    }
    used.add(p)
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
  const out = (prev?.deprecated ?? []).filter((d) => !currentNames.has(d.name) && currentNames.has(d.replacedBy))
  if (diff) for (const r of diff.renamed) out.push({ name: r.from, replacedBy: r.to, since: version })
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
