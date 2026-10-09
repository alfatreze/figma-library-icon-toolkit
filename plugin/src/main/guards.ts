import { parseShared } from '../core/config'
import { ApplyFixRequest, DescriptionItem, DevResourceItem, FixActionId } from '../types'

/**
 * The UI runs in an iframe and the main thread is the only code that can touch the file, so every message from the UI is
 * treated as untrusted input and re-validated here (the UI checks are for usability, these are for safety).
 */

export const MAX_BASELINE_CHARS = 2_000_000
export const MAX_CONFIG_CHARS = 200_000
export const MAX_DEV_RESOURCES = 2000
export const MAX_FIX_REQUESTS = 5000
export const MAX_DESCRIPTIONS = 5000

const NODE_ID = /^\d{1,10}:\d{1,10}$/
const FIX_ACTIONS: FixActionId[] = ['replace-with-instance', 'convert-to-component', 'wrap-and-convert', 'rename-layers', 'apply-name']

/** a link the UI asks us to open in the browser: https only, one line, bounded (it comes from the local helper, which is data, not code) */
export const validExternalUrl = (u: unknown): u is string => typeof u === 'string' && u.length <= 8000 && /^https:\/\/[^\s"'<>`]+$/.test(u)

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

/** component descriptions to write: bounded, no control characters other than a line break, never an empty one (an empty description would erase a real one) */
export function validDescriptions(items: unknown): DescriptionItem[] {
  if (!Array.isArray(items)) return []
  const out: DescriptionItem[] = []
  const clean = (s: string, max: number) => s.slice(0, max).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ')
  for (const it of items.slice(0, MAX_DESCRIPTIONS) as Partial<DescriptionItem>[]) {
    if (!it || !isNodeId(it.nodeId) || typeof it.from !== 'string' || typeof it.to !== 'string') continue
    const to = clean(it.to, 1000).trim()
    if (!to) continue
    out.push({ nodeId: it.nodeId, from: it.from.slice(0, 5000), to })
  }
  return out
}

export const clampSize = (w: unknown, h: unknown, min: { w: number; h: number }, max: { w: number; h: number }) => ({
  w: Math.round(Math.min(max.w, Math.max(min.w, typeof w === 'number' && Number.isFinite(w) ? w : min.w))),
  h: Math.round(Math.min(max.h, Math.max(min.h, typeof h === 'number' && Number.isFinite(h) ? h : min.h)))
})
