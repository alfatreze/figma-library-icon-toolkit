import { createClient, FetchFn, HostClient } from '../core/gitHost'
import { OutputSettings, Settings } from '../types'

/** the browser's fetch, typed for the git host layer (kept separate so tests can pass a fake) */
export const browserFetch: FetchFn = (url, init) => fetch(url, init)

export const clientFor = (o: Pick<OutputSettings, 'provider' | 'repo'>, tokens: Settings['tokens'], fetchFn: FetchFn = browserFetch): HostClient =>
  createClient(o.provider, o.repo.trim(), tokens[o.provider], fetchFn)
