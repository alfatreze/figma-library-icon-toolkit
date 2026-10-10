import { RenameItem } from '../types'
import { log } from '../log'

export interface RenameResult {
  ok: number
  /** left alone: the layer has another name now, is a variant of a component set, an instance, or lives inside an instance */
  skipped: number
  failed: number
  message: string
}

const insideInstance = (node: BaseNode): boolean => {
  let p: BaseNode | null = node.parent
  while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') {
    if (p.type === 'INSTANCE') return true
    p = p.parent
  }
  return false
}

/**
 * Renames layers (Labs). A layer is renamed only when it still has the name it had at the scan, so nothing a designer changed since is
 * overwritten; variants (their names are property=value pairs), instances and anything inside an instance are never renamed here.
 * The caller makes it one undo step.
 */
export async function applyRenames(items: RenameItem[]): Promise<RenameResult> {
  let ok = 0
  let skipped = 0
  let failed = 0
  let message = ''
  for (const it of items) {
    try {
      const node = await figma.getNodeByIdAsync(it.nodeId)
      if (!node || node.removed || !('name' in node) || node.type === 'PAGE' || node.type === 'DOCUMENT') {
        failed++
        continue
      }
      if (node.type === 'INSTANCE' || (node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET') || insideInstance(node)) {
        skipped++
        continue
      }
      if (node.name !== it.from) {
        skipped++
        continue
      }
      node.name = it.to
      ok++
    } catch (e) {
      failed++
      message = e instanceof Error ? e.message : String(e)
      log.debug('rename', 'could not rename a layer', e)
    }
  }
  return { ok, skipped, failed, message }
}
