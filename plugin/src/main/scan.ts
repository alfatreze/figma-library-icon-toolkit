import { parseVariantName } from '../core/naming'
import { CategoryContext, FixCandidate, RawIcon, ScanOptions, ScanSummary, SourceKind } from '../types'
import { emptyFacts, gatherFacts, isIconish, resetFactCaches, variableName, VECTOR_TYPES } from './facts'
import { cleanPageName, Diagnoser, pageOf } from './diagnose'
import { outlinedSvg } from './outline'
import { newAgg, recordInstance, toUsage, UsageAgg } from './overrides'
import { log } from '../log'

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
  /** instances placed in the scanned pages, per main component key (for components that are themselves icons of this scan) */
  placements: Map<string, number>
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

/** `inInstance`: the node lives inside an instance (not editable, no component of its own): it can only be counted as usage, never offered as an icon to convert */
async function visit(node: SceneNode, ctx: ScanContext, cat: CategoryContext, inInstance = false): Promise<void> {
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
        // count icon instances placed inside the variants (a button's chevron) even though the variants themselves are not listed
        for (const child of node.children) await visit(child, ctx, cat, inInstance)
        return
      }
      for (const child of node.children) {
        if (child.type !== 'COMPONENT') continue
        if (!fits(child, maxSize)) {
          skip(ctx, child, `larger than ${maxSize}px`)
          // icons placed inside a large variant (a button's chevron) still count as used
          for (const c of child.children) await visit(c, ctx, cat, true)
          continue
        }
        ctx.seenComponents.add(child.key) // instances of this variant are the same icon, not a second one
        addCandidate(ctx, componentCandidate(child, 'component-set', cat))
      }
      return
    }
    case 'COMPONENT': {
      if (usageOnly || mode === 'frames') {
        for (const c of node.children) await visit(c, ctx, cat, true)
        return
      }
      if (!fits(node, maxSize)) {
        skip(ctx, node, `larger than ${maxSize}px`)
        for (const c of node.children) await visit(c, ctx, cat, true)
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
        } catch (e) {
          log.debug('scan', 'ignored', e)
main = null
        }
        const key = main ? main.key || main.id : node.id
        if (!usageOnly && ctx.seenComponents.has(key)) {
          ctx.placements.set(key, (ctx.placements.get(key) ?? 0) + 1) // the master component is already a candidate: only count where it is placed
          return
        }
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
      for (const c of node.children) await visit(c, ctx, cat, true)
      return
    }
    case 'FRAME':
    case 'GROUP': {
      if (!inInstance && !usageOnly && mode !== 'components' && fits(node, maxSize)) {
        if (isIconish(node, composite)) {
          addCandidate(ctx, { node, sourceKind: 'frame', rawName: node.name, variantProps: {}, description: '', ctx: cat })
          return
        }
        if (node.children.length) {
          skip(ctx, node, !composite && isIconish(node, true) ? 'frame made of instances (composite). Labs → Composite frames lets you treat these as icons' : 'small frame without vector content (or contains text)')
        }
      }
      const next = node.type === 'FRAME' ? { ...cat, frame: node.name } : cat
      for (const c of node.children) await visit(c, ctx, next, inInstance)
      return
    }
    case 'SECTION': {
      for (const c of node.children) await visit(c, ctx, { section: node.name }, inInstance)
      return
    }
    default: {
      if (!inInstance && !usageOnly && mode === 'loose' && VECTOR_TYPES.has(node.type) && fits(node, maxSize)) {
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
  } catch (e) {
    log.debug('scan', 'ignored', e)
return { node: c.node, exportedFrom: 'instance' }
  }
}

/** how many candidates are exported at once: enough to hide the round-trip latency of exportAsync, few enough to bound memory */
const EXPORT_CONCURRENCY = 6
const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0))

export async function scan(
  opts: ScanOptions,
  cancelled: () => boolean,
  phase: (text: string) => void,
  onBatch: (icons: RawIcon[], progress: number) => void
): Promise<ScanSummary> {
  resetFactCaches() // renamed variables must not show their old names
  const ctx: ScanContext = {
    opts, cancelled, phase, seenNodes: new Set(), seenComponents: new Set(), placements: new Map(), candidates: [], groups: new Map(),
    summary: { scanned: 0, skipped: [], adapters: {} }, visited: 0
  }

  // ---- 1. traverse the chosen scope ---------------------------------------
  if (opts.scope === 'selection') {
    const sel = figma.currentPage.selection
    if (!sel.length) throw new Error('Nothing is selected. Select layers, or switch the scope to Page or Document.')
    for (const r of sel) {
      // a selected component is always an icon, even when only usage is being listed (Dev Mode inspect: you click the component itself)
      const asComponent = opts.usageOnly && (r.type === 'COMPONENT' || r.type === 'COMPONENT_SET')
      const saved = ctx.opts
      if (asComponent) ctx.opts = { ...opts, usageOnly: false }
      try {
        await visit(r, ctx, {})
      } finally {
        ctx.opts = saved
      }
    }
  } else if (opts.scope === 'page') {
    for (const r of figma.currentPage.children) await visit(r, ctx, {})
  } else {
    // one page at a time: progress, cancel between pages, and only the page being read has to be loaded
    const pages = figma.root.children
    for (let i = 0; i < pages.length; i++) {
      if (cancelled()) break
      phase(`Page ${i + 1}/${pages.length}: ${cleanPageName(pages[i].name)}`)
      await pages[i].loadAsync()
      for (const r of pages[i].children) await visit(r, ctx, {})
    }
  }

  // instance groups become candidates (one per main component), unless that component is itself a candidate
  for (const [key, g] of ctx.groups) {
    if (!opts.usageOnly && ctx.seenComponents.has(key)) continue
    addCandidate(ctx, g.cand)
  }

  // ---- 2. diagnose (detached / not a component / layer names) in the same pass ------------
  const svgCache = new Map<string, string | null>()
  const svgOf = async (n: SceneNode): Promise<string | null> => {
    if (svgCache.has(n.id)) return svgCache.get(n.id) ?? null
    let svg: string | null = null
    try {
      svg = await n.exportAsync(EXPORT)
    } catch (e) {
      log.debug('scan', 'ignored', e)
svg = null
    }
    svgCache.set(n.id, svg)
    return svg
  }
  const diag = new Diagnoser(opts.leafName || 'Vector', svgOf, opts.leafNameMode ?? 'auto')
  const componentFixes = new Map<string, FixCandidate[]>()
  if (!opts.usageOnly) {
    phase('Checking components…')
    let n = 0
    for (const c of ctx.candidates) {
      if (cancelled()) break
      if (c.node.type !== 'COMPONENT') continue
      try {
        diag.addComponent(c.node)
      } catch (e) {
        console.warn('[icon-toolkit] could not read component', c.node.name, e) // one unreadable component must not end the scan
      }
      if (++n % 200 === 0) await yieldToUi()
    }
    try {
      for (const f of await diag.componentFixes()) componentFixes.set(f.nodeId, [...(componentFixes.get(f.nodeId) ?? []), f])
    } catch (e) {
      console.warn('[icon-toolkit] component checks failed; icons are still exported', e)
    }
    if (diag.leafNames) ctx.summary.leafNames = diag.leafNames
  }

  // ---- 3. facts + SVG per candidate, a few at a time ---------------------------------------
  const total = ctx.candidates.length
  phase(total ? `Reading ${total} icons…` : 'No icons found')
  let done = 0
  for (let start = 0; start < total; start += EXPORT_CONCURRENCY) {
    if (cancelled()) break
    const chunk = ctx.candidates.slice(start, start + EXPORT_CONCURRENCY)
    const batch = await Promise.all(chunk.map((c) => readCandidate(c, diag, componentFixes, svgCache, opts)))
    // how often each component is placed in what was scanned (instances met before the component was seen sit in their own group)
    chunk.forEach((c, i) => {
      if (c.sourceKind !== 'component' && c.sourceKind !== 'component-set') return
      const key = c.node.type === 'COMPONENT' ? c.node.key || c.node.id : c.node.id
      batch[i].placements = (ctx.placements.get(key) ?? 0) + (ctx.groups.get(key)?.agg.instances ?? 0)
    })
    done += chunk.length
    ctx.summary.scanned = done
    onBatch(batch, total ? done / total : 1)
    await yieldToUi()
  }
  return ctx.summary
}

/** One icon's facts, SVG and fixes. Never throws: a layer that cannot be read becomes an icon with an `exportError` (blocked, visible in the list). */
async function readCandidate(
  c: Candidate,
  diag: Diagnoser,
  componentFixes: Map<string, FixCandidate[]>,
  svgCache: Map<string, string | null>,
  opts: ScanOptions
): Promise<RawIcon> {
  const page = pageOf(c.node)
  const fallback = (message: string): RawIcon => ({
    key: c.node.id, nodeId: c.node.id, pageId: page ? page.id : figma.currentPage.id, pageName: cleanPageName(page ? page.name : figma.currentPage.name),
    sourceKind: c.sourceKind, rawName: c.rawName, setName: c.setName, variantProps: c.variantProps, componentKey: c.componentKey, description: c.description,
    width: 0, height: 0, padding: null, facts: emptyFacts(), svg: null, exportError: message, categoryCtx: c.ctx
  })
  try {
    if (c.node.removed) return fallback('The layer was removed while scanning')
    const target = await load(c)
    let facts, padding
    try {
      ;({ facts, padding } = await gatherFacts(target.node))
    } catch (e) {
      log.debug('scan', 'ignored', e)
;({ facts, padding } = await gatherFacts(c.node))
    }
    let svg: string | null = target.svg ?? svgCache.get(target.node.id) ?? null
    let exportError: string | undefined
    try {
      if (svg === null) svg = await target.node.exportAsync(EXPORT)
    } catch (e) {
      exportError = e instanceof Error ? e.message : String(e)
    }
    svgCache.delete(target.node.id) // the SVG now lives in the RawIcon; do not keep a second copy for the whole scan
    const svgOutlined = facts.paints.some((p) => p.role === 'stroke') ? outlinedSvg(target.node) : undefined
    const fixes: FixCandidate[] = [...(componentFixes.get(c.node.id) ?? [])]
    if (!c.instance && (c.sourceKind === 'frame' || c.sourceKind === 'loose')) {
      try {
        const f = await diag.diagnoseNode(c.node, svg)
        if (f) fixes.push(f)
      } catch (e) {
        log.debug('scan', 'diagnosis is best effort; the icon is still exported', e)
      }
    }
    return {
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
    }
  } catch (e) {
    return fallback(e instanceof Error ? e.message : String(e))
  }
}
