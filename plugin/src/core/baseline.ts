import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate'
import { CatalogIcon, Diff, PreviousCatalog } from './changelog'
import { hash32 } from './fixes'

/**
 * Baseline = the snapshot "changed since" is measured against.
 * Layers, most authoritative first: repo icons.json (what developers ship) > shared in-file snapshot > local snapshot > loaded file.
 * See docs/CHANGE-DETECTION.md.
 */
export type BaselineSource = 'repo' | 'shared' | 'local' | 'file'

export interface Snapshot {
  v: 1
  id: string
  at: string
  by?: string | null
  version?: string
  namespace?: string
  icons: CatalogIcon[]
}

export const SNAPSHOT_CHUNK = 90000 // bytes per plugin-data entry (limit is 100 kB)

export function makeSnapshot(icons: CatalogIcon[], meta: { at: string; by?: string | null; version?: string; namespace?: string }): Snapshot {
  const slim = icons.map((i) => ({ name: i.name, hash: i.hash, colorHash: i.colorHash, category: i.category, figma: { componentKey: i.figma?.componentKey ?? null, layerName: i.figma?.layerName } }))
  const id = hash32(slim.map((i) => `${i.name}:${i.hash}:${i.colorHash}`).join('|') + meta.at)
  return { v: 1, id, ...meta, icons: slim }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=')
  }
  return out
}

function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i])
    const b = B64.indexOf(clean[i + 1])
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0
    const n = (a << 18) | (b << 12) | (c << 6) | d
    out[o++] = (n >> 16) & 255
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255
    if (i + 3 < clean.length) out[o++] = n & 255
  }
  return out.subarray(0, o)
}

/** deflate + base64: ~700 icons ≈ 15-20 kB */
export function encodeSnapshot(s: Snapshot): string {
  return toBase64(zlibSync(strToU8(JSON.stringify(s)), { level: 9 }))
}

export function decodeSnapshot(text: string | null | undefined): Snapshot | null {
  if (!text) return null
  try {
    const s = JSON.parse(strFromU8(unzlibSync(fromBase64(text)))) as Snapshot
    return s && s.v === 1 && Array.isArray(s.icons) ? s : null
  } catch {
    return null
  }
}

export function chunkText(text: string, size = SNAPSHOT_CHUNK): string[] {
  const parts: string[] = []
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size))
  return parts.length ? parts : ['']
}

export function snapshotToCatalog(s: Snapshot): PreviousCatalog {
  return { namespace: s.namespace, libraryVersion: s.version, icons: s.icons }
}

/** parse the repo/project icons.json into the same shape */
export function catalogToSnapshot(c: PreviousCatalog): Snapshot {
  return { v: 1, id: hash32(JSON.stringify(c.icons.map((i) => i.name))), at: '', version: c.libraryVersion, namespace: c.namespace, icons: c.icons }
}

export type ChangeKind = 'added' | 'renamed' | 'changed' | 'recoloured' | 'moved' | 'relabelled'
export const CHANGE_KINDS: ChangeKind[] = ['added', 'renamed', 'changed', 'recoloured', 'moved', 'relabelled']
export const CHANGE_LABEL: Record<ChangeKind, string> = {
  added: 'new',
  renamed: 'renamed',
  changed: 'drawing',
  recoloured: 'colour',
  moved: 'moved',
  relabelled: 'layer name'
}

/** icon name (current) → the kinds of change it went through since the baseline */
export function changesByName(diff: Diff | null): Map<string, Set<ChangeKind>> {
  const map = new Map<string, Set<ChangeKind>>()
  if (!diff) return map
  const add = (name: string, k: ChangeKind) => {
    let s = map.get(name)
    if (!s) map.set(name, (s = new Set()))
    s.add(k)
  }
  for (const x of diff.added) add(x.name, 'added')
  for (const x of diff.renamed) add(x.to, 'renamed')
  for (const x of diff.changed) add(x.name, 'changed')
  for (const x of diff.recoloured) add(x.name, 'recoloured')
  for (const x of diff.moved) add(x.name, 'moved')
  for (const x of diff.relabelled) add(x.name, 'relabelled')
  return map
}

/** Prefer the most authoritative available baseline. */
export function pickBaseline(avail: Partial<Record<BaselineSource, Snapshot | null>>): BaselineSource | null {
  for (const k of ['repo', 'shared', 'local', 'file'] as BaselineSource[]) if (avail[k]) return k
  return null
}

export const BASELINE_LABEL: Record<BaselineSource, string> = {
  repo: 'Project repo (icons.json)',
  shared: 'Shared in this file',
  local: 'This computer',
  file: 'Loaded file'
}
