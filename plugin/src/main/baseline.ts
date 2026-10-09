import { chunkText } from '../core/baseline'
import { hash32 } from '../core/fixes'
import { log } from '../log'

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
  } catch (e) {
    log.debug('baseline', 'public plugin', e)
  }
  try {
    const stored = figma.root.getPluginData(ID_KEY)
    if (stored) return stored
  } catch (e) {
    log.debug('baseline', 'ignore', e)
  }
  // Page ids survive renaming the file and adding or removing other pages; the file name would not. A duplicated file keeps its page ids
  // and therefore shares the baseline of the original, which is the useful behaviour for "a copy of this library".
  return 'h' + hash32(figma.root.children[0]?.id ?? figma.root.name)
}

export async function readLocalBaseline(): Promise<string | null> {
  try {
    return ((await figma.clientStorage.getAsync(LOCAL_PREFIX + fileIdentity())) as string | undefined) ?? null
  } catch (e) {
    log.debug('baseline', 'ignored', e)
return null
  }
}

const INDEX_KEY = 'ilt:baseline:index'
const MAX_LOCAL_FILES = 20 // clientStorage is 5 MB for the whole plugin; keep the most recently used files and drop the rest

export async function writeLocalBaseline(text: string): Promise<void> {
  const id = fileIdentity()
  await figma.clientStorage.setAsync(LOCAL_PREFIX + id, text)
  try {
    const index = (((await figma.clientStorage.getAsync(INDEX_KEY)) as string[] | undefined) ?? []).filter((x) => x !== id)
    index.push(id)
    while (index.length > MAX_LOCAL_FILES) await figma.clientStorage.deleteAsync(LOCAL_PREFIX + index.shift()!)
    await figma.clientStorage.setAsync(INDEX_KEY, index)
  } catch (e) {
    console.warn('[icon-toolkit] could not update the baseline index', e)
  }
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
  } catch (e) {
    log.debug('baseline', 'fall through', e)
  }
  try {
    const first = figma.root.children[0]
    if (first) {
      await first.loadAsync()
      return readChunks(first)
    }
  } catch (e) {
    log.debug('baseline', 'unreadable here', e)
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
  } catch (e) {
    log.debug('baseline', 'the root copy is enough', e)
  }
  return { ok: true, message: `Baseline saved in this file (${parts.length} entr${parts.length === 1 ? 'y' : 'ies'})` }
}
