import { SharedConfig, parseConfig } from '../core/config'
import { DEFAULT_SETTINGS, Settings } from '../types'
import { loadSettings } from './settings'
import { readShared } from './shared'
import { log } from '../log'

/** Effective library settings: published in the file > this user's saved settings > defaults. */
export async function effectiveSettings(): Promise<{ settings: Settings; source: 'file' | 'local' | 'defaults'; shared: SharedConfig | null }> {
  const shared = await readShared()
  if (shared) {
    try {
      return { settings: parseConfig(shared.config, DEFAULT_SETTINGS).settings, source: 'file', shared }
    } catch (e) {
      log.debug('effective', 'fall through', e)
    }
  }
  const local = await loadSettings()
  const touched = JSON.stringify(local.namespace) !== JSON.stringify(DEFAULT_SETTINGS.namespace) || JSON.stringify(local.tokenNaming) !== JSON.stringify(DEFAULT_SETTINGS.tokenNaming)
  return { settings: local, source: touched ? 'local' : 'defaults', shared: null }
}
