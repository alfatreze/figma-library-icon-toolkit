import { migrateSettings, SETTINGS_VERSION } from '../core/settingsSchema'
import { DEFAULT_SETTINGS, Settings } from '../types'

export const SETTINGS_KEY = 'ilt:settings:v1'

/** Reads saved settings: migrated to the current version and validated key by key, so one bad value never resets the rest. */
export async function loadSettings(): Promise<Settings> {
  try {
    const stored = await figma.clientStorage.getAsync(SETTINGS_KEY)
    if (stored && typeof stored === 'object') return migrateSettings(stored)
  } catch (e) {
    console.warn('[icon-toolkit] could not read saved settings, using defaults', e)
  }
  return { ...DEFAULT_SETTINGS }
}

export function serializeSettings(settings: Settings, size: { w: number; h: number }) {
  return { ...settings, windowWidth: size.w, windowHeight: size.h, settingsVersion: SETTINGS_VERSION }
}
