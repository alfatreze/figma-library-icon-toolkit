import { DEFAULT_SETTINGS, Settings } from '../types'

/** Settings that describe the library (shared by the team). Window size, Labs acknowledgement and the sync token stay local. */
const KEYS: (keyof Settings)[] = [
  'namespace', 'profile', 'scanMode', 'ignoreSegments', 'ignoreVariantValues', 'libSizeMode', 'libWidth', 'libHeight', 'maxIconSize',
  'colorMode', 'tokenNaming', 'strokePolicy', 'strokeTable', 'outlineStrokes', 'precision', 'formats', 'zipName', 'categorySource',
  'codeConnectUrl', 'devResourceUrl', 'splitByCategory', 'duplicateNames', 'aliasDuplicates', 'leafName', 'leafNameMode', 'compositeFrames'
]

export function exportConfig(settings: Settings): string {
  const out: Record<string, unknown> = { $schema: 'icon-library-toolkit/config@1' }
  for (const k of KEYS) out[k] = settings[k]
  return JSON.stringify(out, null, 2) + '\n'
}

/** Merges a config file over the current settings; unknown or wrongly typed keys are ignored and reported. */
export function parseConfig(text: string, current: Settings): { settings: Settings; applied: string[]; ignored: string[] } {
  const data = JSON.parse(text) as Record<string, unknown>
  const applied: string[] = []
  const ignored: string[] = []
  const next: Settings = { ...current }
  for (const [k, v] of Object.entries(data)) {
    if (k === '$schema') continue
    if (!(KEYS as string[]).includes(k)) {
      ignored.push(k)
      continue
    }
    const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k]
    const sameType = typeof v === typeof def && Array.isArray(v) === Array.isArray(def)
    if (!sameType) {
      ignored.push(k)
      continue
    }
    if (def && typeof def === 'object' && !Array.isArray(def)) (next as unknown as Record<string, unknown>)[k] = { ...(def as object), ...(v as object) }
    else (next as unknown as Record<string, unknown>)[k] = v
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
