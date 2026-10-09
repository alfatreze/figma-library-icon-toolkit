import { parseVariantName } from '../core/naming'
import { CategoryContext, FixCandidate, RawIcon, ScanOptions, ScanSummary, SourceKind } from '../types'
import { gatherFacts, isIconish, variableName, VECTOR_TYPES } from './facts'
import { Diagnoser } from './diagnose'
import { outlinedSvg } from './outline'
import { newAgg, recordInstance, toUsage, UsageAgg } from './overrides'

interface Candidate {
  node: SceneNode
  sourceKind: SourceKind
  rawName: string
  setName?: string
  variantProps: Record<string, string>
  componentKey?: string
  description: string
  ctx: CategoryContext
  /** instance groups: export the main component when readable, else fall back to the first instance */
  instance?: { first: InstanceNode; main: ComponentNode | null; agg: UsageAgg }
}

interface ScanContext {
  opts: ScanOptions
  cancelled: () => boolean
  phase: (text: string) => void
  seenNodes: Set<string>
  seenComponents: Set<string>
  candidates: Candidate[]
  groups: Map<string, { cand: Candidate; agg: UsageAgg }>
  summary: ScanSummary
  visited: number
}

const fits = (n: SceneNode, max: number) => n.width <= max && n.height <= max
const round = (n: number) => Math.round(n * 100) / 100

function skip(ctx: ScanContext, node: SceneNode, reason: string) {
  if (ctx.summary.skipped.length < 200) ctx.summary.skipped.push({ name: node.name, reason, nodeId: node.id })
}

function addCandidate(ctx: ScanContext, c: Candidate) {
  if (ctx.seenNodes.has(c.node.id)) return
  ctx.seenNodes.add(c.node.id)
  ctx.candidates.push(c)
  ctx.summary.adapters[c.sourceKind] = (ctx.summary.adapters[c.sourceKind] ?? 0) + 1
}

function pageOf(node: BaseNode): PageNode | null {
  let p: BaseNode | null = node
  while (p && p.type !== 'PAGE') p = p.parent
  return p && p.type === 'PAGE' ? p : null
}

/** Pages are often named like "  ↳ Icons" as visual hierarchy; keep only the meaningful part. */
function cleanPageName(name: string): string {
  return name.replace(/^[\s↳→›>\-–—·•]+/u, '').trim() || name.trim()
}

function componentCandidate(node: ComponentNode, kind: SourceKind, ctx: CategoryContext): Candidate {
  const parent = node.parent
  if (parent && parent.type === 'COMPONENT_SET') {
    return {
      node, sourceKind: 'component-set', rawName: node.name, setName: parent.name,
      variantProps: parseVariantName(node.name) ?? {}, componentKey: node.key,
      description: node.description || parent.description || '', ctx
    }
  }
  return { node, sourceKind: kind, rawName: node.name, variantProps: {}, componentKey: node.key, description: node.description, ctx }
}

async function visit(node: SceneNode, ctx: ScanContext, cat: CategoryContext): Promise<void> {
  if (ctx.cancelled() || !node.visible) return
  const { mode, maxIconSize: maxSize, usageOnly } = ctx.opts
  const composite = ctx.opts.compositeFrames === 'include'
  if (++ctx.visited % 400 === 0) {
    ctx.phase(`Scanning… ${ctx.visited.toLocaleString()} layers, ${ctx.candidates.length + ctx.groups.size} icons found`)
    await new Promise((r) => setTimeout(r, 0))
  }

  switch (node.type) {
    case 'COMPONENT_SET': {
      if (usageOnly || mode === 'frames') {
        break
      }
      for (const child of node.children) {
        if (child.type !== 'COMPONENT') continue
        if (!fits(child, maxSize)) {
          skip(ctx, child, `larger than ${maxSize}px`)
          continue
        }
        addCandidate(ctx, componentCandidate(child, 'component-set', cat))
      }
      return
    }
    case 'COMPONENT': {
      if (usageOnly || mode === 'frames') return
      if (!fits(node, maxSize)) {
        skip(ctx, node, `larger than ${maxSize}px`)
        for (const c of node.children) await visit(c, ctx, cat)
        return
      }
      ctx.seenComponents.add(node.key)
      addCandidate(ctx, componentCandidate(node, 'component', cat))
      return
    }
    case 'INSTANCE': {
      const iconSized = fits(node, maxSize) && isIconish(node, composite)
      if (mode === 'frames' && !usageOnly && iconSized) {
        addCandidate(ctx, { node, sourceKind: 'frame', rawName: node.name, variantProps: {}, description: '', ctx: cat })
        return
      }
      if (iconSized) {
        let main: ComponentNode | null = null
        try {
          main = await node.getMainComponentAsync()
        } catch {
          main = null
        }
        const key = main ? main.key || main.id : node.id
        if (!usageOnly && ctx.seenComponents.has(key)) return // the master component is already a candidate
        let g = ctx.groups.get(key)
        if (!g) {
          const base: Candidate = main
            ? { ...componentCandidate(main, 'instance', {}), node, sourceKind: 'instance' }
            : { node, sourceKind: 'instance', rawName: node.name, variantProps: {}, description: '', ctx: {} }
          g = { cand: { ...base, instance: { first: node, main, agg: newAgg(!!main?.remote) } }, agg: newAgg(!!main?.remote) }
          g.cand.instance!.agg = g.agg
          ctx.groups.set(key, g)
        }
        const page = pageOf(node)
        await recordInstance(g.agg, node, main, cleanPageName(page ? page.name : ''), variableName)
        return
      }
      for (const c of node.children) await visit(c, ctx, cat)
      return
    }
    case 'FRAME':
    case 'GROUP': {
      if (!usageOnly && mode !== 'components' && fits(node, maxSize)) {
        if (isIconish(node, composite)) {
          addCandidate(ctx, { node, sourceKind: 'frame', rawName: node.name, variantProps: {}, description: '', ctx: cat })
          return
        }
        if (node.children.length) {
          skip(ctx, node, !composite && isIconish(node, true) ? 'frame made of instances (composite). Labs → Composite frames lets you treat these as icons' : 'small frame without vector content (or contains text)')
        }
      }
      const next = node.type === 'FRAME' ? { ...cat, frame: node.name } : cat
      for (const c of node.children) await visit(c, ctx, next)
      return
    }
    case 'SECTION': {
      for (const c of node.children) await visit(c, ctx, { section: node.name })
      return
    }
    default: {
      if (!usageOnly && mode === 'loose' && VECTOR_TYPES.has(node.type) && fits(node, maxSize)) {
        addCandidate(ctx, { node, sourceKind: 'loose', rawName: node.name, variantProps: {}, description: '', ctx: cat })
      }
    }
  }
}

const EXPORT = { format: 'SVG_STRING', svgIdAttribute: false, svgOutlineText: true, svgSimplifyStroke: true } as const

async function load(c: Candidate): Promise<{ node: SceneNode; exportedFrom: 'main' | 'instance' | 'node'; svg?: string }> {
  if (!c.instance || !c.instance.main) return { node: c.node, exportedFrom: c.instance ? 'instance' : 'node' }
  const main = c.instance.main
  try {
    const page = pageOf(main)
    if (page && page.id !== figma.currentPage.id) await page.loadAsync()
    // readable + exportable? (remote components can be read-only)
    void main.children.length
    const svg = await main.exportAsync(EXPORT)
    return { node: main, exportedFrom: 'main', svg }
  } catch {
    return { node: c.node, exportedFrom: 'instance' }
  }
}

export async function scan(
  opts: ScanOptions,
  cancelled: () => boolean,
  phase: (text: string) => void,
  onBatch: (icons: RawIcon[], progress: number) => void
): Promise<ScanSummary> {
  const ctx: ScanContext = {
    opts, cancelled, phase, seenNodes: new Set(), seenComponents: new Set(), candidates: [], groups: new Map(),
    summary: { scanned: 0, skipped: [], adapters: {} }, visited: 0
  }

  // ---- 1. traverse the chosen scope ---------------------------------------
  if (opts.scope === 'selection') {
    const sel = figma.currentPage.selection
    if (!sel.length) throw new Error('Nothing is selected. Select layers, or switch the scope to Page or Document.')
    for (const r of sel) await visit(r, ctx, {})
  } else if (opts.scope === 'page') {
    for (const r of figma.currentPage.children) await visit(r, ctx, {})
  } else {
    phase('Loading all pages…')
    await figma.loadAllPagesAsync()
    const pages = figma.root.children
    for (let i = 0; i < pages.length; i++) {
      if (cancelled()) break
      phase(`Page ${i + 1}/${pages.length}: ${cleanPageName(pages[i].name)}`)
      for (const r of pages[i].children) await visit(r, ctx, {})
    }
  }

  // instance groups become candidates (one per main component)
  for (const g of ctx.groups.values()) addCandidate(ctx, g.cand)

  // ---- 2. diagnose (detached / not a component / layer names) in the same pass ------------
  const svgCache = new Map<string, string | null>()
  const svgOf = async (n: SceneNode): Promise<string | null> => {
    if (svgCache.has(n.id)) return svgCache.get(n.id) ?? null
    let svg: string | null = null
    try {
      svg = await n.exportAsync(EXPORT)
    } catch {
      svg = null
    }
    svgCache.set(n.id, svg)
    return svg
  }
  const diag = new Diagnoser(opts.leafName || 'Vector', svgOf, opts.leafNameMode ?? 'auto')
  const componentFixes = new Map<string, FixCandidate[]>()
  if (!opts.usageOnly) {
    phase('Checking components…')
    for (const c of ctx.candidates) if (c.node.type === 'COMPONENT') diag.addComponent(c.node)
    for (const f of await diag.componentFixes()) componentFixes.set(f.nodeId, [...(componentFixes.get(f.nodeId) ?? []), f])
    if (diag.leafNames) ctx.summary.leafNames = diag.leafNames
  }

  // ---- 3. facts + SVG per candidate ---------------------------------------
  let batch: RawIcon[] = []
  let done = 0
  const total = ctx.candidates.length
  phase(total ? `Reading ${total} icons…` : 'No icons found')
  for (const c of ctx.candidates) {
    if (cancelled()) break
    const target = await load(c)
    let facts, padding
    try {
      ;({ facts, padding } = await gatherFacts(target.node))
    } catch {
      ;({ facts, padding } = await gatherFacts(c.node))
    }
    let svg: string | null = target.svg ?? svgCache.get(target.node.id) ?? null
    let exportError: string | undefined
    try {
      if (svg === null) svg = await target.node.exportAsync(EXPORT)
      svgCache.set(target.node.id, svg)
    } catch (e) {
      exportError = e instanceof Error ? e.message : String(e)
    }
    const page = pageOf(c.node)
    const svgOutlined = facts.paints.some((p) => p.role === 'stroke') ? outlinedSvg(target.node) : undefined
    const fixes: FixCandidate[] = [...(componentFixes.get(c.node.id) ?? [])]
    if (!c.instance && (c.sourceKind === 'frame' || c.sourceKind === 'loose')) {
      try {
        const f = await diag.diagnoseNode(c.node, svg)
        if (f) fixes.push(f)
      } catch {
        /* diagnosis is best effort; the icon is still exported */
      }
    }
    batch.push({
      key: c.node.id,
      nodeId: c.node.id,
      pageId: page ? page.id : figma.currentPage.id,
      pageName: cleanPageName(page ? page.name : figma.currentPage.name),
      sourceKind: c.sourceKind,
      rawName: c.rawName,
      setName: c.setName,
      variantProps: c.variantProps,
      componentKey: c.componentKey,
      description: c.description,
      width: round(target.node.width),
      height: round(target.node.height),
      padding,
      facts,
      svg,
      svgOutlined,
      fixes,
      exportError,
      categoryCtx: c.ctx,
      usage: c.instance ? toUsage(c.instance.agg, target.exportedFrom === 'main' ? 'main' : 'instance') : undefined
    })
    done++
    ctx.summary.scanned = done
    if (batch.length >= 15) {
      onBatch(batch, total ? done / total : 1)
      batch = []
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  if (batch.length) onBatch(batch, 1)
  return ctx.summary
}
