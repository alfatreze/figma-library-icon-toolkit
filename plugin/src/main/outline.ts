import { IDENTITY, Matrix, invert, multiply, transformPath } from '../core/pathTransform'
import { toHex, VECTOR_TYPES } from './facts'

const f = (n: number) => String(Number(n.toFixed(3)))

function solidOf(paints: ReadonlyArray<Paint> | PluginAPI['mixed'] | undefined): SolidPaint | null {
  if (!Array.isArray(paints)) return null
  return ((paints as ReadonlyArray<Paint>).find((p) => p.type === 'SOLID' && p.visible !== false) as SolidPaint | undefined) ?? null
}

/**
 * Builds an SVG where strokes are already filled shapes, using Figma's own `strokeGeometry` (read-only: nothing is cloned or edited).
 * Returns null whenever it cannot be exact (masks, gradients, unsupported path commands…); callers then keep Figma's normal export.
 */
export function outlinedSvg(root: SceneNode): string | null {
  try {
    const rootT = (root as SceneNode & { absoluteTransform: Transform }).absoluteTransform as Matrix
    const inv = invert(rootT)
    const shapes: string[] = []
    let ok = true

    // everything that changes how the drawing looks but is not in the path data: we cannot reproduce it, so we do not pretend to
    const unsupported = (n: SceneNode): boolean => {
      if (n.type === 'TEXT') return true
      if ('opacity' in n && n.opacity < 0.999) return true
      if ('blendMode' in n && n.blendMode !== 'NORMAL' && n.blendMode !== 'PASS_THROUGH') return true
      if ('effects' in n && n.effects.some((e) => e.visible !== false)) return true
      const g = n as unknown as { fills?: unknown; strokes?: unknown }
      if (g.fills === figma.mixed || g.strokes === figma.mixed) return true
      return false
    }
    const walk = (n: SceneNode) => {
      if (!ok || !n.visible) return
      if (('isMask' in n && n.isMask) || unsupported(n)) {
        ok = false
        return
      }
      if (VECTOR_TYPES.has(n.type)) {
        const g = n as SceneNode & GeometryMixin & { absoluteTransform: Transform }
        const m = multiply(inv, (g.absoluteTransform as Matrix) ?? IDENTITY)
        const fill = solidOf(g.fills)
        const stroke = solidOf(g.strokes)
        if (Array.isArray(g.fills) && (g.fills as Paint[]).some((p) => p.visible !== false && p.type !== 'SOLID')) ok = false
        if (Array.isArray(g.strokes) && (g.strokes as Paint[]).some((p) => p.visible !== false && p.type !== 'SOLID')) ok = false
        if (fill && g.fillGeometry.length) {
          for (const p of g.fillGeometry) {
            shapes.push(`<path d="${transformPath(p.data, m)}" fill="${toHex(fill.color)}"${fill.opacity !== undefined && fill.opacity < 1 ? ` fill-opacity="${f(fill.opacity)}"` : ''}${p.windingRule === 'EVENODD' ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''}/>`)
          }
        }
        if (stroke && g.strokeGeometry.length) {
          for (const p of g.strokeGeometry) {
            shapes.push(`<path d="${transformPath(p.data, m)}" fill="${toHex(stroke.color)}"${stroke.opacity !== undefined && stroke.opacity < 1 ? ` fill-opacity="${f(stroke.opacity)}"` : ''}${p.windingRule === 'EVENODD' ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''}/>`)
          }
        }
        return
      }
      if ('children' in n) for (const c of n.children) walk(c)
    }
    walk(root)
    if (!ok || shapes.length === 0) return null
    // frames export their own box; groups and loose vectors export their RENDER bounds (stroke overhang included)
    const framed = root.type === 'FRAME' || root.type === 'COMPONENT' || root.type === 'INSTANCE'
    let x = 0
    let y = 0
    let w = root.width
    let h = root.height
    if (!framed) {
      if ('rotation' in root && Math.abs(root.rotation) > 0.01) return null
      const rb = (root as SceneNode & { absoluteRenderBounds?: Rect | null }).absoluteRenderBounds
      const bb = root.absoluteBoundingBox
      if (!rb || !bb) return null
      x = rb.x - bb.x
      y = rb.y - bb.y
      w = rb.width
      h = rb.height
    }
    return `<svg width="${f(w)}" height="${f(h)}" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}" fill="none" xmlns="http://www.w3.org/2000/svg">${shapes.join('')}</svg>`
  } catch {
    return null
  }
}
