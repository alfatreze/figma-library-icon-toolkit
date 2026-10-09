import { planRenames } from '../core/fixes'
import { ApplyFixRequest, FixActionId, FixCandidate, FixResult, LayerRename } from '../types'
import { leavesOf, pageOf } from './diagnose'
import { log } from '../log'

async function resolveComponent(target: { componentId?: string; componentKey?: string }): Promise<ComponentNode> {
  if (target.componentId) {
    const n = await figma.getNodeByIdAsync(target.componentId)
    if (n && n.type === 'COMPONENT') return n
  }
  if (target.componentKey) return figma.importComponentByKeyAsync(target.componentKey)
  throw new Error('Component not found')
}

/** true when the node sits anywhere inside an instance: such layers cannot be replaced, converted or renamed in place */
const insideInstance = (node: SceneNode): boolean => {
  let p: BaseNode | null = node.parent
  while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') {
    if (p.type === 'INSTANCE') return true
    p = p.parent
  }
  return false
}

const inAutoLayout = (parent: BaseNode & ChildrenMixin): boolean => 'layoutMode' in parent && (parent as unknown as FrameNode).layoutMode !== 'NONE'

/**
 * Copies how `from` sits in its parent onto `to`.
 * In an auto-layout parent position is owned by the layout (setting x/y or a transform is ignored or throws), so only the
 * sizing mode / absolute positioning is carried over; elsewhere the transform and constraints are copied.
 */
function carryLayout(from: SceneNode, to: SceneNode, parent: BaseNode & ChildrenMixin): void {
  const f = from as SceneNode & Partial<LayoutMixin & ConstraintMixin>
  const t = to as SceneNode & Partial<LayoutMixin & ConstraintMixin>
  const auto = inAutoLayout(parent)
  const absolute = auto && f.layoutPositioning === 'ABSOLUTE'
  try {
    // absolute first: only an absolute child of an auto-layout frame may be positioned by transform
    if (absolute && 'layoutPositioning' in t) t.layoutPositioning = 'ABSOLUTE'
    if (!auto || absolute) {
      to.relativeTransform = from.relativeTransform
      if (f.constraints && 'constraints' in t) t.constraints = f.constraints
    }
    if (auto && !absolute) {
      // HUG is only valid on frames and text; an instance cannot hug
      const h = f.layoutSizingHorizontal
      const v = f.layoutSizingVertical
      if (h && 'layoutSizingHorizontal' in t) t.layoutSizingHorizontal = h === 'HUG' ? 'FIXED' : h
      if (v && 'layoutSizingVertical' in t) t.layoutSizingVertical = v === 'HUG' ? 'FIXED' : v
    }
  } catch (e) {
    log.debug('apply', 'best effort: the node is already in the right place in the tree', e)
  }
}

/** the properties designers set on the layer itself, not on its artwork */
async function carryLayerProps(from: SceneNode, to: SceneNode): Promise<void> {
  const f = from as SceneNode & Partial<MinimalBlendMixin & ReactionMixin & ExportMixin>
  const t = to as SceneNode & Partial<MinimalBlendMixin & ReactionMixin & ExportMixin>
  to.name = from.name // the layer name is the designer's, not the component's
  to.visible = from.visible
  to.locked = from.locked
  if (f.opacity !== undefined && 'opacity' in t) t.opacity = f.opacity
  if (f.blendMode !== undefined && 'blendMode' in t) t.blendMode = f.blendMode
  if (f.exportSettings && 'exportSettings' in t && f.exportSettings.length) t.exportSettings = f.exportSettings
  // prototype interactions on the old layer would be lost with it
  if (f.reactions && f.reactions.length && 'setReactionsAsync' in t) await t.setReactionsAsync!([...f.reactions])
}

// ---- what other layers and the design system hold on to -----------------------------------------------------------------

type AnyReaction = { actions?: { type?: string; destinationId?: string | null }[]; action?: { type?: string; destinationId?: string | null } | null }
const actionsOf = (r: AnyReaction) => [...(r.actions ?? []), ...(r.action ? [r.action] : [])]
const pointsAt = (r: AnyReaction, id: string) => actionsOf(r).some((a) => a.type === 'NODE' && a.destinationId === id)

/** the layers of a page that carry prototype interactions, found once per batch of fixes (a page walk per fix would be too slow) */
let reactionHolders = new Map<string, SceneNode[]>()
export const resetApplyCaches = () => {
  reactionHolders = new Map()
}
function holdersOn(page: PageNode): SceneNode[] {
  let list = reactionHolders.get(page.id)
  if (!list) {
    list = page.findAll((n) => 'reactions' in n && Array.isArray((n as SceneNode & ReactionMixin).reactions) && (n as SceneNode & ReactionMixin).reactions.length > 0)
    reactionHolders.set(page.id, list)
  }
  return list
}

/**
 * Prototype links from OTHER layers that point at the layer being replaced: without this they would dangle once it is removed.
 * Returns how many layers were repointed. Only the current page is searched (prototype flows do not cross pages).
 */
async function retargetReactions(oldNode: SceneNode, newNode: SceneNode): Promise<number> {
  const page = pageOf(oldNode)
  if (!page) return 0
  const done: { holder: SceneNode; before: Reaction[] }[] = []
  try {
    for (const holder of holdersOn(page)) {
      if (holder === oldNode || holder === newNode || holder.removed) continue
      const list = (holder as SceneNode & ReactionMixin).reactions as unknown as AnyReaction[]
      if (!list.some((r) => pointsAt(r, oldNode.id))) continue
      const next = list.map((r) => {
        if (!pointsAt(r, oldNode.id)) return r
        const fix = (a: { type?: string; destinationId?: string | null }) => (a.type === 'NODE' && a.destinationId === oldNode.id ? { ...a, destinationId: newNode.id } : a)
        return { ...r, ...(r.actions ? { actions: r.actions.map(fix) } : {}), ...(r.action ? { action: fix(r.action) } : {}) }
      })
      done.push({ holder, before: [...(holder as SceneNode & ReactionMixin).reactions] })
      await (holder as SceneNode & ReactionMixin).setReactionsAsync(next as unknown as Reaction[])
    }
  } catch (e) {
    // all or nothing: put the links already moved back, so none of them points at an instance that is about to be removed
    for (const d of done.reverse()) {
      try {
        await (d.holder as SceneNode & ReactionMixin).setReactionsAsync(d.before)
      } catch (err) {
        log.debug('apply', 'could not restore a prototype link', err)
      }
    }
    throw e
  }
  // the new layer carries the old one's own interactions and may be the target of later fixes in this batch
  if ('reactions' in newNode && (newNode as SceneNode & ReactionMixin).reactions.length) holdersOn(page).push(newNode)
  return done.length
}

/** a boolean component property that showed or hid the old layer should keep doing so for the instance (best effort) */
function carryPropertyReferences(from: SceneNode, to: SceneNode): string | null {
  const refs = (from as SceneNode & { componentPropertyReferences?: Record<string, string> | null }).componentPropertyReferences
  if (!refs || !refs.visible || !('componentPropertyReferences' in to)) return null
  try {
    ;(to as SceneNode & { componentPropertyReferences: Record<string, string> }).componentPropertyReferences = { visible: refs.visible }
    return null
  } catch (e) {
    log.debug('apply', 'visible property reference not carried', e)
    return 'the show/hide component property was not carried over'
  }
}

/** copies paints and keeps their colour-variable bindings (a plain copy of the paint array drops them); the ones that cannot be rebound stay as plain colours */
async function carryPaints(paints: readonly Paint[]): Promise<{ paints: Paint[]; bound: number; lost: number }> {
  const out: Paint[] = []
  let bound = 0
  let lost = 0
  for (const p of paints) {
    const id = p.type === 'SOLID' ? (p as SolidPaint).boundVariables?.color?.id : undefined
    if (!id) {
      out.push(p)
      continue
    }
    try {
      const v = await figma.variables.getVariableByIdAsync(id)
      if (!v) throw new Error('variable not available in this file')
      out.push(figma.variables.setBoundVariableForPaint(p as SolidPaint, 'color', v))
      bound++
    } catch (e) {
      log.debug('apply', 'variable binding not carried', e)
      out.push(p)
      lost++
    }
  }
  return { paints: out, bound, lost }
}

async function replaceWithInstance(node: SceneNode, req: ApplyFixRequest, target: { componentId?: string; componentKey?: string }): Promise<FixResult> {
  const parent = node.parent
  if (!parent || !('children' in parent) || parent.type === 'INSTANCE' || insideInstance(node)) return { id: req.id, ok: false, message: 'Cannot replace a layer inside an instance' }
  const comp = await resolveComponent(target)
  const index = parent.children.indexOf(node as SceneNode)
  const inst = comp.createInstance()
  let carried = 0
  let bound = 0
  let lost = 0
  const notes: string[] = []
  try {
    parent.insertChild(index, inst)
    if (Math.abs(inst.width - node.width) > 0.01 || Math.abs(inst.height - node.height) > 0.01) inst.resize(node.width, node.height)
    carryLayout(node, inst, parent)
    await carryLayerProps(node, inst)
    const propNote = carryPropertyReferences(node, inst)
    if (propNote) notes.push(propNote)

    // carry colour as fill overrides when both sides have the same number of leaves; variable bindings go with them
    const from = leavesOf(node)
    const to = leavesOf(inst)
    if (from.length === to.length) {
      for (let i = 0; i < from.length; i++) {
        const l = from[i]
        const src = l.node as GeometryMixin
        const t = to[i].node as GeometryMixin
        if (!l.hex || l.hex === to[i].hex) continue
        // the colour comes from the fill when there is one, otherwise from the stroke (stroke-only icons)
        const fillOk = Array.isArray(src.fills) && src.fills.some((p) => p.type === 'SOLID' && p.visible !== false)
        if (fillOk) {
          const r = await carryPaints(src.fills as Paint[])
          t.fills = r.paints
          bound += r.bound
          lost += r.lost
        } else if (Array.isArray(src.strokes) && src.strokes.length) {
          const r = await carryPaints(src.strokes as Paint[])
          t.strokes = r.paints
          bound += r.bound
          lost += r.lost
        } else continue
        carried++
      }
    }
  } catch (e) {
    inst.remove() // never leave a half-configured copy next to the original
    throw e
  }
  // repoint other layers' prototype links while the old layer still exists; a failure here must not leave a half-done fix
  let repointed = 0
  try {
    repointed = await retargetReactions(node, inst)
  } catch (e) {
    inst.remove()
    throw e
  }
  node.remove()
  if (bound) notes.push(`${bound} colour variable binding${bound > 1 ? 's' : ''} kept`)
  if (lost) notes.push(`${lost} variable binding${lost > 1 ? 's' : ''} could not be kept (the variable is not available here), the colour was copied`)
  if (repointed) notes.push(`${repointed} prototype link${repointed > 1 ? 's' : ''} repointed to the instance`)
  const detail = [carried ? `${carried} colour override${carried > 1 ? 's' : ''} kept` : '', ...notes].filter(Boolean)
  return { id: req.id, ok: true, newNodeId: inst.id, message: `Replaced with an instance of “${comp.name}”${detail.length ? ` (${detail.join('; ')})` : ''}` }
}

async function applyRenames(renames: LayerRename[]): Promise<number> {
  let n = 0
  for (const r of renames) {
    const node = await figma.getNodeByIdAsync(r.nodeId) // sync getNodeById is not allowed with dynamic-page access
    // skip layers the designer renamed since the scan: the plan was made for the old name
    if (node && 'name' in node && node.name !== r.to && node.name === r.from) {
      node.name = r.to
      n++
    }
  }
  return n
}

async function convertToComponent(node: SceneNode, req: ApplyFixRequest, wrap: boolean): Promise<FixResult> {
  const parent = node.parent
  if (!parent || !('children' in parent) || parent.type === 'INSTANCE' || insideInstance(node)) return { id: req.id, ok: false, message: 'Cannot convert a layer inside an instance' }
  // layer renames are applied only after the conversion worked, so a failed fix leaves the layer exactly as it was
  const applyLeafRenames = async () => {
    if (!req.renameLeaves) return
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
    const auto = inAutoLayout(parent)
    const original = { x: node.x, y: node.y }
    const frame = figma.createFrame()
    try {
      parent.insertChild(index, frame)
      frame.name = req.name || node.name
      frame.resize(boxW, boxH)
      if (!auto) frame.relativeTransform = [[1, 0, original.x - (boxW - node.width) / 2], [0, 1, original.y - (boxH - node.height) / 2]]
      else carryLayout(node, frame, parent)
      frame.fills = []
      frame.clipsContent = true
      frame.appendChild(node as SceneNode)
      node.x = (boxW - node.width) / 2
      node.y = (boxH - node.height) / 2
      comp = figma.createComponentFromNode(frame)
    } catch (e) {
      // put the layer back where it was and remove the wrapper
      if (node.parent === frame) parent.insertChild(Math.min(index, parent.children.length), node as SceneNode)
      if (!auto && !frame.removed) {
        node.x = original.x
        node.y = original.y
      }
      if (!frame.removed) frame.remove()
      throw e
    }
  } else {
    comp = figma.createComponentFromNode(node)
    if (req.name) comp.name = req.name
  }
  let note = ''
  try {
    await applyLeafRenames()
  } catch (e) {
    note = ` (layer names could not all be standardised: ${e instanceof Error ? e.message : String(e)})`
  }
  return { id: req.id, ok: true, newNodeId: comp.id, message: `Converted to component “${comp.name}”${note}` }
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
