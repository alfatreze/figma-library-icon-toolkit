import { CHANGE_KINDS, ChangeKind } from '../core/baseline'
import { FormatId, Icon, Severity } from '../types'

/** Pure derivations from the processed icons, kept out of the component so they can be unit-tested. */

export interface IssueGroup {
  ruleId: string
  severity: Severity
  icons: Icon[]
  formats: FormatId[]
}

const hasSeverity = (i: Icon, s: Severity) => i.findings.some((f) => f.severity === s)

export const isBlocked = (i: Icon) => hasSeverity(i, 'error')
/** a component that no instance in the scanned pages uses (usage in other files is not visible to a plugin) */
export const isUnused = (i: Icon) => i.placements === 0
/** warnings only: still exported, but worth a look */
export const isAlert = (i: Icon) => !hasSeverity(i, 'error') && hasSeverity(i, 'warn')

/** Findings grouped by rule, worst severity first, then by how many icons they affect. Each icon is counted once per rule. */
export function groupIssues(icons: Icon[]): IssueGroup[] {
  const map = new Map<string, IssueGroup>()
  const members = new Map<string, Set<Icon>>()
  for (const icon of icons) {
    for (const f of icon.findings) {
      let e = map.get(f.ruleId)
      if (!e) {
        e = { ruleId: f.ruleId, severity: f.severity, icons: [], formats: [] }
        map.set(f.ruleId, e)
        members.set(f.ruleId, new Set())
      }
      const set = members.get(f.ruleId)!
      if (!set.has(icon)) {
        set.add(icon)
        e.icons.push(icon)
      }
      if (f.severity === 'error') e.severity = 'error'
      else if (f.severity === 'warn' && e.severity === 'info') e.severity = 'warn'
      for (const fm of f.formats ?? []) if (!e.formats.includes(fm)) e.formats.push(fm)
    }
  }
  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 }
  return [...map.values()].sort((a, b) => order[a.severity] - order[b.severity] || b.icons.length - a.icons.length)
}

export function countChanges(changes: Map<string, Set<ChangeKind>>): Partial<Record<ChangeKind, number>> {
  const out: Partial<Record<ChangeKind, number>> = {}
  for (const set of changes.values()) for (const k of set) out[k] = (out[k] ?? 0) + 1
  return out
}

export const presentChangeKinds = (counts: Partial<Record<ChangeKind, number>>): ChangeKind[] => CHANGE_KINDS.filter((k) => counts[k])

export interface IconFilter {
  status: 'all' | 'blocked' | 'alerts' | 'excluded' | 'unused'
  ruleId: string | null
  category: string
  change: ChangeKind | null
  query: string
}

export function filterIcons(icons: Icon[], f: IconFilter, off: Set<string>, changes: Map<string, Set<ChangeKind>>): Icon[] {
  const q = f.query.trim().toLowerCase()
  return icons.filter((i) => {
    if (f.status === 'blocked' && !isBlocked(i)) return false
    if (f.status === 'alerts' && !isAlert(i)) return false
    if (f.status === 'excluded' && !off.has(i.key)) return false
    if (f.status === 'unused' && !isUnused(i)) return false
    if (f.ruleId && !i.findings.some((x) => x.ruleId === f.ruleId)) return false
    if (f.category && i.category.join('/') !== f.category) return false
    if (f.change && !changes.get(i.name)?.has(f.change)) return false
    if (!q) return true
    return (i.name + ' ' + i.layerName + ' ' + i.categoryLabel + ' ' + i.tags.join(' ')).toLowerCase().includes(q)
  })
}
