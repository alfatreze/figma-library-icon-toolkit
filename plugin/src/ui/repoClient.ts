import { createClient, FetchFn, HostClient } from '../core/gitHost'
import { RepoSettings } from '../types'

/** the browser's fetch, typed for the git host layer (kept separate so tests can pass a fake) */
export const browserFetch: FetchFn = (url, init) => fetch(url, init)

export const repoConfigured = (r: RepoSettings): boolean => r.token.trim().length > 0 && /^[\w.-]+(\/[\w.-]+)+$/.test(r.repo.trim())

export const clientFor = (r: RepoSettings, fetchFn: FetchFn = browserFetch): HostClient => createClient(r.provider, r.repo.trim(), r.token, fetchFn)
