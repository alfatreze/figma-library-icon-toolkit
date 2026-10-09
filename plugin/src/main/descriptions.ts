import { DescriptionItem } from '../types'
import { log } from '../log'

export interface DescriptionsResult {
  ok: number
  /** left alone: the description in the file is not the one that was scanned, or the component belongs to a library */
  skipped: number
  failed: number
  message: string
}

/**
 * Writes component descriptions (Labs). Each one is checked against the file first: only a COMPONENT of this file whose description
 * is still the one that was scanned is changed, so nothing a designer typed since the scan is overwritten. The caller makes it one undo step.
 */
export async function applyDescriptions(items: DescriptionItem[]): Promise<DescriptionsResult> {
  let ok = 0
  let skipped = 0
  let failed = 0
  let message = ''
  for (const it of items) {
    try {
      const node = await figma.getNodeByIdAsync(it.nodeId)
      if (!node || node.removed || node.type !== 'COMPONENT') {
        failed++
        continue
      }
      if (node.remote || node.description.trim() !== it.from.trim()) {
        skipped++
        continue
      }
      node.description = it.to
      ok++
    } catch (e) {
      failed++
      message = e instanceof Error ? e.message : String(e)
      log.debug('descriptions', 'could not write a description', e)
    }
  }
  return { ok, skipped, failed, message }
}
