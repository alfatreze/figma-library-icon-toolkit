import { DEFAULT_SETTINGS, Settings } from '../types'

/**
 * One place that says, for every setting: is it shared with the team (toolkit.config.json / the file) or local to this computer,
 * and what a valid value looks like. Imported configs, the config published in a Figma file and saved local settings all go through
 * `checkSetting`, so a hand-edited or hostile file can never put arbitrary text into generated code.
 * `SCHEMA` is typed over `keyof Settings`: adding a setting without classifying it is a compile error.
 */

export const SETTINGS_VERSION = 2

type Check<T> = (v: unknown) => T | undefined
interface Rule<T> {
  shared: boolean
  check: Check<T>
}

const oneOf = <T extends string>(...allowed: T[]): Check<T> => (v) => (typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : undefined)
const bool: Check<boolean> = (v) => (typeof v === 'boolean' ? v : undefined)
const int = (min: number, max: number): Check<number> => (v) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined)
const num = (min: number, max: number): Check<number> => (v) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined)
const str = (maxLen: number): Check<string> => (v) => (typeof v === 'string' && v.length <= maxLen && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v) ? v : undefined)
const strList = (maxItems: number, maxLen: number): Check<string[]> => (v) => {
  if (!Array.isArray(v) || v.length > maxItems) return undefined
  const s = str(maxLen)
  return v.every((x) => s(x) !== undefined) ? (v as string[]) : undefined
}
/** only http(s) URLs (or empty) */
const url: Check<string> = (v) => (typeof v === 'string' && v.length <= 500 && (v === '' || /^https?:\/\/[^\s"'<>`]+$/.test(v)) ? v : undefined)

/** object of known keys: unknown keys are dropped, wrong values fall back to the default */
function shape<T extends object>(rules: { [K in keyof T]: Check<T[K]> }, fallback: T): Check<T> {
  return (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
    const out = { ...fallback } as T
    for (const k of Object.keys(rules) as (keyof T)[]) {
      if (!(k in (v as object))) continue
      const ok = rules[k]((v as Record<string, unknown>)[k as string])
      if (ok !== undefined) out[k] = ok
    }
    return out
  }
}

const rule = <T>(shared: boolean, check: Check<T>): Rule<T> => ({ shared, check })

export const SCHEMA: { [K in keyof Settings]: Rule<Settings[K]> } = {
  namespace: rule(true, str(60)),
  profile: rule(true, oneOf('lenient', 'standard', 'strict')),
  scanMode: rule(true, oneOf('auto', 'components', 'frames', 'loose')),
  scanScope: rule(false, oneOf('selection', 'page', 'document')),
  leafName: rule(true, str(60)),
  leafNameMode: rule(true, oneOf('auto', 'fixed')),
  ignoredDuplicates: rule(false, strList(2000, 40)),
  aliasDuplicates: rule(true, bool),
  usageOnly: rule(false, bool),
  duplicateNames: rule(true, oneOf('block', 'category', 'suffix')),
  categorySource: rule(true, oneOf('auto', 'path', 'section', 'frame', 'page', 'none')),
  splitByCategory: rule(true, bool),
  ignoreSegments: rule(true, strList(50, 60)),
  ignoreVariantValues: rule(true, strList(50, 60)),
  libSizeMode: rule(true, oneOf('auto', 'manual')),
  libWidth: rule(true, num(1, 512)),
  libHeight: rule(true, num(1, 512)),
  maxIconSize: rule(true, num(1, 4096)),
  colorMode: rule(true, oneOf('themeable', 'original')),
  tokenNaming: rule(
    true,
    shape<Settings['tokenNaming']>(
      { mode: oneOf('path', 'collection', 'custom', 'none'), prefix: str(40), stripSegments: str(200), mapping: str(20000) },
      DEFAULT_SETTINGS.tokenNaming
    )
  ),
  strokePolicy: rule(true, oneOf('constant', 'scale', 'table')),
  strokeTable: rule(true, (v) => (typeof v === 'string' && v.length <= 400 && /^[0-9.,:\s]*$/.test(v) ? v : undefined)),
  outlineStrokes: rule(true, bool),
  labs: rule(false, bool),
  labsBranchAck: rule(false, bool),
  compositeFrames: rule(true, oneOf('ignore', 'include')),
  repo: rule(
    false,
    shape<Settings['repo']>(
      { provider: oneOf('github', 'gitlab'), repo: str(200), subdir: str(200), branch: str(100), token: str(400) },
      DEFAULT_SETTINGS.repo
    )
  ),
  precision: rule(true, int(1, 6)),
  formats: rule(
    true,
    shape<Settings['formats']>(
      { svg: bool, sprite: bool, html: bool, mask: bool, angularModern: bool, angularClassic: bool, react: bool, webComponent: bool, codeConnect: bool },
      DEFAULT_SETTINGS.formats
    )
  ),
  codeConnectUrl: rule(true, url),
  devResourceUrl: rule(true, url),
  zipName: rule(true, str(80)),
  windowWidth: rule(false, num(360, 1000)),
  windowHeight: rule(false, num(460, 1100))
}

export const SHARED_KEYS = (Object.keys(SCHEMA) as (keyof Settings)[]).filter((k) => SCHEMA[k].shared)

/** the validated value, or undefined when it is not acceptable for this setting */
export function checkSetting<K extends keyof Settings>(key: K, value: unknown): Settings[K] | undefined {
  return (SCHEMA[key].check as Check<Settings[K]>)(value)
}

/**
 * Upgrades saved settings to the current version and validates every key (invalid or missing → default).
 * v1 → v2: `useTokens` toggle became `tokenNaming.mode`; the old default zip name "icons" produced "icons-icons.zip".
 */
export function migrateSettings(stored: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS, formats: { ...DEFAULT_SETTINGS.formats }, tokenNaming: { ...DEFAULT_SETTINGS.tokenNaming }, repo: { ...DEFAULT_SETTINGS.repo } }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out
  const s = { ...(stored as Record<string, unknown>) }
  if (s.zipName === 'icons') s.zipName = ''
  if (s.useTokens === false && !s.tokenNaming) s.tokenNaming = { ...DEFAULT_SETTINGS.tokenNaming, mode: 'none' }
  for (const k of Object.keys(SCHEMA) as (keyof Settings)[]) {
    if (!(k in s)) continue
    const ok = checkSetting(k, s[k])
    if (ok !== undefined) (out as unknown as Record<string, unknown>)[k] = ok
  }
  return out
}
