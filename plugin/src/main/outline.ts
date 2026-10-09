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

    const walk = (n: SceneNode) => {
      if (!ok || !n.visible) return
      if ('isMask' in n && n.isMask) {
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
    const w = f(root.width)
    const h = f(root.height)
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg">${shapes.join('')}</svg>`
  } catch {
    return null
  }
}
