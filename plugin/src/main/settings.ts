import { DEFAULT_SETTINGS, Settings } from '../types'

export const SETTINGS_KEY = 'ilt:settings:v1'

/** Reads saved settings, filling new fields with defaults and migrating older versions. */
export async function loadSettings(): Promise<Settings> {
  try {
    const stored = (await figma.clientStorage.getAsync(SETTINGS_KEY)) as (Partial<Settings> & { useTokens?: boolean }) | undefined
    if (stored && typeof stored === 'object') {
      if (stored.zipName === 'icons') stored.zipName = '' // v0.1.0 default produced "icons-icons.zip"
      const tokenNaming = { ...DEFAULT_SETTINGS.tokenNaming, ...(stored.tokenNaming ?? {}) }
      if (stored.useTokens === false && !stored.tokenNaming) tokenNaming.mode = 'none' // migrate the old on/off toggle
      return {
        ...DEFAULT_SETTINGS,
        ...stored,
        formats: { ...DEFAULT_SETTINGS.formats, ...(stored.formats ?? {}) },
        tokenNaming,
        sync: { ...DEFAULT_SETTINGS.sync, ...(stored.sync ?? {}) }
      }
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULT_SETTINGS }
}
