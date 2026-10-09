import { parseShared } from '../core/config'
import { ApplyFixRequest, DevResourceItem, FixActionId } from '../types'

/**
 * The UI runs in an iframe and the main thread is the only code that can touch the file, so every message from the UI is
 * treated as untrusted input and re-validated here (the UI checks are for usability, these are for safety).
 */

export const MAX_BASELINE_CHARS = 2_000_000
export const MAX_CONFIG_CHARS = 200_000
export const MAX_DEV_RESOURCES = 2000
export const MAX_FIX_REQUESTS = 5000

const NODE_ID = /^\d{1,10}:\d{1,10}$/
const FIX_ACTIONS: FixActionId[] = ['replace-with-instance', 'convert-to-component', 'wrap-and-convert', 'rename-layers', 'apply-name']

export const isNodeId = (v: unknown): v is string => typeof v === 'string' && NODE_ID.test(v)

export function validBaseline(text: unknown, target: unknown): target is 'local' | 'shared' {
  return typeof text === 'string' && text.length > 0 && text.length <= MAX_BASELINE_CHARS && (target === 'local' || target === 'shared')
}

export function validSharedConfig(text: unknown): text is string {
  return typeof text === 'string' && text.length <= MAX_CONFIG_CHARS && parseShared(text) !== null
}

/** https only (a dev resource opens in the browser from Dev Mode), no whitespace, bounded length */
export function validDevResources(items: unknown): DevResourceItem[] {
  if (!Array.isArray(items)) return []
  const out: DevResourceItem[] = []
  for (const it of items.slice(0, MAX_DEV_RESOURCES) as Partial<DevResourceItem>[]) {
    if (!it || !isNodeId(it.nodeId) || typeof it.url !== 'string' || typeof it.name !== 'string') continue
    if (!/^https:\/\/[^\s"'<>`]{1,1000}$/.test(it.url) || it.name.length > 200) continue
    out.push({ nodeId: it.nodeId, url: it.url, name: it.name.replace(/[\u0000-\u001f]/g, ' ') })
  }
  return out
}

export function validFixRequests(reqs: unknown): ApplyFixRequest[] {
  if (!Array.isArray(reqs)) return []
  const out: ApplyFixRequest[] = []
  for (const r of reqs.slice(0, MAX_FIX_REQUESTS) as Partial<ApplyFixRequest>[]) {
    if (!r || typeof r.id !== 'string' || r.id.length > 200 || !FIX_ACTIONS.includes(r.action as FixActionId)) continue
    const dim = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(512, Math.max(1, n)) : 24)
    const str = (s: unknown, max: number) => (typeof s === 'string' ? s.slice(0, max).replace(/[\u0000-\u001f]/g, ' ') : undefined)
    out.push({
      id: r.id,
      action: r.action as FixActionId,
      gridWidth: dim(r.gridWidth),
      gridHeight: dim(r.gridHeight),
      leafName: str(r.leafName, 100) ?? 'Vector',
      name: str(r.name, 200),
      renameLeaves: r.renameLeaves === true
    })
  }
  return out
}

export const clampSize = (w: unknown, h: unknown, min: { w: number; h: number }, max: { w: number; h: number }) => ({
  w: Math.round(Math.min(max.w, Math.max(min.w, typeof w === 'number' && Number.isFinite(w) ? w : min.w))),
  h: Math.round(Math.min(max.h, Math.max(min.h, typeof h === 'number' && Number.isFinite(h) ? h : min.h)))
})
