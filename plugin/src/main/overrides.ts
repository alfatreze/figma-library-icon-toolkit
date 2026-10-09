import { OverrideClass, UsageInfo } from '../types'
import { toHex } from './facts'

export interface UsageAgg {
  instances: number
  pages: Set<string>
  remote: boolean
  overrides: Partial<Record<OverrideClass, number>>
  sizes: Set<string>
  colors: Map<string, { hex: string; variable?: string }>
}

export function newAgg(remote: boolean): UsageAgg {
  return { instances: 0, pages: new Set(), remote, overrides: {}, sizes: new Set(), colors: new Map() }
}

const round = (n: number) => Math.round(n * 100) / 100

function classify(field: string, isRoot: boolean): OverrideClass | null {
  if (field === 'fills' || field === 'strokes' || field === 'fillStyleId' || field === 'strokeStyleId') return 'color'
  if (/^stroke(Top|Right|Bottom|Left)?Weight$/.test(field)) return 'strokeWeight'
  if (['strokeAlign', 'strokeCap', 'strokeJoin', 'strokeMiterLimit', 'dashPattern'].includes(field)) return 'strokeStyle'
  if (field === 'opacity') return 'opacity'
  if (field === 'visible') return 'visibility'
  if (field === 'effects' || field === 'effectStyleId') return 'effects'
  if (field === 'blendMode') return 'blend'
  if (['width', 'height', 'size'].includes(field)) return isRoot ? 'size' : 'geometry'
  if (['x', 'y', 'rotation', 'relativeTransform', 'constraints'].includes(field)) return isRoot ? null : 'geometry'
  if (/Radius$/.test(field)) return 'radius'
  if (field === 'mainComponent' || field === 'swap') return 'swap'
  if (field === 'componentProperties' || field === 'componentPropertyReferences') return 'properties'
  return null
}

const bump = (agg: UsageAgg, cls: OverrideClass) => {
  agg.overrides[cls] = (agg.overrides[cls] ?? 0) + 1
}

export async function recordInstance(
  agg: UsageAgg,
  inst: InstanceNode,
  main: ComponentNode | null,
  pageName: string,
  variableName: (id: string) => Promise<string | null>
): Promise<void> {
  agg.instances++
  agg.pages.add(pageName)
  agg.sizes.add(`${round(inst.width)}×${round(inst.height)}`)

  const seen = new Set<OverrideClass>()
  if (main && (Math.abs(inst.width - main.width) > 0.01 || Math.abs(inst.height - main.height) > 0.01)) {
    seen.add('size')
  }
  let entries: ReadonlyArray<{ id: string; overriddenFields: ReadonlyArray<string> }> = []
  try {
    entries = inst.overrides as ReadonlyArray<{ id: string; overriddenFields: ReadonlyArray<string> }>
  } catch {
    entries = []
  }
  for (const entry of entries) {
    const isRoot = entry.id === inst.id
    for (const field of entry.overriddenFields) {
      const cls = classify(String(field), isRoot)
      if (!cls) continue
      seen.add(cls)
      if (cls === 'color' && agg.colors.size < 8 && (field === 'fills' || field === 'strokes')) {
        try {
          const node = await figma.getNodeByIdAsync(entry.id)
          if (node && field in node) {
            const paints = (node as unknown as Record<string, unknown>)[field]
            if (Array.isArray(paints)) {
              for (const p of paints as Paint[]) {
                if (p.type === 'SOLID' && p.visible !== false) {
                  const hex = toHex(p.color)
                  const alias = p.boundVariables?.color
                  const variable = alias ? (await variableName(alias.id)) ?? undefined : undefined
                  agg.colors.set(variable ?? hex, { hex, variable })
                }
              }
            }
          }
        } catch {
          /* best effort */
        }
      }
    }
  }
  seen.forEach((c) => bump(agg, c))
}

export function toUsage(agg: UsageAgg, exportedFrom: 'main' | 'instance'): UsageInfo {
  return {
    instances: agg.instances,
    pages: [...agg.pages],
    remote: agg.remote,
    overrides: agg.overrides,
    sizes: [...agg.sizes].slice(0, 12),
    colors: [...agg.colors.values()].slice(0, 8),
    exportedFrom
  }
}
