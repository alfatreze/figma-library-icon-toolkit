import { FixActionId, FixKind } from '../types'

export interface FixInfo {
  title: string
  why: string
  /** what each action does, shown next to the preview */
  actionLabels: Partial<Record<FixActionId, string>>
}

export const FIX_INFO: Record<FixKind, FixInfo> = {
  'detached-identical': {
    title: 'Detached icon (same artwork)',
    why: 'This frame was detached from a component and still looks identical. It no longer receives library updates and cannot use instance overrides.',
    actionLabels: { 'replace-with-instance': 'Replace with an instance of the component', 'convert-to-component': 'Make it a new component instead' }
  },
  'detached-match': {
    title: 'Same artwork as an existing component',
    why: 'This layer has exactly the same shape as a component but is not linked to it (probably copied and detached, or redrawn).',
    actionLabels: { 'replace-with-instance': 'Replace with an instance of the matching component', 'convert-to-component': 'Make it a new component instead' }
  },
  'detached-changed': {
    title: 'Detached icon with changes',
    why: 'Detached from, or very similar to, a component but with differences (size, colour or shape). Replacing it carries size and colour as overrides; shape edits are lost.',
    actionLabels: { 'replace-with-instance': 'Replace with an instance (carry size/colour as overrides)', 'convert-to-component': 'Keep my version: make it a new component' }
  },
  'detached-unresolved': {
    title: 'Detached from a component you cannot read',
    why: 'The source component is in a library that is not available in this file. Publish/enable the library, or turn the layer into a component.',
    actionLabels: { 'convert-to-component': 'Make it a new component' }
  },
  'convert-frame': {
    title: 'Icon frame is not a component',
    why: 'Plain frames have no stable key, cannot be swapped, and cannot be mapped to code. Converting keeps it in place.',
    actionLabels: { 'convert-to-component': 'Convert to component' }
  },
  'wrap-loose': {
    title: 'Loose icon (no icon frame)',
    why: 'Loose shapes or groups have no icon box, so size and padding are inconsistent. Wrapping puts it in a library-size frame and makes it a component.',
    actionLabels: { 'wrap-and-convert': 'Wrap in a frame and convert to component' }
  },
  'layer-names': {
    title: 'Layer names are not override-safe',
    why: 'Figma keeps fill/stroke overrides when swapping icons only if the layers inside have matching names. Inconsistent names (Vector, Vector 1, Union, path…) make overrides reset on swap.',
    actionLabels: { 'rename-layers': 'Rename layers to the standard names' }
  },
  'duplicate-component': {
    title: 'Duplicate components',
    why: 'These components contain exactly the same drawing (mirrored or rotated copies are not counted). Often intentional (e.g. brand-specific names reusing a generic icon): mark it as intentional. Otherwise keep one and swap instances to it (Figma cannot merge components).',
    actionLabels: {}
  }
}

export const FIX_GROUPS: { id: string; label: string; kinds: FixKind[] }[] = [
  { id: 'detached', label: 'Detached', kinds: ['detached-identical', 'detached-match', 'detached-changed', 'detached-unresolved'] },
  { id: 'convert', label: 'Not components', kinds: ['convert-frame', 'wrap-loose'] },
  { id: 'names', label: 'Layer names', kinds: ['layer-names'] },
  { id: 'dupes', label: 'Duplicates', kinds: ['duplicate-component'] }
]

export { hash32, hash64 } from './hash'

/** round all numbers in path data so tiny float noise does not break matching */
export function normalisePath(d: string, decimals = 2): string {
  return d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (m) => {
    const n = Number(m)
    if (!Number.isFinite(n)) return m
    const r = Number(n.toFixed(decimals))
    return String(Object.is(r, -0) ? 0 : r)
  })
}

export type Similarity = 'identical' | 'same-shape' | 'different'

export function compareSignatures(a: { geom: string; shape: string }, b: { geom: string; shape: string }): Similarity {
  if (a.geom === b.geom) return 'identical'
  if (a.shape === b.shape) return 'same-shape'
  return 'different'
}

/**
 * Canonical vector layer names for override-safe icons.
 * One leaf → "Vector"; several → "Vector", "Vector 2", "Vector 3" ordered by colour slot (most used colour first), then z-order.
 */
export function canonicalLeafNames(leaves: { name: string; hex?: string }[], base: string): string[] {
  const uses = new Map<string, number>()
  leaves.forEach((l) => l.hex && uses.set(l.hex, (uses.get(l.hex) ?? 0) + 1))
  const rank = (l: { hex?: string }) => (l.hex ? -(uses.get(l.hex) ?? 0) : 0)
  const order = leaves.map((_, i) => i).sort((a, b) => rank(leaves[a]) - rank(leaves[b]) || a - b)
  const names = new Array<string>(leaves.length)
  order.forEach((idx, n) => {
    names[idx] = n === 0 ? base : `${base} ${n + 1}`
  })
  return names
}

export function planRenames(leaves: { id: string; name: string; hex?: string }[], base: string): { nodeId: string; from: string; to: string }[] {
  const wanted = canonicalLeafNames(leaves, base)
  return leaves.flatMap((l, i) => (l.name !== wanted[i] ? [{ nodeId: l.id, from: l.name, to: wanted[i] }] : []))
}

export interface LeafNameStat {
  name: string
  count: number
}

/**
 * Which vector-layer name does this file already use most? Counted over components that have exactly one vector layer
 * (the case where one name must be shared by every icon). Falls back to the configured name when the file has no clear winner.
 */
export function pickDominantLeaf(histogram: Map<string, number>, configured: string): { name: string; stats: LeafNameStat[]; detected: boolean; caseVariants: number } {
  const stats = [...histogram.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const top = stats[0]
  const second = stats[1]
  const total = stats.reduce((a, s) => a + s.count, 0)
  const clear = !!top && top.count / Math.max(1, total) >= 0.5 && (!second || top.count > second.count)
  const caseVariants = top ? stats.filter((s) => s.name !== top.name && s.name.toLowerCase() === top.name.toLowerCase()).reduce((a, s) => a + s.count, 0) : 0
  return { name: clear ? top.name : configured, stats: stats.slice(0, 8), detected: clear, caseVariants }
}
