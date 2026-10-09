import { DEFAULT_SETTINGS, Settings } from '../types'

import { cleanNamespace } from './naming'
import { checkSetting, SHARED_KEYS } from './settingsSchema'

export function exportConfig(settings: Settings): string {
  const out: Record<string, unknown> = { $schema: 'icon-library-toolkit/config@1' }
  for (const k of SHARED_KEYS) out[k] = checkSetting(k, settings[k]) ?? DEFAULT_SETTINGS[k] // never write a value that would be rejected on import
  out.namespace = cleanNamespace(settings.namespace) // what the generated files really use, not what was typed
  return JSON.stringify(out, null, 2) + '\n'
}

/**
 * Merges a config file over the current settings. Unknown keys, local-only keys and values that fail validation
 * (wrong type, not in the allowed list, out of range) are ignored and reported, never applied.
 */
export function parseConfig(text: string, current: Settings): { settings: Settings; applied: string[]; ignored: string[] } {
  const data = JSON.parse(text) as unknown
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Not a config object')
  const applied: string[] = []
  const ignored: string[] = []
  const next: Settings = { ...current }
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (k === '$schema') continue
    if (!(SHARED_KEYS as string[]).includes(k)) {
      ignored.push(k)
      continue
    }
    const key = k as keyof Settings
    const ok = checkSetting(key, v)
    if (ok === undefined) {
      ignored.push(k)
      continue
    }
    const def = DEFAULT_SETTINGS[key]
    if (def && typeof def === 'object' && !Array.isArray(def)) (next as unknown as Record<string, unknown>)[k] = { ...(def as object), ...(ok as object) }
    else (next as unknown as Record<string, unknown>)[k] = ok
    applied.push(k)
  }
  return { settings: next, applied, ignored }
}

/** What is written into the Figma file so everyone (incl. developers in Dev Mode) uses the same settings. */
export interface SharedConfig {
  v: 1
  publishedAt: string
  publishedBy?: string
  config: string // toolkit.config.json text
}

export const SHARED_KEY = 'ilt:config:v1'

export function serializeShared(settings: Settings, publishedAt: string, publishedBy?: string): string {
  const body: SharedConfig = { v: 1, publishedAt, publishedBy, config: exportConfig(settings) }
  return JSON.stringify(body)
}

export function parseShared(text: string | null | undefined): SharedConfig | null {
  if (!text) return null
  try {
    const data = JSON.parse(text) as Partial<SharedConfig>
    if (data && data.v === 1 && typeof data.config === 'string' && typeof data.publishedAt === 'string') return data as SharedConfig
  } catch {
    /* ignore */
  }
  return null
}
