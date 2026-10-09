import { chunkText } from '../core/baseline'
import { hash32 } from '../core/fixes'

const ID_KEY = 'ilt:fileid:v1'
const SNAP_KEY = 'ilt:baseline:v1'
const LOCAL_PREFIX = 'ilt:baseline:local:'

/**
 * File identity without writing to the file: fileKey (private plugins only) > id stored by an earlier shared write >
 * hash of the file name and page ids (fragile: a renamed file loses its local baseline).
 */
export function fileIdentity(): string {
  try {
    const k = (figma as unknown as { fileKey?: string }).fileKey
    if (k) return k
  } catch {
    /* public plugin */
  }
  try {
    const stored = figma.root.getPluginData(ID_KEY)
    if (stored) return stored
  } catch {
    /* ignore */
  }
  return 'h' + hash32(figma.root.name + '|' + figma.root.children.map((p) => p.id).join(','))
}

export async function readLocalBaseline(): Promise<string | null> {
  try {
    return ((await figma.clientStorage.getAsync(LOCAL_PREFIX + fileIdentity())) as string | undefined) ?? null
  } catch {
    return null
  }
}

export async function writeLocalBaseline(text: string): Promise<void> {
  await figma.clientStorage.setAsync(LOCAL_PREFIX + fileIdentity(), text)
}

function readChunks(node: { getPluginData(k: string): string }): string | null {
  const n = Number(node.getPluginData(SNAP_KEY + ':n') || 0)
  if (!n) return null
  let out = ''
  for (let i = 0; i < n; i++) {
    const part = node.getPluginData(`${SNAP_KEY}:${i}`)
    if (!part) return null
    out += part
  }
  return out
}

export async function readSharedBaseline(): Promise<string | null> {
  try {
    const r = readChunks(figma.root)
    if (r) return r
  } catch {
    /* fall through */
  }
  try {
    const first = figma.root.children[0]
    if (first) {
      await first.loadAsync()
      return readChunks(first)
    }
  } catch {
    /* unreadable here */
  }
  return null
}

function writeChunks(node: { setPluginData(k: string, v: string): void; getPluginData(k: string): string }, parts: string[]) {
  const old = Number(node.getPluginData(SNAP_KEY + ':n') || 0)
  parts.forEach((p, i) => node.setPluginData(`${SNAP_KEY}:${i}`, p))
  for (let i = parts.length; i < old; i++) node.setPluginData(`${SNAP_KEY}:${i}`, '')
  node.setPluginData(SNAP_KEY + ':n', String(parts.length))
}

/** Opt-in write (Labs). Root + first page, like the shared config, because root data in a branch may not merge. */
export async function writeSharedBaseline(text: string): Promise<{ ok: boolean; message: string }> {
  const parts = chunkText(text)
  try {
    figma.root.setPluginData(ID_KEY, fileIdentity())
    writeChunks(figma.root, parts)
  } catch (e) {
    return { ok: false, message: `Could not write to the file (view-only access?): ${e instanceof Error ? e.message : String(e)}` }
  }
  try {
    const first = figma.root.children[0]
    if (first) {
      await first.loadAsync()
      writeChunks(first, parts)
    }
  } catch {
    /* the root copy is enough */
  }
  return { ok: true, message: `Baseline saved in this file (${parts.length} entr${parts.length === 1 ? 'y' : 'ies'})` }
}
