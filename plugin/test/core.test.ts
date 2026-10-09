import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { nodeUrl } from '../src/core/generators/codeconnect'
import { webComponentSnippet } from '../src/core/snippets'
import { changesByName, chunkText, decodeSnapshot, encodeSnapshot, makeSnapshot, pickBaseline } from '../src/core/baseline'
import { buildName, parseVariantName, resolveDuplicates, slugify, validateName } from '../src/core/naming'
import { prefixIds, themeSvg } from '../src/core/svg'
import { tokenVarName, parseMapping, suggestMapping } from '../src/core/tokens'
import { parseStrokeTable, weightForSize, validateStrokeTable } from '../src/core/stroke'
import { sanitizeSvgTree } from '../src/core/sanitize'
import { bumpVersion, changelogMarkdown, diffCatalogs, nextDeprecated } from '../src/core/changelog'
import { exportConfig, parseConfig } from '../src/core/config'
import { processIcons } from '../src/core/process'
import { buildFiles } from '../src/core/generators'
import { DEFAULT_SETTINGS, Facts, RawIcon, UsageInfo } from '../src/types'
import { overrideFindings } from '../src/core/overrides'
import { resolveCategory, pathSegments, summariseCategories } from '../src/core/categories'

const fx = (n: string) => readFileSync(`test/fixtures/${n}`, 'utf8')
const opts = { ns: 'cmn', colorMode: 'themeable' as const, tokenNaming: DEFAULT_SETTINGS.tokenNaming, strokePolicy: 'constant' as const, precision: 3, variableByHex: new Map<string, { name: string; collection?: string }>() }

const emptyFacts: Facts = {
  paints: [], leafCount: 1, hasText: false, hasImage: false, hasGradient: false, hasEffects: false, hasHidden: false,
  hasLocked: false, emptyContainers: false, hasMask: false, hasBlend: false, hasOpacity: false, hasRotation: false,
  nonCenterStroke: false, dashedStroke: false, rootBackground: false, clipsContent: true, hasNestedInstance: false
}

function raw(name: string, svg: string, extra: Partial<RawIcon> = {}): RawIcon {
  return {
    key: name, nodeId: '1:' + name, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: name,
    variantProps: {}, description: '', width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 },
    facts: emptyFacts, svg, categoryCtx: {}, ...extra
  }
}

describe('naming', () => {
  it('folds diacritics instead of replacing them with underscores', () => {
    expect(slugify('Deficiência visual')).toBe('deficiencia-visual')
    expect(slugify('Círculo metade preenchido')).toBe('circulo-metade-preenchido')
  })
  it('drops the redundant icon/ segment', () => {
    const r = buildName({ rawName: 'icon/Audio descricao', variantProps: {}, ignoreSegments: ['icon'], ignoreVariantValues: [] })
    expect(r).toEqual({ name: 'audio-descricao', category: [] })
  })
  it('keeps category segments and appends variant values', () => {
    const r = buildName({ rawName: 'a', setName: 'Acessibilidade/Home', variantProps: { Style: 'Filled', Size: 'Default' }, ignoreSegments: [], ignoreVariantValues: ['default'] })
    expect(r).toEqual({ name: 'home-filled', category: ['acessibilidade'] })
  })
  it('parses variant names', () => {
    expect(parseVariantName('Style=Filled, Size=24')).toEqual({ Style: 'Filled', Size: '24' })
    expect(parseVariantName('plain')).toBeNull()
  })
  it('validates identifiers', () => {
    expect(validateName('3d')).not.toBeNull()
    expect(validateName('delete')).not.toBeNull()
    expect(validateName('ok-name')).toBeNull()
  })
})

describe('themeSvg', () => {
  it('themes a single-colour filled icon and preserves fill-rule', () => {
    const t = themeSvg(fx('box-evenodd.svg'), opts)
    expect(t.ok).toBe(true)
    expect(t.kind).toBe('filled')
    expect(t.slots).toHaveLength(1)
    expect(t.body).toContain('fill="var(--cmn-icon-color, currentColor)"')
    expect(t.body).toContain('fill-rule="evenodd"')
    expect(t.body).not.toContain('#1F1D1D')
    expect(t.maskSvg).toContain('#000')
  })
  it('keeps multiple paths', () => {
    const t = themeSvg(fx('three-paths.svg'), opts)
    expect((t.body.match(/<path/g) ?? []).length).toBeGreaterThan(2)
  })
  it('makes stroke width editable and detects stroked kind + rounds numbers', () => {
    const t = themeSvg(fx('stroked.svg'), opts)
    expect(t.kind).toBe('stroked')
    expect(t.strokeWidth).toBe(2)
    expect(t.body).toContain('stroke-width="var(--cmn-icon-stroke-width, 2)"')
    expect(t.body).toContain('vector-effect="non-scaling-stroke"')
    expect(t.body).toContain('stroke="var(--cmn-icon-color, currentColor)"')
    expect(t.body).toContain('M4.123 12H20.988')
  })
  it('creates slots for multi-colour icons and leaves clip fills alone', () => {
    const map = new Map([['#6b7280', { name: 'color/icon/secondary' }]])
    const t = themeSvg(fx('multicolor.svg'), { ...opts, variableByHex: map })
    expect(t.kind).toBe('multicolor')
    expect(t.slots.map((s) => s.cssVar)).toEqual(['--cmn-icon-color', '--cmn-icon-color-2'])
    expect(t.body).toContain('var(--cmn-icon-color-2, var(--color-icon-secondary, #6b7280))')
    expect(t.body).toContain('fill="white"')
    expect(t.maskSvg).toBeNull()
  })
  it('original mode keeps colours', () => {
    const t = themeSvg(fx('bars-multipath.svg'), { ...opts, colorMode: 'original' })
    expect(t.body).toContain('#1F1D1D')
  })
  it('prefixes ids and references', () => {
    const t = themeSvg(fx('multicolor.svg'), opts)
    const p = prefixIds(t.body, 'x')
    expect(p).toContain('id="x-clip0_1_2"')
    expect(p).toContain('url(#x-clip0_1_2)')
  })
})

describe('library build', () => {
  const raws = [
    raw('icon/Audio descricao', fx('half-circle.svg')),
    raw('icon/Deficiência visual', fx('stroked.svg')),
    raw('icon/Pessoa', fx('multicolor.svg')),
    raw('Frame 12', fx('bars-multipath.svg'), { sourceKind: 'frame' })
  ]
  const processed = processIcons(raws, DEFAULT_SETTINGS, {})
  const files = buildFiles({ allIcons: processed.icons, settings: { ...DEFAULT_SETTINGS, formats: { ...DEFAULT_SETTINGS.formats, mask: true } }, grid: processed.grid, tier: processed.tier, generatedAt: '2026-01-01' })

  it('detects the library grid', () => {
    expect(processed.grid).toMatchObject({ width: 24, height: 24, count: 4, detected: true })
  })
  it('flags auto-named layers (warning under lenient)', () => {
    const f = processed.icons.find((i) => i.rawName === 'Frame 12')!
    expect(f.findings.some((x) => x.ruleId === 'auto-name')).toBe(true)
  })
  it('emits all expected files', () => {
    for (const p of [
      'svg/cmn-audio-descricao.svg', 'svg/cmn-deficiencia-visual.svg', 'sprite/cmn-sprite.svg', 'html/index.html',
      'html/cmn-icons.css', 'html/cmn-icons-mask.css', 'angular/icons.ts', 'angular/cmn-icon.component.ts',
      'angular-classic/cmn-icon.component.ts', 'icons.json', 'AGENTS.md'
    ]) expect(Object.keys(files), p).toContain(p)
  })
  it('does not HTML-escape generated markup', () => {
    const oneIcon = Object.entries(files).find(([k]) => /^angular\/icons\/[^/]+\.ts$/.test(k) && !k.endsWith('index.ts'))![1]
    expect(oneIcon).not.toContain('&lt;')
    expect(oneIcon).toContain('<path')
  })
  it('manifest is valid JSON with usage + slots', () => {
    const m = JSON.parse(files['icons.json'])
    expect(m.icons.length).toBeGreaterThan(0)
    expect(m.icons[0].usage.angular).toContain('<cmn-icon name=')
  })
  it('test page embeds sprite and data, no external refs', () => {
    const html = files['html/index.html']
    expect(html).toContain('<symbol id="cmn-audio-descricao"')
    expect(html).not.toMatch(/src="https?:/)
    expect(html).not.toMatch(/href="https?:/)
  })
  it('test page script parses', () => {
    const html = files['html/index.html']
    const m = /<script>([\s\S]*)<\/script>/.exec(html)!
    expect(() => new Function(m[1])).not.toThrow()
  })
})

describe('categories', () => {
  it('auto: layer path wins, then section, frame, page; ignores auto-names', () => {
    const ctx = { section: 'Navegação', frame: 'Frame 12' }
    expect(resolveCategory('auto', { pathNames: ['Acessibilidade'], ctx, page: 'Icons' })).toEqual({ slug: ['acessibilidade'], label: 'Acessibilidade' })
    expect(resolveCategory('auto', { pathNames: [], ctx, page: 'Icons' })).toEqual({ slug: ['navegacao'], label: 'Navegação' })
    expect(resolveCategory('auto', { pathNames: [], ctx: { frame: 'Frame 12' }, page: '  ↳ Icons' })).toEqual({ slug: ['icons'], label: 'Icons' })
  })
  it('explicit sources do not fall back; none disables', () => {
    expect(resolveCategory('section', { pathNames: ['A'], ctx: {}, page: 'P' }).slug).toEqual([])
    expect(resolveCategory('none', { pathNames: ['A'], ctx: {}, page: 'P' }).slug).toEqual([])
  })
  it('path segments drop the ignored root folder', () => {
    expect(pathSegments('icon/Acessibilidade/Libras', ['icon'])).toEqual(['Acessibilidade'])
    expect(pathSegments('icon/Libras', ['icon'])).toEqual([])
  })
  it('summarises counts', () => {
    expect(summariseCategories([{ category: ['a'], categoryLabel: 'A' }, { category: ['a'], categoryLabel: 'A' }, { category: [], categoryLabel: '' }])).toEqual([{ id: 'a', label: 'A', count: 2 }])
  })
  it('splits svg files and sprites by category', () => {
    const raws = [raw('Acessibilidade/Libras', fx('stroked.svg')), raw('Navegacao/Home', fx('bars-multipath.svg'))]
    const p = processIcons(raws, { ...DEFAULT_SETTINGS, splitByCategory: true }, {})
    const files = buildFiles({ allIcons: p.icons, settings: { ...DEFAULT_SETTINGS, splitByCategory: true }, grid: p.grid, tier: p.tier, generatedAt: 'x' })
    expect(Object.keys(files)).toContain('svg/acessibilidade/cmn-libras.svg')
    expect(Object.keys(files)).toContain('sprite/cmn-navegacao-sprite.svg')
    expect(JSON.parse(files['icons.json']).icons[0].category).toEqual(['acessibilidade'])
  })
})

describe('override alerts', () => {
  const usage = (o: UsageInfo['overrides']): UsageInfo => ({ instances: 5, pages: ['A'], remote: true, overrides: o, sizes: ['16×16'], colors: [], exportedFrom: 'main' })
  it('flags overrides no format supports', () => {
    const f = overrideFindings(usage({ opacity: 3 }), DEFAULT_SETTINGS)
    expect(f[0]).toMatchObject({ ruleId: 'override-unsupported', severity: 'warn' })
    expect(f[0].message).toContain('Layer opacity')
  })
  it('colour is fine for sprite/Angular but only partial for mask and plain SVG', () => {
    const settings = { ...DEFAULT_SETTINGS, formats: { ...DEFAULT_SETTINGS.formats, mask: true } }
    const f = overrideFindings(usage({ color: 2 }), settings)
    expect(f).toHaveLength(1)
    expect(f[0].ruleId).toBe('override-partial')
    expect(f[0].formats).toEqual(['svg', 'mask'])
  })
  it('stroke weight is unsupported by mask only when mask is enabled', () => {
    expect(overrideFindings(usage({ strokeWeight: 1 }), DEFAULT_SETTINGS)[0].ruleId).toBe('override-partial')
    const f = overrideFindings(usage({ strokeWeight: 1 }), { ...DEFAULT_SETTINGS, formats: { ...DEFAULT_SETTINGS.formats, mask: true } })
    expect(f[0].ruleId).toBe('override-unsupported')
  })
  it('no usage → no findings', () => {
    expect(overrideFindings(undefined, DEFAULT_SETTINGS)).toEqual([])
  })
})

import { canonicalLeafNames, compareSignatures, hash32, normalisePath, planRenames } from '../src/core/fixes'

describe('heuristics helpers', () => {
  it('normalises path numbers', () => {
    expect(normalisePath('M 1.0004 2.9999L3 -0.0001', 2)).toBe('M 1 3L3 0')
  })
  it('hashes deterministically', () => {
    expect(hash32('abc')).toBe(hash32('abc'))
    expect(hash32('abc')).not.toBe(hash32('abd'))
  })
  it('classifies similarity', () => {
    expect(compareSignatures({ geom: 'a', shape: 's' }, { geom: 'a', shape: 's' })).toBe('identical')
    expect(compareSignatures({ geom: 'a', shape: 's' }, { geom: 'b', shape: 's' })).toBe('same-shape')
    expect(compareSignatures({ geom: 'a', shape: 's' }, { geom: 'b', shape: 't' })).toBe('different')
  })
  it('canonical leaf names: single leaf → base', () => {
    expect(canonicalLeafNames([{ name: 'Union' }], 'Vector')).toEqual(['Vector'])
  })
  it('canonical leaf names: primary colour first, then z-order', () => {
    const names = canonicalLeafNames([{ name: 'a', hex: '#f00' }, { name: 'b', hex: '#000' }, { name: 'c', hex: '#000' }], 'Vector')
    expect(names).toEqual(['Vector 3', 'Vector', 'Vector 2'])
  })
  it('plans only needed renames', () => {
    expect(planRenames([{ id: '1', name: 'Vector' }, { id: '2', name: 'Path 3' }], 'Vector')).toEqual([{ nodeId: '2', from: 'Path 3', to: 'Vector 2' }])
  })
})

describe('token naming', () => {
  const cfg = DEFAULT_SETTINGS.tokenNaming
  it('path (default)', () => expect(tokenVarName('color/icon/Primary', undefined, cfg)).toBe('--color-icon-primary'))
  it('prefix + strip', () => expect(tokenVarName('color/neutral/darkest', undefined, { ...cfg, prefix: 'ds', stripSegments: 'color' })).toBe('--ds-neutral-darkest'))
  it('collection', () => expect(tokenVarName('color/neutral/darkest', 'Primitives', { ...cfg, mode: 'collection' })).toBe('--primitives-color-neutral-darkest'))
  it('custom mapping wins, falls back to path', () => {
    const c = { ...cfg, mode: 'custom' as const, mapping: '# comment\ncolor/icon/default = icon-color\n' }
    expect(parseMapping(c.mapping).get('color/icon/default')).toBe('--icon-color')
    expect(tokenVarName('color/icon/default', undefined, c)).toBe('--icon-color')
    expect(tokenVarName('color/other', undefined, c)).toBe('--color-other')
  })
  it('none disables', () => expect(tokenVarName('x', undefined, { ...cfg, mode: 'none' })).toBeNull())
  it('themeSvg honours the naming config', () => {
    const map = new Map([['#6b7280', { name: 'color/icon/secondary', collection: 'Semantic' }]])
    const t = themeSvg(fx('multicolor.svg'), { ...opts, variableByHex: map, tokenNaming: { ...cfg, prefix: 'ds' } })
    expect(t.body).toContain('var(--ds-color-icon-secondary, #6b7280)')
  })
})

describe('stroke policy', () => {
  it('parses and validates the table', () => {
    expect(parseStrokeTable('64:3, 16:1.5, 32 = 2px')).toEqual([{ size: 16, weight: 1.5 }, { size: 32, weight: 2 }, { size: 64, weight: 3 }])
    expect(validateStrokeTable('24:2')).toBeNull()
    expect(validateStrokeTable('24-2')).toContain('Cannot read')
  })
  it('picks the weight for a size (largest step ≤ size)', () => {
    const t = parseStrokeTable('16:1.5, 24:2, 32:2, 64:3')
    expect([12, 16, 24, 31, 32, 48, 64, 96].map((n) => weightForSize(n, t))).toEqual([1.5, 1.5, 2, 2, 2, 2, 3, 3])
  })
  it('scale policy does not add non-scaling-stroke', () => {
    const t = themeSvg(fx('stroked.svg'), { ...opts, strokePolicy: 'scale' })
    expect(t.body).not.toContain('vector-effect')
  })
})

describe('svg sanitiser', () => {
  it('strips active content and external references', () => {
    const hostile = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" onload="alert(1)"><script>alert(1)</script><foreignObject><div/></foreignObject><a href="javascript:alert(1)"><path d="M0 0H1V1Z" fill="url(https://evil/x)" onclick="x()"/></a><image href="https://evil/x.png"/><path d="M0 0H1V1Z" fill="#000" style="background:url(https://evil)"/></svg>'
    const t = themeSvg(hostile, opts)
    expect(t.ok).toBe(true)
    for (const bad of ['script', 'foreignObject', 'onload', 'onclick', 'javascript:', 'evil', '<image', '<a ']) expect(t.standalone, bad).not.toContain(bad)
    expect(t.body).toContain('<path')
  })
  it('keeps internal references', () => {
    const doc = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="c"><rect/></clipPath></defs><g clip-path="url(#c)"><path fill="#000" d="M0 0"/></g></svg>', 'image/svg+xml')
    sanitizeSvgTree(doc.documentElement)
    expect(new XMLSerializer().serializeToString(doc)).toContain('clip-path="url(#c)"')
  })
})

describe('identity + changelog', () => {
  const prev = { libraryVersion: '1.2.3', icons: [
    { name: 'home', hash: 'a', figma: { componentKey: 'k1' } },
    { name: 'search', hash: 'b', figma: { componentKey: 'k2' } },
    { name: 'gone', hash: 'c', figma: { componentKey: 'k3' } },
    { name: 'plain', hash: 'd' }
  ] }
  it('detects added/removed/renamed/changed using componentKey first', () => {
    const d = diffCatalogs(prev, [
      { name: 'home', hash: 'a', figma: { componentKey: 'k1' } },
      { name: 'magnifier', hash: 'b', figma: { componentKey: 'k2' } }, // renamed
      { name: 'plain', hash: 'x' }, // matched by name, artwork changed
      { name: 'new', hash: 'n', figma: { componentKey: 'k9' } }
    ])
    expect(d.renamed).toEqual([{ from: 'search', to: 'magnifier' }])
    expect(d.removed.map((r) => r.name)).toEqual(['gone'])
    expect(d.added.map((r) => r.name)).toEqual(['new'])
    expect(d.changed.map((r) => r.name)).toEqual(['plain'])
    expect(d.unchanged).toBe(1)
    expect(d.bump).toBe('major')
  })
  it('bumps versions', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0')
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4')
    expect(bumpVersion(undefined, 'minor')).toBe('1.0.0')
  })
  it('keeps deprecated aliases and writes a changelog', () => {
    const d = diffCatalogs(prev, [{ name: 'magnifier', hash: 'b', figma: { componentKey: 'k2' } }])
    const dep = nextDeprecated(prev, d, '2.0.0', new Set(['magnifier']))
    expect(dep).toEqual([{ name: 'search', replacedBy: 'magnifier', since: '2.0.0' }])
    expect(changelogMarkdown(d, '2.0.0', '2026-10-09')).toContain('`search` → `magnifier`')
  })
})

describe('team config', () => {
  it('round-trips and ignores local-only / wrong-typed keys', () => {
    const text = exportConfig({ ...DEFAULT_SETTINGS, namespace: 'abc', windowWidth: 999 })
    expect(text).not.toContain('windowWidth')
    const parsed = parseConfig(JSON.stringify({ ...JSON.parse(text), libWidth: 'nope', sync: { token: 'x' }, extra: 1 }), DEFAULT_SETTINGS)
    expect(parsed.settings.namespace).toBe('abc')
    expect(parsed.settings.libWidth).toBe(DEFAULT_SETTINGS.libWidth)
    expect(parsed.ignored.sort()).toEqual(['extra', 'libWidth', 'sync'].sort())
  })
})

import { IDENTITY, invert, multiply, transformPath } from '../src/core/pathTransform'

describe('path transform (outlined strokes)', () => {
  it('translates absolute commands', () => {
    expect(transformPath('M 1 2 L 3 4 C 5 6 7 8 9 10 Q 1 1 2 2 Z', [[1, 0, 10], [0, 1, 20]])).toBe('M11 22L13 24C15 26 17 28 19 30Q11 21 12 22Z')
  })
  it('scales and rotates (90°)', () => {
    expect(transformPath('M 1 0 L 0 1', [[0, -1, 0], [1, 0, 0]])).toBe('M0 1L-1 0')
    expect(transformPath('M 1 1', [[2, 0, 0], [0, 3, 0]])).toBe('M2 3')
  })
  it('inverse + multiply round-trip', () => {
    const m: [[number, number, number], [number, number, number]] = [[0, -1, 5], [1, 0, 7]]
    const id = multiply(invert(m), m)
    id.flat().forEach((v, i) => expect(v).toBeCloseTo(IDENTITY.flat()[i], 9))
  })
  it('rejects relative or unknown commands so callers can fall back', () => {
    expect(() => transformPath('m 1 2 l 3 4', IDENTITY)).toThrow()
    expect(() => transformPath('M 1 2 A 1 1 0 0 0 2 2', IDENTITY)).toThrow()
  })
})

import ts from 'typescript'

describe('generated icon data type-checks (regression: literal policy comparison)', () => {
  /** type-checks the framework-free data files (no Angular/React needed); the full compile runs in scripts/compile-check.mjs */
  const check = (files: Record<string, string>, dir: string, entries: string[]) => {
    const sources = new Map(Object.entries(files).filter(([k]) => k.startsWith(dir + '/') && k.endsWith('.ts')).map(([k, v]) => ['/' + k, v]))
    const host = ts.createCompilerHost({})
    const original = host.getSourceFile.bind(host)
    host.getSourceFile = (name, lang) => (sources.has(name) ? ts.createSourceFile(name, sources.get(name)!, lang) : original(name, lang))
    host.fileExists = (n) => sources.has(n) || ts.sys.fileExists(n)
    host.readFile = (n) => sources.get(n) ?? ts.sys.readFile(n)
    host.directoryExists = (d) => [...sources.keys()].some((k) => k.startsWith(d.replace(/\/$/, '') + '/')) || ts.sys.directoryExists(d)
    host.realpath = (n) => n
    const program = ts.createProgram(entries.map((e) => '/' + dir + '/' + e), { strict: true, noEmit: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ['lib.es2020.d.ts'] }, host)
    return ts.getPreEmitDiagnostics(program).filter((d) => d.file && sources.has(d.file.fileName)).map((d) => `${d.file!.fileName}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`)
  }
  for (const policy of ['constant', 'scale', 'table'] as const) {
    it(`data files compile with stroke policy "${policy}"`, () => {
      const settings = { ...DEFAULT_SETTINGS, strokePolicy: policy }
      const p = processIcons([raw('icon/Home', fx('stroked.svg')), raw('nav/Search', fx('stroked.svg'))], settings, {})
      const files = buildFiles({ allIcons: p.icons, settings, grid: p.grid, tier: p.tier, generatedAt: 'x' })
      expect(check(files, 'angular', ['icons.ts', 'loaders.ts', 'icons/index.ts', 'categories/_uncategorised.ts'].filter((e) => `angular/${e}` in files))).toEqual([])
    })
  }
  it('one file per icon, a category chunk per category, and a loader for each', () => {
    const p = processIcons([raw('icon/Home', fx('stroked.svg')), raw('icon/Plus', fx('stroked.svg'))], DEFAULT_SETTINGS, {})
    const files = buildFiles({ allIcons: p.icons, settings: DEFAULT_SETTINGS, grid: p.grid, tier: p.tier, generatedAt: 'x' })
    const perIcon = Object.keys(files).filter((k) => /^angular\/icons\/[^/]+\.ts$/.test(k) && !k.endsWith('index.ts'))
    expect(perIcon).toHaveLength(2)
    const cats = Object.keys(files).filter((k) => k.startsWith('angular/categories/'))
    expect(cats.length).toBeGreaterThan(0)
    for (const c of cats) expect(files['angular/loaders.ts']).toContain(`./categories/${c.split('/').pop()!.replace('.ts', '')}`)
    expect(files['angular/index.ts']).not.toContain("./icons'")
    expect(files['angular/index.ts']).not.toContain('all-icons')
  })
  it('web component is only built when enabled and registers once', () => {
    const settings = { ...DEFAULT_SETTINGS, formats: { ...DEFAULT_SETTINGS.formats, webComponent: true } }
    const p = processIcons([raw('icon/Home', fx('stroked.svg'))], settings, {})
    const files = buildFiles({ allIcons: p.icons, settings, grid: p.grid, tier: p.tier, generatedAt: 'x' })
    const js = Object.entries(files).find(([k]) => k.startsWith('web-component/') && k.endsWith('.js'))![1]
    expect(js).toContain('customElements.define')
    expect(js).toContain('<path')
    // run it for real (happy-dom provides custom elements)
    const tag = Object.keys(files).find((k) => k.endsWith('-icon.js'))!.split('/')[1].replace('.js', '')
    // eslint-disable-next-line no-new-func
    new Function(js.replace(/^export /gm, ''))()
    const el = document.createElement(tag)
    el.setAttribute('name', p.icons[0].name)
    el.setAttribute('size', '32')
    el.setAttribute('label', 'Home')
    document.body.appendChild(el)
    expect(el.shadowRoot!.innerHTML).toContain('<svg')
    expect(el.style.getPropertyValue(`--${tag}-size`) || el.getAttribute('style')).toContain('32px')
    expect(el.getAttribute('role')).toBe('img')
    const off = buildFiles({ allIcons: p.icons, settings: DEFAULT_SETTINGS, grid: p.grid, tier: p.tier, generatedAt: 'x' })
    expect(Object.keys(off).some((k) => k.startsWith('web-component/'))).toBe(false)
  })
})

describe('changelog: the cases that look like "nothing happened"', () => {
  const prev = { icons: [{ name: 'libras', hash: 'a', colorHash: 'c1', category: ['acess'], figma: { componentKey: 'k1', layerName: 'icon/Libras' } }] }
  it('layer renamed but same code name (accents/case) is reported as relabelled, not renamed', () => {
    const d = diffCatalogs(prev, [{ name: 'libras', hash: 'a', colorHash: 'c1', category: ['acess'], figma: { componentKey: 'k1', layerName: 'icon/Líbras' } }])
    expect(d.renamed).toEqual([])
    expect(d.relabelled).toEqual([{ name: 'libras', from: 'icon/Libras', to: 'icon/Líbras' }])
    expect(d.bump).toBe('none')
    expect(d.unchanged).toBe(0)
  })
  it('recolour is detected separately from drawing changes and bumps patch', () => {
    const d = diffCatalogs(prev, [{ name: 'libras', hash: 'a', colorHash: 'c2', category: ['acess'], figma: { componentKey: 'k1', layerName: 'icon/Libras' } }])
    expect(d.recoloured.map((x) => x.name)).toEqual(['libras'])
    expect(d.changed).toEqual([])
    expect(d.bump).toBe('patch')
  })
  it('category move is reported and not breaking', () => {
    const d = diffCatalogs(prev, [{ name: 'libras', hash: 'a', colorHash: 'c1', category: ['nav'], figma: { componentKey: 'k1', layerName: 'icon/Libras' } }])
    expect(d.moved).toEqual([{ name: 'libras', from: 'acess', to: 'nav' }])
    expect(d.bump).toBe('none')
  })
  it('rename + nudge reports both a rename and a changed drawing', () => {
    const d = diffCatalogs(prev, [{ name: 'libras-cic', hash: 'z', colorHash: 'c1', category: ['acess'], figma: { componentKey: 'k1', layerName: 'icon/Libras CIC' } }])
    expect(d.renamed).toEqual([{ from: 'libras', to: 'libras-cic' }])
    expect(d.changed.map((x) => x.name)).toEqual(['libras-cic'])
    expect(d.bump).toBe('major')
  })
})

describe('export README', () => {
  const raws = [raw('icon/Home', fx('bars-multipath.svg')), raw('icon/Plus', fx('stroked.svg')), raw('icon/Pie', fx('multicolor.svg'))]
  const mk = (formats: Partial<typeof DEFAULT_SETTINGS.formats>, extra: Partial<typeof DEFAULT_SETTINGS> = {}) => {
    const settings = { ...DEFAULT_SETTINGS, ...extra, formats: { ...DEFAULT_SETTINGS.formats, ...formats } }
    const p = processIcons(raws, settings, {})
    return buildFiles({ allIcons: p.icons, settings, grid: p.grid, tier: p.tier, generatedAt: '2026-01-01' })['README.md']
  }
  it('uses real names and only documents enabled formats', () => {
    const md = mk({ mask: false, angularClassic: false })
    expect(md).toContain('<use href="/icons/sprite/cmn-sprite.svg#cmn-home"/>')
    expect(md).toContain('<cmn-icon name="home"')
    expect(md).toContain('angular/` needs Angular **17.1+**')
    expect(md).not.toContain('angular-classic')
    expect(md).not.toContain('CSS mask')
    expect(md).not.toContain('undefined')
    expect(md).toContain('--cmn-icon-color-2')
    expect(md).toContain('--cmn-icon-stroke-width')
  })
  it('documents the mask and stroke table when chosen', () => {
    const md = mk({ mask: true }, { strokePolicy: 'table', strokeTable: '16:1.5, 32:2' })
    expect(md).toContain('cmn-icon--home')
    expect(md).toContain('16px→1.5px, 32px→2px')
  })
  it('is concise', () => expect(mk({}).split('\n').length).toBeLessThan(140))
})

import { angularSnippet, htmlSnippet, overrideNotes, reactSnippet, reactComponentSnippet, cssSnippet } from '../src/core/snippets'
import { parseShared, serializeShared } from '../src/core/config'

describe('snippets (codegen + readme must agree)', () => {
  const base = { ns: 'cmn', name: 'home', spritePath: './icons/sprite/', sizePx: 24, sizeUnit: 'px' as const, vars: { '--cmn-icon-color': '#0a7d3b' }, color: '#0a7d3b' }
  it('html', () => {
    const s = htmlSnippet(base)
    expect(s).toContain('<use href="./icons/sprite/cmn-sprite.svg#cmn-home"/>')
    expect(s).toContain('--cmn-icon-size: 24px')
    expect(s).toContain('aria-hidden="true"')
  })
  it('labelled icons get role=img, rem units convert', () => {
    const s = htmlSnippet({ ...base, label: 'Home', sizeUnit: 'rem' })
    expect(s).toContain('role="img" aria-label="Home"')
    expect(s).toContain('--cmn-icon-size: 1.5rem')
  })
  it('angular + react + css', () => {
    expect(angularSnippet(base)).toContain('<cmn-icon name="home" [size]="24" color="#0a7d3b" />')
    expect(reactComponentSnippet(base)).toContain('<CmnIcon name="home" size={24} color="#0a7d3b" />')
    expect(reactSnippet(base)).toContain("style={{ '--cmn-icon-color': '#0a7d3b', '--cmn-icon-size': '24px' }}")
    expect(cssSnippet({ ...base, vars: {}, sizePx: null })).toContain('no overrides')
  })
  it('notes list overrides that formats cannot reproduce', () => {
    const n = overrideNotes({ opacity: 1 }, DEFAULT_SETTINGS)
    expect(n[0]).toContain('Layer opacity')
    expect(overrideNotes({ color: 1, size: 1 }, DEFAULT_SETTINGS)).toEqual(expect.arrayContaining([expect.stringContaining('Colour')]))
  })
})

describe('shared config in the file', () => {
  it('round-trips and rejects garbage', () => {
    const text = serializeShared({ ...DEFAULT_SETTINGS, namespace: 'abc' }, '2026-10-09', 'Ana')
    expect(parseShared(text)?.publishedBy).toBe('Ana')
    expect(parseConfig(parseShared(text)!.config, DEFAULT_SETTINGS).settings.namespace).toBe('abc')
    expect(parseShared('nope')).toBeNull()
    expect(parseShared(null)).toBeNull()
  })
})

describe('react format', () => {
  it('emits files and documents them', () => {
    const settings = { ...DEFAULT_SETTINGS, formats: { ...DEFAULT_SETTINGS.formats, react: true } }
    const p = processIcons([raw('icon/Home', fx('bars-multipath.svg'))], settings, {})
    const files = buildFiles({ allIcons: p.icons, settings, grid: p.grid, tier: p.tier, generatedAt: 'x' })
    for (const f of ['react/icons.ts', 'react/cmn-icon.tsx', 'react/index.ts']) expect(Object.keys(files)).toContain(f)
    expect(files['react/cmn-icon.tsx']).toContain('export const CmnIcon = memo(')
    expect(files['README.md']).toContain('### React')
    expect(files['README.md']).toContain('<CmnIcon icon={cmnHome} size={24}')
    expect(files['README.md']).toContain('<CmnIcon name="home" />')
  })
  it('is off by default', () => {
    const p = processIcons([raw('icon/Home', fx('bars-multipath.svg'))], DEFAULT_SETTINGS, {})
    expect(Object.keys(buildFiles({ allIcons: p.icons, settings: DEFAULT_SETTINGS, grid: p.grid, tier: p.tier, generatedAt: 'x' }))).not.toContain('react/index.ts')
  })
})

import { pickDominantLeaf } from '../src/core/fixes'

describe('vector layer naming analysis (what schemes does the file use?)', () => {
  it('detects the dominant scheme and counts case-only variants', () => {
    const r = pickDominantLeaf(new Map([['Vector', 680], ['vector', 14], ['Union', 2]]), 'Fallback')
    expect(r.name).toBe('Vector')
    expect(r.detected).toBe(true)
    expect(r.caseVariants).toBe(14)
    expect(r.stats[0]).toEqual({ name: 'Vector', count: 680 })
  })
  it('falls back to the configured name when there is no clear majority', () => {
    const r = pickDominantLeaf(new Map([['Vector', 10], ['Path', 10], ['Union', 5]]), 'Vector')
    expect(r.detected).toBe(false)
    expect(r.name).toBe('Vector')
  })
  it('empty file → configured name', () => {
    expect(pickDominantLeaf(new Map(), 'Vector')).toMatchObject({ name: 'Vector', detected: false })
  })
})

import { orientationKey } from '../src/core/pathTransform'

describe('orientation in artwork signatures (mirrored/rotated copies are not duplicates)', () => {
  it('distinguishes flips and rotations', () => {
    const id: [[number, number, number], [number, number, number]] = [[1, 0, 0], [0, 1, 0]]
    const flipX: [[number, number, number], [number, number, number]] = [[-1, 0, 24], [0, 1, 0]]
    const flipY: [[number, number, number], [number, number, number]] = [[1, 0, 0], [0, -1, 24]]
    const rot90: [[number, number, number], [number, number, number]] = [[0, -1, 24], [1, 0, 0]]
    const keys = new Set([id, flipX, flipY, rot90].map(orientationKey))
    expect(keys.size).toBe(4)
  })
  it('ignores translation and tiny float noise', () => {
    expect(orientationKey([[1, 0, 5], [0, 1, 9]])).toBe(orientationKey([[1.0000001, 0, 0], [-0.0000001, 1, 0]]))
  })
})

describe('duplicate groups can be marked intentional', () => {
  it('filters the group out of icons and findings', () => {
    const fix = { id: 'dupe:1', kind: 'duplicate-component' as const, confidence: 'high' as const, nodeId: '1', nodeType: 'COMPONENT', name: 'a', pageName: 'P', width: 24, height: 24, svg: null, diffs: ['a', 'b'], actions: [], groupId: 'g1' }
    const r = raw('icon/A', fx('stroked.svg'), { fixes: [fix] })
    expect(processIcons([r], DEFAULT_SETTINGS, {}).icons[0].findings.some((f) => f.ruleId === 'duplicate-component')).toBe(true)
    const ignored = processIcons([r], { ...DEFAULT_SETTINGS, ignoredDuplicates: ['g1'] }, {})
    expect(ignored.icons[0].fixes).toEqual([])
    expect(ignored.icons[0].findings.some((f) => f.ruleId === 'duplicate-component')).toBe(false)
  })
})

describe('baseline snapshots', () => {
  const icons = Array.from({ length: 700 }, (_, i) => ({ name: `icon-${i}`, hash: `h${i}`, colorHash: `c${i}`, category: ['a'], figma: { componentKey: `k${i}`, layerName: `Icon/${i}` } }))
  it('round-trips through deflate + base64 and stays small', () => {
    const snap = makeSnapshot(icons, { at: '2026-10-09T00:00:00Z', version: '1.2.0' })
    const text = encodeSnapshot(snap)
    expect(text.length).toBeLessThan(60000)
    const back = decodeSnapshot(text)!
    expect(back.icons).toHaveLength(700)
    expect(back.version).toBe('1.2.0')
    expect(decodeSnapshot('garbage')).toBeNull()
  })
  it('chunks without losing data', () => {
    const t = 'x'.repeat(250000)
    const parts = chunkText(t)
    expect(parts.length).toBe(3)
    expect(parts.join('')).toBe(t)
  })
  it('maps a diff to per-icon change kinds', () => {
    const prev = { icons: [{ name: 'a', hash: '1', figma: { componentKey: 'k1' } }, { name: 'b', hash: '2', figma: { componentKey: 'k2' } }] }
    const cur = [{ name: 'a', hash: '9', figma: { componentKey: 'k1' } }, { name: 'c', hash: '2', figma: { componentKey: 'k2' } }, { name: 'd', hash: '4' }]
    const m = changesByName(diffCatalogs(prev, cur))
    expect(m.get('a')?.has('changed')).toBe(true)
    expect(m.get('c')?.has('renamed')).toBe(true)
    expect(m.get('d')?.has('added')).toBe(true)
  })
  it('prefers repo > shared > local > file', () => {
    const s = makeSnapshot([], { at: 'x' })
    expect(pickBaseline({ local: s, shared: s })).toBe('shared')
    expect(pickBaseline({ file: s, local: s })).toBe('local')
    expect(pickBaseline({})).toBeNull()
  })
})

describe('variable matching by order', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h10v10H0z" fill="#111111"/><path d="M12 12h10v10H12z" fill="#111111"/></svg>'
  const base = { ns: 'ds', colorMode: 'themeable' as const, tokenNaming: { ...DEFAULT_SETTINGS.tokenNaming, mode: 'path' as const }, strokePolicy: 'constant' as const, precision: 2 }
  const paint = (variable?: string) => ({ role: 'fill' as const, hex: '#111111', opacity: 1, variable })
  it('keeps two variables with the same hex apart', () => {
    const r = themeSvg(svg, { ...base, variableByHex: new Map([['#111111', { name: 'color/a' }]]), paints: [paint('color/a'), paint('color/b')] })
    expect(r.slots.map((x) => x.variable)).toEqual(['color/a', 'color/b'])
  })
  it('does not give an unbound paint the variable of a bound one with the same hex', () => {
    const r = themeSvg(svg, { ...base, variableByHex: new Map([['#111111', { name: 'color/a' }]]), paints: [paint('color/a'), paint(undefined)] })
    expect(r.slots.map((x) => x.variable)).toEqual(['color/a', undefined])
  })
  it('falls back to hex when the sequences do not line up, but never on an ambiguous hex', () => {
    const one = themeSvg(svg, { ...base, variableByHex: new Map([['#111111', { name: 'color/a' }]]), paints: [paint('color/a')] })
    expect(one.slots).toHaveLength(1)
    expect(one.slots[0].variable).toBe('color/a')
    const amb = themeSvg(svg, { ...base, variableByHex: new Map([['#111111', { name: 'color/a' }]]), paints: [paint('color/a'), paint('color/b'), paint('color/c')] })
    expect(amb.slots[0].variable).toBeUndefined()
  })
})

describe('token mapping rules', () => {
  const cfg = { ...DEFAULT_SETTINGS.tokenNaming, mode: 'custom' as const, mapping: 'Semantic::color/icon/default = --icon\ncolor/icon/default = --icon-any\ncolor/brand/* = --brand-*' }
  it('prefers collection-scoped, then exact, then wildcard', () => {
    expect(tokenVarName('color/icon/default', 'Semantic', cfg)).toBe('--icon')
    expect(tokenVarName('color/icon/default', 'Primitives', cfg)).toBe('--icon-any')
    expect(tokenVarName('color/brand/Primary/500', 'Primitives', cfg)).toBe('--brand-primary-500')
    expect(tokenVarName('color/other', 'Primitives', cfg)).toBe('--color-other')
  })
  it('suggests a table that round-trips through the parser', () => {
    const text = suggestMapping([{ variable: 'color/a', collection: 'P' }, { variable: 'color/b', collection: 'P' }], DEFAULT_SETTINGS.tokenNaming)
    expect(parseMapping(text).get('color/a')).toBe('--color-a')
  })
})

describe('code connect + snippets', () => {
  it('builds node urls and maps only components', () => {
    expect(nodeUrl('https://www.figma.com/design/AbC123/My-Lib?node-id=0-1&t=x', '12:34')).toBe('https://www.figma.com/design/AbC123/My-Lib?node-id=12-34')
    expect(nodeUrl('https://example.com/x', '1:2')).toBeNull()
    const settings = { ...DEFAULT_SETTINGS, codeConnectUrl: 'https://www.figma.com/design/AbC123/My-Lib', formats: { ...DEFAULT_SETTINGS.formats, codeConnect: true } }
    const p = processIcons([{ ...raw('icon/Home', fx('stroked.svg')), nodeId: '5:6' }, { ...raw('icon/Plus', fx('stroked.svg')), nodeId: '7:8', sourceKind: 'frame' as const }], settings, {})
    const files = buildFiles({ allIcons: p.icons, settings, grid: p.grid, tier: p.tier, generatedAt: 'x' })
    const src = files['code-connect/cmn-icons.figma.ts']
    expect(src).toContain('node-id=5-6')
    expect(src).not.toContain('node-id=7-8')
    expect(src).toContain('<cmn-icon name="home">')
    expect(files['code-connect/README.md']).toContain('1 skipped')
  })
  it('web component snippet', () => {
    expect(webComponentSnippet({ ns: 'cmn', name: 'home', spritePath: '', sizePx: 24, sizeUnit: 'px', vars: {} })).toContain('<cmn-icon name="home" size="24px"></cmn-icon>')
  })
})

describe('duplicate-name policy', () => {
  const mk = (names: string[], cats: string[][] = names.map(() => [])) => names.map((name, i) => ({ name, category: cats[i], stable: `k${names.length - i}`, locked: false }))
  it('block keeps names', () => {
    expect(resolveDuplicates(mk(['home', 'home']), 'block').names).toEqual(['home', 'home'])
  })
  it('category prefixes duplicates and leaves unresolved ones alone', () => {
    const r = resolveDuplicates(mk(['home', 'home', 'home', 'plus'], [['arrows'], ['nav'], ['nav'], ['nav']]), 'category')
    expect(r.names).toEqual(['arrows-home', 'nav-home', 'home', 'plus'])
  })
  it('suffix numbers by stable key, not by position', () => {
    const a = resolveDuplicates(mk(['home', 'home', 'home']), 'suffix')
    // stable keys are k3,k2,k1 → index 2 (k1) keeps the plain name
    expect(a.names).toEqual(['home-3', 'home-2', 'home'])
    const reordered = resolveDuplicates([...mk(['home', 'home', 'home'])].reverse(), 'suffix')
    expect(reordered.names).toEqual(['home', 'home-2', 'home-3'])
  })
  it('never rewrites a name the user typed', () => {
    const slots = mk(['home', 'home'])
    slots[1].locked = true
    const r = resolveDuplicates(slots, 'suffix')
    expect(r.names[1]).toBe('home')
    expect(r.names[0]).toBe('home-2')
  })
  it('processIcons reports a resolved duplicate as info, not an error', () => {
    const settings = { ...DEFAULT_SETTINGS, duplicateNames: 'suffix' as const }
    const a = { ...raw('icon/Home', fx('stroked.svg')), key: 'a', nodeId: '1:1', componentKey: 'ka' }
    const b2 = { ...raw('other/Home', fx('stroked.svg')), key: 'b', nodeId: '1:2', componentKey: 'kb' }
    const p = processIcons([a, b2], { ...settings, ignoreSegments: ['icon', 'other'] }, {})
    expect(p.icons.map((i) => i.name).sort()).toEqual(['home', 'home-2'])
    expect(p.icons.some((i) => i.findings.some((f) => f.ruleId === 'duplicate-resolved'))).toBe(true)
    expect(p.icons.every((i) => !i.findings.some((f) => f.ruleId === 'duplicate-name'))).toBe(true)
  })
})

describe('every generated SVG file is well-formed XML (external <use> and <img> need it)', () => {
  const settings = { ...DEFAULT_SETTINGS, splitByCategory: true }
  const p = processIcons([raw('icon/Home', fx('stroked.svg')), raw('nav/Pie', fx('multicolor.svg')), raw('nav/Bars', fx('bars-multipath.svg'))], settings, {})
  const files = buildFiles({ allIcons: p.icons, settings, grid: p.grid, tier: p.tier, generatedAt: 'x' })
  const svgs = Object.entries(files).filter(([k]) => k.endsWith('.svg'))
  it('has svg, sprite and category sprites to check', () => {
    expect(svgs.length).toBeGreaterThanOrEqual(5)
    expect(svgs.some(([k]) => k.startsWith('sprite/'))).toBe(true)
  })
  for (const [path, text] of svgs) {
    it(path, () => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
      expect(doc.getElementsByTagName('parsererror').length, 'XML parse error').toBe(0)
      expect(doc.documentElement.localName).toBe('svg')
    })
  }
})

describe('aliases for intentional duplicates', () => {
  const dupFix = (groupId: string, ownerNode: string, others: string[]) =>
    ({ id: 'dupe:' + ownerNode, kind: 'duplicate-component', confidence: 'high', nodeId: ownerNode, nodeType: 'COMPONENT', diffs: [], actions: [], groupId, others: others.map((nodeId) => ({ nodeId, name: nodeId })) }) as never
  const mkRaws = (sameColour = true) => {
    const a = { ...raw('icon/Close', fx('stroked.svg')), key: 'a', nodeId: '1:1' }
    const b2 = { ...raw('icon/Dismiss', fx('stroked.svg')), key: 'b', nodeId: '1:2' }
    const c = { ...raw('icon/Cancel', sameColour ? fx('stroked.svg') : fx('multicolor.svg')), key: 'c', nodeId: '1:3' }
    a.fixes = [dupFix('g1', '1:1', ['1:2', '1:3'])]
    return [a, b2, c]
  }
  const build = (settings: typeof DEFAULT_SETTINGS, raws: ReturnType<typeof mkRaws>) => {
    const p = processIcons(raws, settings, {})
    return { p, files: buildFiles({ allIcons: p.icons, settings, grid: p.grid, tier: p.tier, generatedAt: 'x' }) }
  }
  it('does nothing until a group is marked intentional', () => {
    const { p } = build(DEFAULT_SETTINGS, mkRaws())
    expect(p.icons.some((i) => i.aliasOf)).toBe(false)
  })
  it('owner = shortest name; the others alias it; only identical artwork is shared', () => {
    const settings = { ...DEFAULT_SETTINGS, ignoredDuplicates: ['g1'] }
    const { p } = build(settings, mkRaws(false))
    const by = Object.fromEntries(p.icons.map((i) => [i.name, i.aliasOf]))
    expect(by['close']).toBeUndefined()
    expect(by['dismiss']).toBe('close')
    expect(by['cancel']).toBeUndefined() // different artwork: stays its own icon
  })
  it('shares the markup in sprite, Angular data, Web Component and icons.json', () => {
    const settings = { ...DEFAULT_SETTINGS, ignoredDuplicates: ['g1'], formats: { ...DEFAULT_SETTINGS.formats, webComponent: true } }
    const { files } = build(settings, mkRaws())
    expect(files['sprite/cmn-sprite.svg']).toContain('<symbol id="cmn-dismiss" viewBox="0 0 24 24"><use href="#cmn-close"/></symbol>')
    expect(files['angular/icons/dismiss.ts']).toContain("...cmnClose, name: \"dismiss\"")
    expect(files['angular/icons/dismiss.ts']).not.toContain('<path')
    const wc = files['web-component/cmn-icon.js']
    expect(wc).toContain('"dismiss":"close"')
    const m = JSON.parse(files['icons.json'])
    expect(m.icons.find((i: { name: string }) => i.name === 'dismiss').aliasOf).toBe('close')
    expect(files['AGENTS.md']).toContain('Aliases (intentional duplicates)')
  })
  it('can be switched off', () => {
    const { p } = build({ ...DEFAULT_SETTINGS, ignoredDuplicates: ['g1'], aliasDuplicates: false }, mkRaws())
    expect(p.icons.some((i) => i.aliasOf)).toBe(false)
  })
})
