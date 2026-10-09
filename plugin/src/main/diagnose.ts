import { compareSignatures, normalisePath, pickDominantLeaf, planRenames } from '../core/fixes'
import { hash32, hash64 } from '../core/hash'
import { FixCandidate, FixKind, FixTarget, LeafNames } from '../types'
import { IDENTITY, Matrix, invert, multiply, orientationKey } from '../core/pathTransform'
import { toHex, VECTOR_TYPES } from './facts'
import { log } from '../log'

const round = (n: number, d = 2) => Number(n.toFixed(d))

export function cleanPageName(name: string): string {
  return name.replace(/^[\s↳→›>\-–—·•]+/u, '').trim() || name.trim()
}
export function pageOf(node: BaseNode): PageNode | null {
  let p: BaseNode | null = node
  while (p && p.type !== 'PAGE') p = p.parent
  return p && p.type === 'PAGE' ? p : null
}

// ---- artwork signatures ------------------------------------------------------

export interface Leaf {
  node: SceneNode
  hex?: string
}

/** vector leaves in z-order (boolean operations count as one leaf) */
export function leavesOf(root: SceneNode): Leaf[] {
  const out: Leaf[] = []
  const walk = (n: SceneNode) => {
    if (!n.visible) return
    if (VECTOR_TYPES.has(n.type)) {
      let hex: string | undefined
      const fills = (n as GeometryMixin).fills
      if (Array.isArray(fills)) {
        const solid = (fills as Paint[]).find((p) => p.type === 'SOLID' && p.visible !== false) as SolidPaint | undefined
        if (solid) hex = toHex(solid.color)
      }
      if (!hex) {
        const strokes = (n as GeometryMixin).strokes
        const solid = Array.isArray(strokes) ? ((strokes as Paint[]).find((p) => p.type === 'SOLID' && p.visible !== false) as SolidPaint | undefined) : undefined
        if (solid) hex = toHex(solid.color)
      }
      out.push({ node: n, hex })
      return
    }
    if ('children' in n) for (const c of n.children) walk(c)
  }
  walk(root)
  return out
}

function geometryOf(n: SceneNode): string {
  try {
    if (n.type === 'VECTOR') return n.vectorPaths.map((p) => `${p.windingRule}:${normalisePath(p.data)}`).join('|')
    const g = (n as GeometryMixin).fillGeometry
    if (Array.isArray(g) && g.length) return g.map((p) => `${p.windingRule}:${normalisePath(p.data)}`).join('|')
    const s = (n as GeometryMixin).strokeGeometry
    if (Array.isArray(s) && s.length) return 'S' + s.map((p) => normalisePath(p.data)).join('|')
  } catch (e) {
    log.debug('diagnose', 'unreadable geometry', e)
  }
  return `${n.type}:${round(n.width)}x${round(n.height)}`
}

function strokeKey(n: SceneNode): string {
  const g = n as SceneNode & Partial<GeometryMixin & { strokeWeight: number | symbol; strokeCap: unknown; strokeJoin: unknown }>
  const strokes = g.strokes
  if (!Array.isArray(strokes) || !strokes.some((p: Paint) => p.visible !== false)) return '~'
  const w = typeof g.strokeWeight === 'number' ? round(g.strokeWeight, 2) : 'mixed'
  return `~${w}/${String(g.strokeCap)}/${String(g.strokeJoin)}`
}

export interface Signature {
  geom: string // artwork + position inside the icon box
  shape: string // artwork only (ignores box size / padding)
  leaves: Leaf[]
}

export function signatureOf(root: SceneNode): Signature {
  const leaves = leavesOf(root)
  const box = root.absoluteBoundingBox
  const shapes: string[] = []
  const placed: string[] = []
  for (const l of leaves) {
    const g = geometryOf(l.node)
    shapes.push(g)
    const bb = l.node.absoluteBoundingBox
    const dx = bb && box ? round(bb.x - box.x, 1) : 0
    const dy = bb && box ? round(bb.y - box.y, 1) : 0
    // orientation: a mirrored/rotated copy has the same path data but a different transform (e.g. left vs right arrow)
    let orient = '1,0,0,1'
    try {
      const rt = (root as SceneNode & { absoluteTransform: Transform }).absoluteTransform as Matrix
      const lt = (l.node as SceneNode & { absoluteTransform: Transform }).absoluteTransform as Matrix
      orient = orientationKey(multiply(invert(rt ?? IDENTITY), lt ?? IDENTITY))
    } catch (e) {
      log.debug('diagnose', 'keep the default', e)
    }
    const o = `@${orient}`
    // a Light / Regular / Bold family has the same outline and differs only in stroke weight: that is not a duplicate
    const st = strokeKey(l.node)
    shapes.push(o, st)
    placed.push(`${dx},${dy},${round(l.node.width, 1)},${round(l.node.height, 1)}${o}${st}#${g}`)
  }
  return { geom: hash64(placed.join('||')), shape: hash64(shapes.join('||')), leaves }
}

// ---- scan ---------------------------------------------------------------------

interface Ref {
  node: ComponentNode
  sig: Signature
}

interface Cand {
  node: SceneNode
  kind: 'frame' | 'loose'
}


// ---- diagnosis: detached / loose / not-a-component / layer names / duplicates ---------

interface Ref {
  node: ComponentNode
  sig: Signature
}

export type SvgOf = (n: SceneNode) => Promise<string | null>

/**
 * Collects problems that have an automatic fix while the normal scan walks the same layers (no second pass).
 * Components must be registered first so frames can be matched against them.
 */
export class Diagnoser {
  private refs: Ref[] = []
  private byGeom = new Map<string, Ref[]>()
  private byShape = new Map<string, Ref[]>()
  private byKey = new Map<string, Ref>()
  private sigCache = new Map<string, Signature>()

  /** result of the file-wide naming analysis (set by componentFixes) */
  leafNames: LeafNames | null = null

  constructor(private leafName: string, private readonly svgOf: SvgOf, private readonly mode: 'auto' | 'fixed' = 'auto') {}

  addComponent(node: ComponentNode): void {
    const ref = { node, sig: signatureOf(node) }
    this.refs.push(ref)
    this.sigCache.set(node.id, ref.sig)
    if (node.key) this.byKey.set(node.key, ref)
    this.byGeom.set(ref.sig.geom, [...(this.byGeom.get(ref.sig.geom) ?? []), ref])
    this.byShape.set(ref.sig.shape, [...(this.byShape.get(ref.sig.shape) ?? []), ref])
  }

  private async targetOf(c: ComponentNode): Promise<FixTarget> {
    return {
      componentId: c.remote ? undefined : c.id,
      componentKey: c.key,
      name: c.parent && c.parent.type === 'COMPONENT_SET' ? `${c.parent.name} (${c.name})` : c.name,
      remote: c.remote,
      svg: await this.svgOf(c),
      width: round(c.width),
      height: round(c.height)
    }
  }

  /** frames, groups and loose vectors */
  async diagnoseNode(node: SceneNode, svg: string | null): Promise<FixCandidate | null> {
    const sig = signatureOf(node)
    if (!sig.leaves.length) return null
    const page = pageOf(node)
    const base: Pick<FixCandidate, 'id' | 'nodeId' | 'nodeType' | 'name' | 'pageName' | 'width' | 'height'> = {
      id: node.id, nodeId: node.id, nodeType: node.type, name: node.name,
      pageName: cleanPageName(page ? page.name : ''), width: round(node.width), height: round(node.height)
    }
    const detached = node.type === 'FRAME' ? node.detachedInfo : null

    let ref: ComponentNode | null = null
    let unresolved = false
    if (detached) {
      if (detached.type === 'local') {
        const n = await figma.getNodeByIdAsync(detached.componentId)
        if (n && n.type === 'COMPONENT') ref = n
        else unresolved = true
      } else {
        const known = this.byKey.get(detached.componentKey)
        if (known) ref = known.node
        else {
          try {
            ref = await figma.importComponentByKeyAsync(detached.componentKey)
          } catch (e) {
            log.debug('diagnose', 'ignored', e)
unresolved = true
          }
        }
      }
    }

    let similarity: 'identical' | 'same-shape' | 'different' = 'different'
    let refSig: Signature | null = null
    if (ref) {
      refSig = this.sigCache.get(ref.id) ?? signatureOf(ref)
      this.sigCache.set(ref.id, refSig)
      similarity = compareSignatures(sig, refSig)
    } else if (!unresolved) {
      const m = (this.byGeom.get(sig.geom) ?? [])[0] ?? (this.byShape.get(sig.shape) ?? [])[0] ?? null
      if (m) {
        ref = m.node
        refSig = m.sig
        similarity = compareSignatures(sig, m.sig)
      }
    }

    if (ref && refSig) {
      const target = await this.targetOf(ref)
      const diffs: string[] = []
      if (Math.abs(node.width - ref.width) > 0.01 || Math.abs(node.height - ref.height) > 0.01) {
        diffs.push(`Size ${round(node.width)}×${round(node.height)} vs component ${round(ref.width)}×${round(ref.height)} (carried as a size override)`)
      }
      const a = sig.leaves.map((l) => l.hex).filter(Boolean)
      const b = refSig.leaves.map((l) => l.hex).filter(Boolean)
      if (a.join() !== b.join()) diffs.push(`Colour ${[...new Set(a)].join(', ') || 'none'} vs component ${[...new Set(b)].join(', ') || 'none'} (carried as a fill override)`)
      if (similarity === 'different') diffs.push('Artwork differs from the component (edits would be lost)')
      let kind: FixKind
      if (similarity === 'identical' && diffs.length === 0) kind = detached ? 'detached-identical' : 'detached-match'
      else if (similarity === 'different') kind = 'detached-changed'
      else kind = diffs.length ? 'detached-changed' : detached ? 'detached-identical' : 'detached-match'
      const confidence = similarity === 'identical' ? 'high' : similarity === 'same-shape' ? 'medium' : 'low'
      return { ...base, kind, confidence, svg, target, diffs, actions: ['replace-with-instance', 'convert-to-component'] }
    }
    if (unresolved) {
      return { ...base, kind: 'detached-unresolved', confidence: 'low', svg, diffs: ['The source component is not available in this file'], actions: ['convert-to-component'] }
    }
    const isFrame = node.type === 'FRAME'
    return {
      ...base,
      kind: isFrame ? 'convert-frame' : 'wrap-loose',
      confidence: isFrame ? 'high' : 'medium',
      svg,
      diffs: isFrame ? [] : ['Not inside an icon frame; it will be centred in a library-size frame'],
      actions: [isFrame ? 'convert-to-component' : 'wrap-and-convert'],
      renames: planRenames(sig.leaves.map((l) => ({ id: l.node.id, name: l.node.name, hex: l.hex })), this.leafName)
    }
  }

  /** layer-name problems inside components + duplicate artwork across components (call after all components are added) */
  async componentFixes(): Promise<FixCandidate[]> {
    // 1. what naming does this file already use? (single-vector components share one name)
    const hist = new Map<string, number>()
    for (const r of this.refs) if (r.sig.leaves.length === 1) hist.set(r.sig.leaves[0].node.name, (hist.get(r.sig.leaves[0].node.name) ?? 0) + 1)
    const pick = pickDominantLeaf(hist, this.leafName)
    if (this.mode === 'auto' && pick.detected) this.leafName = pick.name
    this.leafNames = { standard: this.leafName, detected: this.mode === 'auto' && pick.detected, caseVariants: pick.caseVariants, stats: pick.stats }
    const total = this.refs.length
    const out: FixCandidate[] = []
    for (const r of this.refs) {
      const renames = planRenames(r.sig.leaves.map((l) => ({ id: l.node.id, name: l.node.name, hex: l.hex })), this.leafName)
      if (!renames.length) continue
      const page = pageOf(r.node)
      out.push({
        id: `names:${r.node.id}`, kind: 'layer-names', confidence: 'high', nodeId: r.node.id, nodeType: r.node.type,
        name: r.node.parent && r.node.parent.type === 'COMPONENT_SET' ? `${r.node.parent.name} (${r.node.name})` : r.node.name,
        pageName: cleanPageName(page ? page.name : ''), width: round(r.node.width), height: round(r.node.height),
        svg: await this.svgOf(r.node),
        diffs: [
          ...renames.map((x) => `“${x.from}” → “${x.to}”${x.from.toLowerCase() === x.to.toLowerCase() ? ' (differs only by upper/lower case)' : ''}`),
          `Standard in this file: “${this.leafName}”${this.leafNames!.detected ? ` (most used: ${hist.get(this.leafName) ?? 0} of ${total} components)` : ' (from settings)'}`
        ],
        actions: ['rename-layers'], renames
      })
    }
    for (const list of this.byGeom.values()) {
      if (list.length < 2) continue
      const first = list[0].node
      const page = pageOf(first)
      out.push({
        id: `dupe:${first.id}`, kind: 'duplicate-component', confidence: 'high', nodeId: first.id, nodeType: first.type,
        name: first.name, pageName: cleanPageName(page ? page.name : ''), width: round(first.width), height: round(first.height),
        svg: await this.svgOf(first),
        diffs: list.map((x) => `${x.node.name}${x.node.parent && x.node.parent.type !== 'COMPONENT_SET' ? ' · ' + x.node.parent.name : ''}`),
        actions: [],
        groupId: hash32(list.map((x) => x.node.id).sort().join('|')),
        others: list.slice(1).map((x) => ({ nodeId: x.node.id, name: x.node.name }))
      })
    }
    return out
  }
}
