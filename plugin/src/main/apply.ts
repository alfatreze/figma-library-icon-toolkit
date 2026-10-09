import { planRenames } from '../core/fixes'
import { ApplyFixRequest, FixActionId, FixCandidate, FixResult, LayerRename } from '../types'
import { leavesOf } from './diagnose'

async function resolveComponent(target: { componentId?: string; componentKey?: string }): Promise<ComponentNode> {
  if (target.componentId) {
    const n = await figma.getNodeByIdAsync(target.componentId)
    if (n && n.type === 'COMPONENT') return n
  }
  if (target.componentKey) return figma.importComponentByKeyAsync(target.componentKey)
  throw new Error('Component not found')
}

/** copy placement + layout props from the replaced node to the new node */
function copyPlacement(from: SceneNode, to: SceneNode) {
  const f = from as SceneNode & LayoutMixin
  const t = to as SceneNode & LayoutMixin
  try {
    if ('layoutPositioning' in f) t.layoutPositioning = f.layoutPositioning
    if ('layoutAlign' in f) t.layoutAlign = f.layoutAlign
    if ('layoutGrow' in f) t.layoutGrow = f.layoutGrow
    if ('constraints' in f && 'constraints' in t) (t as unknown as ConstraintMixin).constraints = (f as unknown as ConstraintMixin).constraints
  } catch {
    /* best effort */
  }
}

async function replaceWithInstance(node: SceneNode, req: ApplyFixRequest, target: { componentId?: string; componentKey?: string }): Promise<FixResult> {
  const parent = node.parent
  if (!parent || !('children' in parent) || parent.type === 'INSTANCE') return { id: req.id, ok: false, message: 'Cannot replace a layer inside an instance' }
  const comp = await resolveComponent(target)
  const index = parent.children.indexOf(node as SceneNode)
  const inst = comp.createInstance()
  parent.insertChild(index, inst)
  const keepName = node.name
  inst.relativeTransform = node.relativeTransform
  if (Math.abs(inst.width - node.width) > 0.01 || Math.abs(inst.height - node.height) > 0.01) inst.resize(node.width, node.height)
  copyPlacement(node, inst)
  if ('opacity' in node) inst.opacity = node.opacity

  // carry colour as fill overrides when both sides have the same number of leaves
  const from = leavesOf(node)
  const to = leavesOf(inst)
  let carried = 0
  if (from.length === to.length) {
    from.forEach((l, i) => {
      const f = (l.node as GeometryMixin).fills
      const t = to[i].node as GeometryMixin
      if (Array.isArray(f) && f.length && l.hex && l.hex !== to[i].hex) {
        t.fills = f as Paint[]
        carried++
      }
    })
  }
  node.remove()
  void keepName
  return { id: req.id, ok: true, newNodeId: inst.id, message: `Replaced with an instance of “${comp.name}”${carried ? ` (${carried} colour override${carried > 1 ? 's' : ''} kept)` : ''}` }
}

async function applyRenames(renames: LayerRename[]): Promise<number> {
  let n = 0
  for (const r of renames) {
    const node = await figma.getNodeByIdAsync(r.nodeId) // sync getNodeById is not allowed with dynamic-page access
    if (node && 'name' in node && node.name !== r.to) {
      node.name = r.to
      n++
    }
  }
  return n
}

async function convertToComponent(node: SceneNode, req: ApplyFixRequest, wrap: boolean): Promise<FixResult> {
  const parent = node.parent
  if (!parent || !('children' in parent) || parent.type === 'INSTANCE') return { id: req.id, ok: false, message: 'Cannot convert a layer inside an instance' }
  if (req.renameLeaves) {
    const leaves = leavesOf(node)
    const renames = planRenames(leaves.map((l) => ({ id: l.node.id, name: l.node.name, hex: l.hex })), req.leafName)
    for (const r of renames) {
      const n = await figma.getNodeByIdAsync(r.nodeId)
      if (n && 'name' in n) n.name = r.to
    }
  }
  let comp: ComponentNode
  if (wrap || node.type !== 'FRAME') {
    const w = Math.max(req.gridWidth, 1)
    const h = Math.max(req.gridHeight, 1)
    const boxW = node.width <= w ? w : node.width
    const boxH = node.height <= h ? h : node.height
    const index = parent.children.indexOf(node as SceneNode)
    const frame = figma.createFrame()
    parent.insertChild(index, frame)
    frame.name = req.name || node.name
    frame.resize(boxW, boxH)
    frame.relativeTransform = [[1, 0, node.x - (boxW - node.width) / 2], [0, 1, node.y - (boxH - node.height) / 2]]
    frame.fills = []
    frame.clipsContent = true
    frame.appendChild(node as SceneNode)
    node.x = (boxW - node.width) / 2
    node.y = (boxH - node.height) / 2
    comp = figma.createComponentFromNode(frame)
  } else {
    comp = figma.createComponentFromNode(node)
    if (req.name) comp.name = req.name
  }
  return { id: req.id, ok: true, newNodeId: comp.id, message: `Converted to component “${comp.name}”` }
}

/** Applies fixes one by one. Each fix is validated first; the caller groups them into one undo step. */
export async function applyFix(req: ApplyFixRequest, fix: FixCandidate): Promise<FixResult> {
  try {
    const node = (await figma.getNodeByIdAsync(fix.nodeId)) as SceneNode | null
    if (!node || node.removed) return { id: req.id, ok: false, message: 'The layer no longer exists. Scan again.' }
    if (node.type !== fix.nodeType) return { id: req.id, ok: false, message: 'The layer changed since the scan. Scan again.' }
    const action: FixActionId = req.action
    if (action === 'replace-with-instance') {
      if (!fix.target) return { id: req.id, ok: false, message: 'No target component' }
      return await replaceWithInstance(node, req, { componentId: fix.target.componentId, componentKey: fix.target.componentKey })
    }
    if (action === 'convert-to-component') return await convertToComponent(node, req, false)
    if (action === 'wrap-and-convert') return await convertToComponent(node, req, true)
    if (action === 'rename-layers') {
      const n = await applyRenames(fix.renames ?? [])
      return { id: req.id, ok: true, message: `Renamed ${n} layer${n === 1 ? '' : 's'}` }
    }
    if (action === 'apply-name') {
      if (!req.name) return { id: req.id, ok: false, message: 'No name' }
      node.name = req.name
      return { id: req.id, ok: true, message: `Renamed to “${req.name}”` }
    }
    return { id: req.id, ok: false, message: 'Unknown action' }
  } catch (e) {
    return { id: req.id, ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
