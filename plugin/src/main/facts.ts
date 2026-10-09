import { Facts, Padding, PaintFact } from '../types'

export const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE', 'RECTANGLE', 'LINE'])

export function emptyFacts(): Facts {
  return {
    paints: [], leafCount: 0, hasText: false, hasImage: false, hasGradient: false, hasEffects: false, hasHidden: false,
    hasLocked: false, emptyContainers: false, hasMask: false, hasBlend: false, hasOpacity: false, hasRotation: false,
    nonCenterStroke: false, dashedStroke: false, rootBackground: false, clipsContent: null, hasNestedInstance: false
  }
}

export function toHex(c: RGB): string {
  const h = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

const variableInfos = new Map<string, { name: string; collection?: string } | null>()
const collectionNames = new Map<string, string>()

/** variable and collection names are cached for speed; a new scan must see renames */
export function resetFactCaches(): void {
  variableInfos.clear()
  collectionNames.clear()
}

export async function variableInfo(id: string): Promise<{ name: string; collection?: string } | null> {
  if (variableInfos.has(id)) return variableInfos.get(id) ?? null
  let info: { name: string; collection?: string } | null = null
  try {
    const v = await figma.variables.getVariableByIdAsync(id)
    if (v) {
      let collection = collectionNames.get(v.variableCollectionId)
      if (collection === undefined) {
        const c = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId)
        collection = c ? c.name : ''
        collectionNames.set(v.variableCollectionId, collection)
      }
      info = { name: v.name, collection: collection || undefined }
    }
  } catch {
    info = null
  }
  variableInfos.set(id, info)
  return info
}

export async function variableName(id: string): Promise<string | null> {
  return (await variableInfo(id))?.name ?? null
}

async function collectPaints(node: SceneNode, facts: Facts): Promise<void> {
  const n = node as GeometryMixin & SceneNode
  const read = async (role: 'fill' | 'stroke', paints: ReadonlyArray<Paint> | PluginAPI['mixed']) => {
    if (!Array.isArray(paints)) return
    for (const paint of paints as ReadonlyArray<Paint>) {
      if (paint.visible === false) continue
      if (paint.type === 'SOLID') {
        const alias = paint.boundVariables?.color
        const info = alias ? await variableInfo(alias.id) : null
        const p: PaintFact = {
          role,
          hex: toHex(paint.color),
          opacity: paint.opacity ?? 1,
          variable: info?.name,
          collection: info?.collection
        }
        facts.paints.push(p)
      } else if (paint.type === 'IMAGE') facts.hasImage = true
      else if (paint.type.startsWith('GRADIENT')) facts.hasGradient = true
    }
  }
  if ('fills' in n) await read('fill', n.fills)
  if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.some((s) => s.visible !== false)) {
    const weight = 'strokeWeight' in n ? n.strokeWeight : 1
    if (weight === figma.mixed || (typeof weight === 'number' && weight > 0)) {
      await read('stroke', n.strokes)
      if ('strokeAlign' in n && n.strokeAlign !== 'CENTER') facts.nonCenterStroke = true
      if ('dashPattern' in n && n.dashPattern.length > 0) facts.dashedStroke = true
    }
  }
}

function commonFlags(node: SceneNode, facts: Facts, isRoot: boolean): void {
  if ('opacity' in node && node.opacity < 0.999) facts.hasOpacity = true
  if ('blendMode' in node && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH') facts.hasBlend = true
  if ('effects' in node && node.effects.some((e) => e.visible !== false)) facts.hasEffects = true
  if ('isMask' in node && node.isMask) facts.hasMask = true
  if (!isRoot && 'rotation' in node && Math.abs(node.rotation) > 0.01) facts.hasRotation = true
}

/**
 * Is this layer an icon-shaped thing (vectors only)?
 * `allowComposite` (Labs): also accept frames built from instances of other components; by default those are layout, not icons.
 */
export function isIconish(node: SceneNode, allowComposite = false): boolean {
  let vectors = 0
  let bad = false
  const walk = (n: SceneNode) => {
    if (bad || !n.visible) return
    if (n.type === 'TEXT') {
      bad = true
      return
    }
    if (!allowComposite && n !== node && n.type === 'INSTANCE') {
      bad = true
      return
    }
    if (VECTOR_TYPES.has(n.type)) {
      vectors++
      return
    }
    if ('children' in n) for (const c of n.children) walk(c)
  }
  walk(node)
  return !bad && vectors > 0
}

export async function gatherFacts(root: SceneNode): Promise<{ facts: Facts; padding: Padding | null }> {
  const facts = emptyFacts()
  let union: Rect | null = null
  let anyBounds = false

  const walk = async (node: SceneNode, isRoot: boolean): Promise<void> => {
    if (!node.visible) {
      if (!isRoot) facts.hasHidden = true
      return
    }
    if (!isRoot && node.locked) facts.hasLocked = true
    commonFlags(node, facts, isRoot)

    if (node.type === 'TEXT') {
      facts.hasText = true
      return
    }
    if (VECTOR_TYPES.has(node.type)) {
      facts.leafCount++
      await collectPaints(node, facts)
      const rb = (node as SceneNode & { absoluteRenderBounds: Rect | null }).absoluteRenderBounds
      if (rb) {
        anyBounds = true
        union = union
          ? {
              x: Math.min(union.x, rb.x), y: Math.min(union.y, rb.y),
              width: Math.max(union.x + union.width, rb.x + rb.width) - Math.min(union.x, rb.x),
              height: Math.max(union.y + union.height, rb.y + rb.height) - Math.min(union.y, rb.y)
            }
          : { ...rb }
      }
      return
    }
    if ('children' in node) {
      if (!isRoot && node.type === 'INSTANCE') facts.hasNestedInstance = true
      if (node.children.length === 0 && !isRoot) facts.emptyContainers = true
      for (const c of node.children) await walk(c, false)
    }
  }

  if ('fills' in root && Array.isArray(root.fills) && root.fills.some((f) => f.visible !== false)) {
    facts.rootBackground = true
  }
  if ('clipsContent' in root) facts.clipsContent = root.clipsContent
  await walk(root, true)

  let padding: Padding | null = null
  const box = root.absoluteBoundingBox
  const u = union as Rect | null
  if (box && u && anyBounds) {
    padding = {
      left: round(u.x - box.x),
      top: round(u.y - box.y),
      right: round(box.x + box.width - (u.x + u.width)),
      bottom: round(box.y + box.height - (u.y + u.height))
    }
  }
  return { facts, padding }
}

const round = (n: number) => Math.round(n * 100) / 100
