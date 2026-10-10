import { GridInfo, Icon, RawIcon, Settings } from '../types'
import { auditIcon } from './audit'
import { normalisePath } from './fixes'
import { hash32 } from './hash'
import { detectGrid, iconTier, libraryTier, Tier } from './library'
import { resolveCategory, pathSegments } from './categories'
import { buildName, cleanNamespace, codeCompare, resolveDuplicates, slugify } from './naming'
import { ThemedSvg, themeSvg } from './svg'

export interface Processed {
  icons: Icon[]
  grid: GridInfo
  tier: Tier
  tierCounts: Record<Tier, number>
}

function variableMap(raw: RawIcon): Map<string, { name: string; collection?: string; modes?: Record<string, string> }> {
  const m = new Map<string, { name: string; collection?: string; modes?: Record<string, string> }>()
  for (const p of raw.facts.paints) if (p.variable && !m.has(p.hex)) m.set(p.hex, { name: p.variable, collection: p.collection, ...(p.modes ? { modes: p.modes } : {}) })
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
  // Everything else that defines the drawing: basic shapes (circle, rect, line…), stroke weight / caps / joins and transforms.
  // Filled icons made of plain paths have none of these, so their hash is unchanged from earlier versions (no false "changed" on upgrade).
  const extras: string[] = []
  for (const m of svg.matchAll(/<(path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*)>/g)) {
    const attrs = [...m[2].matchAll(/\s([a-z-]+)="([^"]*)"/g)].filter(([, k]) => GEOMETRY_ATTRS.has(k) && !(m[1] === 'path' && k === 'd'))
    if (m[1] !== 'path') extras.push(m[1])
    for (const [, k, v] of attrs) extras.push(`${k}=${normalisePath(v, 2)}`)
  }
  return hash32(box + '|' + ds.join('|') + (extras.length ? '|' + extras.join(',') : ''))
}

const GEOMETRY_ATTRS = new Set(['points', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'transform', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray'])

/**
 * Theming parses and rewrites every icon's SVG, which is by far the most expensive step. It only depends on the SVG and on a few settings,
 * so results are cached per icon: changing a name policy, a category source or the profile no longer re-themes thousands of icons.
 */
export type ThemeCache = Map<string, { source: string; sig: string; themed: ThemedSvg | null }>

const themeSignature = (s: Settings) => JSON.stringify([cleanNamespace(s.namespace), s.colorMode, s.tokenNaming, s.strokePolicy, s.precision])

export function processIcons(
  raws: RawIcon[],
  settings: Settings,
  overrides: Record<string, string>,
  outlineOverrides: Record<string, boolean> = {},
  cache?: ThemeCache
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
  const cats = raws.map((raw) =>
    resolveCategory(settings.categorySource, {
      pathNames: pathSegments(raw.setName ?? raw.rawName, settings.ignoreSegments),
      ctx: raw.categoryCtx,
      page: raw.pageName
    })
  )
  // Duplicates follow the chosen policy; whatever is still duplicated keeps its name so the audit blocks the export.
  const resolved = resolveDuplicates(
    raws.map((r, i) => ({ name: baseNames[i].name, category: cats[i].slug, stable: r.componentKey ?? r.nodeId, locked: overrides[r.key] !== undefined })),
    settings.duplicateNames ?? 'block'
  )
  const dupeNames = new Set<string>()
  const seen = new Set<string>()
  resolved.names.forEach((n) => {
    if (seen.has(n)) dupeNames.add(n)
    seen.add(n)
  })

  const icons: Icon[] = []
  const tiers: Tier[] = []
  raws.forEach((raw, i) => {
    const hasStroke = raw.facts.paints.some((p) => p.role === 'stroke')
    const outlined = hasStroke && !!raw.svgOutlined && (outlineOverrides[raw.key] ?? settings.outlineStrokes)
    const source = outlined ? raw.svgOutlined! : raw.svg
    const sig = themeSignature(settings)
    const hit = cache?.get(raw.key)
    let themed: ThemedSvg | null
    if (hit && hit.source === source && hit.sig === sig) themed = hit.themed
    else {
      themed = source
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
      if (cache && source) cache.set(raw.key, { source, sig, themed })
    }
    const name = resolved.names[i]
    const cat = cats[i]
    const icon: Icon = {
      key: raw.key,
      nodeId: raw.nodeId,
      pageId: raw.pageId,
      pageName: raw.pageName,
      sourceKind: raw.sourceKind,
      rawName: raw.rawName,
      hash: geometryHash(raw.svg),
      colorHash: hash32(raw.facts.paints.map((p) => `${p.role}${p.hex}${p.variable ?? ''}${p.opacity < 1 ? '@' + p.opacity.toFixed(2) : ''}`).join('|')),
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
      ...(raw.placements !== undefined ? { placements: raw.placements } : {}),
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
    if (resolved.rewritten.has(i)) {
      icon.findings.push({ ruleId: 'duplicate-resolved', severity: 'info', message: `Two icons were called “${resolved.rewritten.get(i)}”; this one is exported as “${name}”.`, fixHint: 'Give the layer a unique name in Figma so the code name is stable.' })
    }
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

  if (settings.aliasDuplicates) assignAliases(raws, icons, settings.ignoredDuplicates)

  const tierCounts: Record<Tier, number> = { T5: 0, T4: 0, T3: 0, T2: 0, T1: 0 }
  tiers.forEach((t) => tierCounts[t]++)
  return { icons, grid, tier: libraryTier(tiers), tierCounts }
}

/**
 * Intentional duplicates (groups you marked in Issues) with really identical artwork (same drawing AND same colours) export once:
 * the shortest name (then alphabetical) owns the drawing, the others get `aliasOf`. Anything that differs stays a separate icon.
 */
export function assignAliases(raws: RawIcon[], icons: Icon[], ignoredGroups: string[]): void {
  if (!ignoredGroups.length) return
  const byNode = new Map<string, Icon>()
  raws.forEach((r, i) => byNode.set(r.nodeId, icons[i]))
  for (const raw of raws) {
    for (const fix of raw.fixes ?? []) {
      if (fix.kind !== 'duplicate-component' || !fix.groupId || !ignoredGroups.includes(fix.groupId)) continue
      const members = [fix.nodeId, ...(fix.others ?? []).map((o) => o.nodeId)].map((id) => byNode.get(id)).filter((i): i is Icon => !!i && i.svgOk && !!i.hash)
      const same = (a: Icon, b: Icon) => a.hash === b.hash && a.colorHash === b.colorHash
      const owner = [...members].sort((a, b) => a.name.length - b.name.length || codeCompare(a.name, b.name))[0]
      if (!owner) continue
      for (const m of members) if (m !== owner && !m.aliasOf && same(owner, m)) m.aliasOf = owner.name
    }
  }
}

export function hasBlockingErrors(icon: Icon): boolean {
  return icon.findings.some((f) => f.severity === 'error')
}
