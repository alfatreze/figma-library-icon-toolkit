import { FetchFn, HostError } from './types'

const TIMEOUT_MS = 60_000

export interface Reply<T = unknown> {
  status: number
  data: T
  headers: { get(name: string): string | null }
}

/** One JSON request with a timeout. Network failures and non-2xx answers become HostErrors with a message fit to show. */
export async function call<T = unknown>(fetchFn: FetchFn, url: string, init: { method?: string; headers: Record<string, string>; body?: unknown }, describe: (status: number, data: unknown) => HostError, allow: number[] = []): Promise<Reply<T>> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null
  let res
  try {
    res = await fetchFn(url, { method: init.method ?? 'GET', headers: init.headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: ctl?.signal })
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError'
    throw new HostError('network', timedOut ? 'The request timed out. Check your connection and try again.' : 'Could not reach the server. Check your internet connection (and that the plugin is allowed to connect).')
  } finally {
    if (timer) clearTimeout(timer)
  }
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  if (!res.ok && !allow.includes(res.status)) throw describe(res.status, data)
  return { status: res.status, data: data as T, headers: res.headers }
}

export const messageOf = (data: unknown): string => {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    const m = d.message ?? d.error ?? d.error_description
    if (typeof m === 'string') return m
    if (m && typeof m === 'object') return JSON.stringify(m).slice(0, 200)
  }
  return typeof data === 'string' ? data.slice(0, 200) : ''
}

/** the common mapping from status codes to what the user can do about it */
export function commonError(status: number, data: unknown, host: string): HostError {
  const detail = messageOf(data)
  if (status === 401) return new HostError('auth', `${host} did not accept the token. Create a new one and paste it again.`, status)
  if (status === 403 && /rate limit|abuse|too many/i.test(detail)) return new HostError('rate', `${host} is limiting requests. Wait a minute and try again.`, status)
  if (status === 403) return new HostError('permission', `The token is not allowed to do that${detail ? ` (${detail})` : ''}. It needs write access to the repository contents and to pull / merge requests.`, status)
  if (status === 404) return new HostError('notfound', `Repository not found, or the token cannot see it. Check the name and the token's repository access.`, status)
  if (status === 429) return new HostError('rate', `${host} is limiting requests. Wait a minute and try again.`, status)
  if (status >= 500) return new HostError('server', `${host} had a problem (${status}). Try again in a moment.`, status)
  return new HostError('invalid', `${host} refused the request (${status})${detail ? `: ${detail}` : ''}.`, status)
}
