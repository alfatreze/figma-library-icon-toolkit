import { parseShared, SHARED_KEY, SharedConfig } from '../core/config'

/**
 * Library settings stored in the Figma file so every user (including developers in Dev Mode) sees the same config.
 * Written twice on purpose: on the document root (readable everywhere) and on the first page (a community report says
 * root data written in a branch can be lost on merge while page data merges). Reading prefers the root.
 */
export async function readShared(): Promise<SharedConfig | null> {
  try {
    const fromRoot = parseShared(figma.root.getPluginData(SHARED_KEY))
    if (fromRoot) return fromRoot
  } catch {
    /* fall through */
  }
  try {
    const first = figma.root.children[0]
    if (first) {
      await first.loadAsync()
      return parseShared(first.getPluginData(SHARED_KEY))
    }
  } catch {
    /* not readable here */
  }
  return null
}

export async function writeShared(text: string): Promise<{ ok: boolean; message: string }> {
  try {
    figma.root.setPluginData(SHARED_KEY, text)
  } catch (e) {
    return { ok: false, message: `Could not write to the file (view-only access?): ${e instanceof Error ? e.message : String(e)}` }
  }
  try {
    const first = figma.root.children[0]
    if (first) {
      await first.loadAsync()
      first.setPluginData(SHARED_KEY, text)
    }
  } catch {
    /* the root copy is enough */
  }
  return { ok: true, message: 'Published to this file' }
}
