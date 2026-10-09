import { buildName, cleanNamespace, parseVariantName } from '../core/naming'
import { tokenVarName } from '../core/tokens'
import { parseStrokeTable, weightForSize } from '../core/stroke'
import { angularSnippet, cssSnippet, DEFAULT_IMPORT_PATH, htmlSnippet, overrideNotes, reactComponentSnippet, reactSnippet, SnippetInput, webComponentSnippet } from '../core/snippets'
import { OverrideClass, Settings } from '../types'
import { isIconish, toHex, variableInfo, VECTOR_TYPES } from './facts'
import { newAgg, recordInstance } from './overrides'
import { effectiveSettings } from './effective'

type Result = { title: string; code: string; language: CodegenResult['language'] }

interface Leaf { hex?: string; varId?: string; stroke?: number }

function leaves(root: SceneNode): Leaf[] {
  const out: Leaf[] = []
  const walk = (n: SceneNode) => {
    if (!n.visible) return
    if (VECTOR_TYPES.has(n.type)) {
      const g = n as SceneNode & GeometryMixin
      const pick = (paints: ReadonlyArray<Paint> | PluginAPI['mixed']) =>
        (Array.isArray(paints) ? (paints as Paint[]) : []).find((p) => p.type === 'SOLID' && p.visible !== false) as SolidPaint | undefined
      const fill = pick(g.fills)
      const stroke = pick(g.strokes)
      const paint = fill ?? stroke
      const sw = (n as unknown as { strokeWeight?: number | symbol }).strokeWeight
      out.push({
        hex: paint ? toHex(paint.color) : undefined,
        varId: paint?.boundVariables?.color?.id,
        stroke: stroke && typeof sw === 'number' ? sw : undefined
      })
      return
    }
    if ('children' in n) for (const c of n.children) walk(c)
  }
  walk(root)
  return out
}

function nameOf(main: ComponentNode, s: Settings): string {
  const parent = main.parent
  const inSet = parent && parent.type === 'COMPONENT_SET'
  return buildName({
    rawName: main.name,
    setName: inSet ? parent.name : undefined,
    variantProps: inSet ? parseVariantName(main.name) ?? {} : {},
    ignoreSegments: s.ignoreSegments,
    ignoreVariantValues: s.ignoreVariantValues
  }).name
}

interface Pref { importPath: string; spritePath: string; unit: 'px' | 'rem'; a11y: 'decorative' | 'labelled'; tokens: 'names' | 'hex' }
function prefs(): Pref {
  const c = (figma.codegen.preferences?.customSettings ?? {}) as Record<string, string>
  return {
    importPath: c.importPath || DEFAULT_IMPORT_PATH,
    spritePath: c.spritePath || './icons/sprite/',
    unit: c.sizeUnit === 'rem' ? 'rem' : 'px',
    a11y: c.a11y === 'labelled' ? 'labelled' : 'decorative',
    tokens: c.tokens === 'hex' ? 'hex' : 'names'
  }
}

async function describeInstance(node: SceneNode, s: Settings, p: Pref): Promise<{ input: SnippetInput; classes: Partial<Record<OverrideClass, number>>; name: string } | null> {
  let main: ComponentNode | null = null
  if (node.type === 'INSTANCE') main = await node.getMainComponentAsync()
  else if (node.type === 'COMPONENT') main = node
  if (!main) return null
  const ns = cleanNamespace(s.namespace)
  const vars: Record<string, string> = {}
  let sizePx: number | null = null
  if (Math.abs(node.width - main.width) > 0.01) sizePx = Math.round(node.width * 100) / 100

  const base = leaves(main)
  const uses = new Map<string, number>()
  base.forEach((l) => l.hex && uses.set(l.hex, (uses.get(l.hex) ?? 0) + 1))
  const order = [...uses.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h)
  const mine = leaves(node)
  let color: string | undefined
  if (mine.length === base.length) {
    for (let i = 0; i < mine.length; i++) {
      const l = mine[i]
      const b = base[i]
      if (!l.hex || !b.hex || l.hex === b.hex) continue
      const slot = order.indexOf(b.hex) + 1
      const cssVar = slot <= 1 ? `--${ns}-icon-color` : `--${ns}-icon-color-${slot}`
      let value = l.hex
      if (p.tokens === 'names' && l.varId) {
        const info = await variableInfo(l.varId)
        const token = info ? tokenVarName(info.name, info.collection, s.tokenNaming) : null
        if (token) value = `var(${token})`
      }
      vars[cssVar] = value
      if (slot <= 1) color = value
    }
  }
  let strokeWidth: number | undefined
  const bw = base.find((l) => l.stroke !== undefined)
  const mw = mine.find((l) => l.stroke !== undefined)
  if (bw && mw && bw.stroke !== mw.stroke) {
    strokeWidth = mw.stroke
    vars[`--${ns}-icon-stroke-width`] = `${mw.stroke}`
  } else if (s.strokePolicy === 'table' && sizePx && mw) {
    const w = weightForSize(sizePx, parseStrokeTable(s.strokeTable))
    if (w !== null) vars[`--${ns}-icon-stroke-width`] = `${w}`
  }

  const agg = newAgg(false)
  if (node.type === 'INSTANCE') await recordInstance(agg, node, main, '', async (id) => (await variableInfo(id))?.name ?? null)
  const name = nameOf(main, s)
  const label = p.a11y === 'labelled' ? name.replace(/-/g, ' ') : undefined
  return { input: { ns, name, importPath: p.importPath, spritePath: p.spritePath, sizePx, sizeUnit: p.unit, vars, color, strokeWidth, label }, classes: agg.overrides, name }
}

/** For frames/screens: which icons are used here (bill of materials). */
async function iconsUsed(root: SceneNode, s: Settings): Promise<{ name: string; count: number; sizes: Set<string> }[]> {
  const found = new Map<string, { name: string; count: number; sizes: Set<string> }>()
  let visited = 0
  const walk = async (n: SceneNode): Promise<void> => {
    if (!n.visible || ++visited > MAX_VISITED) return
    if (n.type === 'INSTANCE' && n.width <= 128 && n.height <= 128 && isIconish(n)) {
      const main = await n.getMainComponentAsync()
      if (main) {
        const key = main.key || main.id
        const e = found.get(key) ?? { name: nameOf(main, s), count: 0, sizes: new Set<string>() }
        e.count++
        e.sizes.add(`${Math.round(n.width)}`)
        found.set(key, e)
      }
      return
    }
    if ('children' in n) for (const c of n.children) await walk(c)
  }
  await walk(root)
  return [...found.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** Dev Mode: show how to use the selected icon (or the icons of a selected screen) in code. */
export function registerCodegen(): void {
  // Figma gives codegen 15 s and shows nothing useful when the handler throws or hangs: always answer, with a note when we had to give up
  figma.codegen.on('generate', async (event): Promise<Result[]> => {
    const timeout = new Promise<Result[]>((resolve) =>
      setTimeout(() => resolve([{ title: 'Icon Library Toolkit', language: 'PLAINTEXT', code: 'This selection took too long to analyse. Select a single icon, or a smaller frame.' }]), 12000)
    )
    const work = generate(event).catch((e): Result[] => [
      { title: 'Icon Library Toolkit', language: 'PLAINTEXT', code: `Could not generate code for this selection: ${e instanceof Error ? e.message : String(e)}` }
    ])
    return Promise.race([work, timeout])
  })
}

const MAX_VISITED = 4000

async function generate({ node, language }: { node: SceneNode; language: string }): Promise<Result[]> {
  const { settings, source, shared } = await effectiveSettings()
  const p = prefs()
  const ns = cleanNamespace(settings.namespace)
  const configNote: Result | null =
    source === 'file'
      ? null
      : {
          title: 'Library config',
          language: 'PLAINTEXT',
          code:
            source === 'local'
              ? 'Using YOUR saved plugin settings. Ask the design-system owner to publish the library config into this file (plugin → Settings → Team config → Publish) so everyone gets the same output.'
              : `No library config is published in this file, so default settings are used (namespace "${ns}"). Names may not match your project. Ask the design-system owner to publish the config (plugin → Settings → Team config → Publish).`
        }

  const info = await describeInstance(node, settings, p)
  if (!info) {
    const used = await iconsUsed(node, settings)
    if (!used.length) {
      return [{ title: 'Icon Library Toolkit', language: 'PLAINTEXT', code: 'Select an icon instance to see how to use it in code, or a frame to list the icons it uses.' }, ...(configNote ? [configNote] : [])]
    }
    const lines = used.map((u) => `${u.name}  ×${u.count}${u.sizes.size ? `  (${[...u.sizes].map((x) => x + 'px').join(', ')})` : ''}`)
    const names = used.map((u) => u.name)
    const hint =
      language === 'angular'
        ? `<!-- ${ns}-icon names used -->\n${names.map((n) => `<${ns}-icon name="${n}" />`).join('\n')}`
        : names.map((n) => `${ns}-sprite.svg#${ns}-${n}`).join('\n')
    return [
      { title: `Icons used here (${used.length})`, language: 'PLAINTEXT', code: lines.join('\n') },
      { title: language === 'angular' ? 'Angular' : 'Sprite ids', language: 'PLAINTEXT', code: hint },
      ...(configNote ? [configNote] : [])
    ]
  }

  const input = info.input
  const all: Record<string, Result> = {
    angular: { title: 'Angular', code: angularSnippet(input), language: 'HTML' },
    html: { title: 'HTML (sprite)', code: htmlSnippet(input), language: 'HTML' },
    react: { title: 'React', code: `${reactComponentSnippet(input)}\n\n// or without the component:\n${reactSnippet(input)}`, language: 'JAVASCRIPT' },
    webcomponent: { title: 'Web Component', code: webComponentSnippet(input), language: 'HTML' },
    css: { title: 'CSS variables', code: cssSnippet(input), language: 'CSS' }
  }
  const main: Result[] = language && all[language] ? [all[language]] : Object.values(all)
  const notes = overrideNotes(info.classes, settings)
  const extra: Result[] = []
  if (notes.length) extra.push({ title: 'Notes: overrides', language: 'PLAINTEXT', code: notes.join('\n') })
  if (configNote) extra.push(configNote)
  else if (shared) extra.push({ title: 'Library config', language: 'PLAINTEXT', code: `Config published ${shared.publishedAt.slice(0, 10)}${shared.publishedBy ? ' by ' + shared.publishedBy : ''}.` })
  return [...main, ...extra]
}
