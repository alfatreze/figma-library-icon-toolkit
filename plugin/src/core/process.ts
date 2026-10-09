import { GridInfo, Icon, RawIcon, Settings } from '../types'
import { auditIcon } from './audit'
import { hash32, normalisePath } from './fixes'
import { detectGrid, iconTier, libraryTier, Tier } from './library'
import { resolveCategory, pathSegments } from './categories'
import { buildName, cleanNamespace, slugify } from './naming'
import { themeSvg } from './svg'

export interface Processed {
  icons: Icon[]
  grid: GridInfo
  tier: Tier
  tierCounts: Record<Tier, number>
}

function variableMap(raw: RawIcon): Map<string, { name: string; collection?: string }> {
  const m = new Map<string, { name: string; collection?: string }>()
  for (const p of raw.facts.paints) if (p.variable && !m.has(p.hex)) m.set(p.hex, { name: p.variable, collection: p.collection })
  return m
}

export function parseTags(description: string): string[] {
  return Array.from(
    new Set(
      description
        .split(/[,\n;]+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t && t.length <= 40)
    )
  )
}

/** geometry-only hash: ignores colours and attribute noise so "artwork changed" means the drawing changed */
export function geometryHash(svg: string | null): string {
  if (!svg) return ''
  const ds = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => normalisePath(m[1], 2))
  const box = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? ''
  return hash32(box + '|' + ds.join('|'))
}

export function processIcons(
  raws: RawIcon[],
  settings: Settings,
  overrides: Record<string, string>,
  outlineOverrides: Record<string, boolean> = {}
): Processed {
  const grid = detectGrid(raws, settings)

  const baseNames = raws.map((r) => {
    const ov = overrides[r.key]
    if (ov !== undefined) return { name: slugify(ov), category: [] as string[] }
    return buildName({
      rawName: r.rawName,
      setName: r.setName,
      variantProps: r.variantProps,
      ignoreSegments: settings.ignoreSegments,
      ignoreVariantValues: settings.ignoreVariantValues
    })
  })
  // Duplicates keep their names so the audit can flag them (export is blocked until resolved).
  const dupeNames = new Set<string>()
  const seen = new Set<string>()
  baseNames.forEach((b) => {
    if (seen.has(b.name)) dupeNames.add(b.name)
    seen.add(b.name)
  })

  const icons: Icon[] = []
  const tiers: Tier[] = []
  raws.forEach((raw, i) => {
    const hasStroke = raw.facts.paints.some((p) => p.role === 'stroke')
    const outlined = hasStroke && !!raw.svgOutlined && (outlineOverrides[raw.key] ?? settings.outlineStrokes)
    const source = outlined ? raw.svgOutlined! : raw.svg
    const themed = source
      ? themeSvg(source, {
          ns: cleanNamespace(settings.namespace),
          colorMode: settings.colorMode,
          tokenNaming: settings.tokenNaming,
          strokePolicy: settings.strokePolicy,
          precision: settings.precision,
          variableByHex: variableMap(raw),
          paints: raw.facts.paints
        })
      : null
    const name = baseNames[i].name
    const cat = resolveCategory(settings.categorySource, {
      pathNames: pathSegments(raw.setName ?? raw.rawName, settings.ignoreSegments),
      ctx: raw.categoryCtx,
      page: raw.pageName
    })
    const icon: Icon = {
      key: raw.key,
      nodeId: raw.nodeId,
      pageId: raw.pageId,
      pageName: raw.pageName,
      sourceKind: raw.sourceKind,
      rawName: raw.rawName,
      hash: geometryHash(raw.svg),
      colorHash: hash32(raw.facts.paints.map((p) => `${p.role}${p.hex}${p.variable ?? ''}`).join('|')),
      hasStroke,
      canOutline: !!raw.svgOutlined,
      outlined,
      fixes: (raw.fixes ?? []).filter((f) => !(f.kind === 'duplicate-component' && f.groupId && settings.ignoredDuplicates.includes(f.groupId))),
      layerName: raw.setName ? `${raw.setName} (${raw.rawName})` : raw.rawName,
      name,
      nameOverride: overrides[raw.key] ?? null,
      category: cat.slug,
      categoryLabel: cat.label,
      usage: raw.usage,
      tags: parseTags(raw.description),
      description: raw.description,
      kind: themed?.kind ?? 'filled',
      width: raw.width,
      height: raw.height,
      viewBox: themed?.viewBox ?? `0 0 ${raw.width} ${raw.height}`,
      body: themed?.body ?? '',
      standalone: themed?.standalone ?? '',
      maskSvg: themed?.maskSvg ?? null,
      slots: themed?.slots ?? [],
      strokeWidth: themed?.strokeWidth ?? null,
      componentKey: raw.componentKey,
      variantProps: raw.variantProps,
      setName: raw.setName,
      findings: [],
      svgOk: !!themed?.ok
    }
    icon.findings = auditIcon(raw, {
      profile: settings.profile,
      grid,
      name,
      duplicate: dupeNames.has(name),
      kindColors: icon.slots.length,
      themedOk: icon.svgOk,
      settings
    })
    // problems with an automatic fix become findings, so Issues/Icons show one list (no second scan)
    for (const fix of icon.fixes) {
      if (fix.kind === 'convert-frame') continue // already reported as "not-component"; the fix hangs off that rule
      const sev: 'warn' | 'info' = 'warn'
      icon.findings.push({ ruleId: fix.kind, severity: fix.kind === 'duplicate-component' ? 'info' : sev, message: fix.kind === 'duplicate-component' ? `Same drawing as: ${fix.diffs.filter((d) => !d.startsWith(icon.layerName)).slice(0, 3).join('; ')}` : fix.diffs[0] ?? '', fixHint: undefined })
    }
    if (themed?.hasGradient && !icon.findings.some((f) => f.ruleId === 'gradient')) {
      icon.findings.push({ ruleId: 'gradient', severity: 'warn', message: 'Gradient fill cannot be themed; exported as drawn.' })
    }
    tiers.push(iconTier(icon, raw))
    icons.push(icon)
  })

  const tierCounts: Record<Tier, number> = { T5: 0, T4: 0, T3: 0, T2: 0, T1: 0 }
  tiers.forEach((t) => tierCounts[t]++)
  return { icons, grid, tier: libraryTier(tiers), tierCounts }
}

export function hasBlockingErrors(icon: Icon): boolean {
  return icon.findings.some((f) => f.severity === 'error')
}
