import { SyncSettings } from '../types'

/** One call to the local companion (tools/icon-sync.mjs). Throws an Error with a message fit to show to the user. */
export async function companionFetch(sync: SyncSettings, path: string, body?: unknown): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const url = sync.url.replace(/\/$/, '') + path
  let res: Response
  try {
    res = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'x-toolkit-token': sync.token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error(`Cannot reach the companion at ${sync.url}. Is it running (node tools/icon-sync.mjs --dir …)? The plugin must be loaded from this build's manifest so localhost is allowed.`)
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Companion error ${res.status}`)
  return json
}
