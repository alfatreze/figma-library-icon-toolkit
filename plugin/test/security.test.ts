import { describe, expect, it } from 'vitest'
import { parseConfig } from '../src/core/config'
import { safeViewBox, sanitizeSvgString } from '../src/core/sanitize'
import { migrateSettings, SCHEMA, SHARED_KEYS } from '../src/core/settingsSchema'
import { themeSvg } from '../src/core/svg'
import { buildFiles } from '../src/core/generators'
import { processIcons } from '../src/core/process'
import { DEFAULT_SETTINGS, Facts, RawIcon } from '../src/types'

const wrap = (inner: string, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ${attrs}>${inner}</svg>`

describe('SVG sanitiser (allow-list)', () => {
  const clean = (inner: string, attrs = '') => sanitizeSvgString(wrap(inner, attrs)) ?? ''
  it('keeps a normal icon', () => {
    const out = clean('<path d="M0 0h10v10z" fill="#111" fill-rule="evenodd"/>')
    expect(out).toContain('<path')
    expect(out).toContain('fill-rule="evenodd"')
  })
  it('removes active and external content', () => {
    for (const bad of [
      '<script>alert(1)</script>',
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
      '<image href="http://evil/x.png"/>',
      '<a href="javascript:alert(1)"><path d="M0 0"/></a>',
      '<use href="http://evil/s.svg#a"/>',
      '<style>*{fill:url(http://evil)}</style>',
      '<animate attributeName="x" to="1"/>',
      '<title>x</title><desc><![CDATA[><img src=x onerror=alert(1)>]]></desc>',
      '<!-- <img src=x onerror=alert(1)> -->',
      '<img xmlns="http://www.w3.org/1999/xhtml" src="http://evil/p.gif"/>'
    ]) {
      const out = clean(bad + '<path d="M0 0"/>')
      if (!bad.includes('CDATA')) expect(out, 'parsed: ' + bad).not.toBe('') // happy-dom's XML parser rejects CDATA; real browsers keep it and the sanitiser drops it
      expect(out, bad).not.toMatch(/script|foreignObject|<image|<a |<use|<style|animate|title|desc|CDATA|<!--|<img|onerror|evil/i)
      if (out) expect(out).toContain('<path')
    }
  })
  it('removes event handlers, style, scheme tricks and external url()', () => {
    const out = clean('<path d="M0 0" onclick="x()" style="fill:red" fill="url(http://evil/a)" stroke="jav&#x09;ascript:alert(1)" class="x" data-x="1"/>')
    expect(out).not.toMatch(/onclick|style=|http:\/\/evil|jav|class=|data-x/)
  })
  it('allows url(#id) and href to #id only', () => {
    const out = clean('<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs><path d="M0 0" fill="url(#g)"/>')
    expect(out).toContain('url(#g)')
    expect(clean('<linearGradient id="a" href="#b"/>')).toContain('href="#b"')
    expect(clean('<linearGradient id="a" href="http://x/y"/>')).not.toContain('http://x')
  })
  it('rejects text that is not an svg', () => {
    expect(sanitizeSvgString('<html><body/></html>')).toBeNull()
  })
})

describe('viewBox cannot break out of its attribute', () => {
  it('accepts numbers only', () => {
    expect(safeViewBox('0 0 24 24', 'x')).toBe('0 0 24 24')
    expect(safeViewBox('-1.5,0 24.5 1e2', 'x')).toBe('-1.5,0 24.5 1e2')
    expect(safeViewBox('0 0 1 1" onload="alert(1)', 'fallback')).toBe('fallback')
    expect(safeViewBox(null, 'fallback')).toBe('fallback')
  })
  it('themeSvg output never contains the injected attribute', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 1 1&quot; onload=&quot;alert(1)"><path d="M0 0h1v1z" fill="#111"/></svg>'
    const r = themeSvg(svg, { ns: 'x', colorMode: 'themeable', tokenNaming: DEFAULT_SETTINGS.tokenNaming, strokePolicy: 'constant', precision: 2, variableByHex: new Map() })
    expect(r.standalone).not.toContain('onload')
    expect(r.viewBox).toBe('0 0 24 24')
  })
})

describe('settings schema', () => {
  it('classifies every setting (compile-time) and shared keys exclude local state', () => {
    expect(Object.keys(SCHEMA).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort())
    for (const local of ['labs', 'labsBranchAck', 'sync', 'ignoredDuplicates', 'windowWidth', 'scanScope', 'usageOnly']) expect(SHARED_KEYS as string[]).not.toContain(local)
  })
  it('every default value passes its own check', () => {
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) expect(SCHEMA[k].check(DEFAULT_SETTINGS[k]), k).not.toBeUndefined()
  })
  it('a hostile config cannot put code into settings', () => {
    const evil = JSON.stringify({ strokePolicy: "';fetch('//evil')//", precision: 99, profile: 'x', namespace: 'ok', formats: { svg: false, react: 'yes', evil: true }, tokenNaming: { mode: 'rm -rf', prefix: 'ds' }, codeConnectUrl: 'javascript:alert(1)', labs: true, __proto__: { polluted: 1 } })
    const r = parseConfig(evil, DEFAULT_SETTINGS)
    expect(r.settings.strokePolicy).toBe('constant')
    expect(r.settings.precision).toBe(DEFAULT_SETTINGS.precision)
    expect(r.settings.profile).toBe(DEFAULT_SETTINGS.profile)
    expect(r.settings.formats.svg).toBe(false)
    expect(r.settings.formats.react).toBe(DEFAULT_SETTINGS.formats.react)
    expect((r.settings.formats as unknown as Record<string, unknown>).evil).toBeUndefined()
    expect(r.settings.tokenNaming.mode).toBe(DEFAULT_SETTINGS.tokenNaming.mode)
    expect(r.settings.tokenNaming.prefix).toBe('ds')
    expect(r.settings.codeConnectUrl).toBe('')
    expect(r.settings.labs).toBe(false) // local-only keys are never taken from a file
    expect(r.ignored).toEqual(expect.arrayContaining(['strokePolicy', 'precision', 'profile', 'labs']))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  it('generators never emit an unknown stroke policy even if settings are forced', () => {
    const fact: Facts = { paints: [], leafCount: 1, hasText: false, hasImage: false, hasGradient: false, hasEffects: false, hasHidden: false, hasLocked: false, emptyContainers: false, hasMask: false, hasBlend: false, hasOpacity: false, hasRotation: false, nonCenterStroke: false, dashedStroke: false, rootBackground: false, clipsContent: true, hasNestedInstance: false }
    const raw: RawIcon = { key: 'a', nodeId: '1:1', pageId: 'p', pageName: 'P', sourceKind: 'component', rawName: 'icon/Home', variantProps: {}, description: '', width: 24, height: 24, padding: null, facts: fact, svg: wrap('<path d="M0 0h1v1z" fill="#111"/>'), categoryCtx: {} }
    const settings = { ...DEFAULT_SETTINGS, strokePolicy: "';evil()//" as never, formats: { ...DEFAULT_SETTINGS.formats, webComponent: true } }
    const p = processIcons([raw], settings, {})
    const files = buildFiles({ allIcons: p.icons, settings, grid: p.grid, tier: p.tier, generatedAt: 'x' })
    for (const [path, text] of Object.entries(files)) expect(text, path).not.toContain('evil()')
  })
  it('migrates v1 settings and keeps the valid keys when one is bad', () => {
    const s = migrateSettings({ namespace: 'acme', zipName: 'icons', useTokens: false, precision: 'many', formats: { svg: false } })
    expect(s.namespace).toBe('acme')
    expect(s.zipName).toBe('')
    expect(s.tokenNaming.mode).toBe('none')
    expect(s.precision).toBe(DEFAULT_SETTINGS.precision)
    expect(s.formats.svg).toBe(false)
    expect(s.formats.sprite).toBe(DEFAULT_SETTINGS.formats.sprite)
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
})

import { zlibSync, strToU8 } from 'fflate'
import { decodeSnapshot, encodeSnapshot, makeSnapshot } from '../src/core/baseline'
import { parseCatalog } from '../src/core/changelog'

describe('data read from the file, the repo or the user is validated', () => {
  it('rejects a zip bomb in a baseline without hanging', () => {
    const bomb = Buffer.from(zlibSync(strToU8('x'.repeat(30_000_000)), { level: 9 })).toString('base64')
    expect(bomb.length).toBeLessThan(200_000)
    const t = Date.now()
    expect(decodeSnapshot(bomb)).toBeNull()
    expect(Date.now() - t).toBeLessThan(3000)
    expect(decodeSnapshot('A'.repeat(5_000_000))).toBeNull()
  })
  it('drops malformed baseline entries instead of throwing later', () => {
    const snap = makeSnapshot([{ name: 'ok', hash: 'h' }], { at: 'x' })
    ;(snap.icons as unknown[]).push(null, 42, { name: 7 }, { name: 'bad name!' })
    const back = decodeSnapshot(encodeSnapshot(snap))!
    expect(back.icons.map((i) => i.name)).toEqual(['ok'])
  })
  it('parseCatalog keeps only validated fields and slug names', () => {
    const c = parseCatalog(
      JSON.stringify({
        namespace: 'cmn',
        libraryVersion: '1.2.0',
        icons: [{ name: 'home', hash: 'abc123', category: ['nav'], figma: { componentKey: 'k', layerName: 'icon/Home' }, extra: '<script>' }, { name: 'x"><script>' }, { name: 'Bad Name' }],
        deprecated: [{ name: 'old', replacedBy: 'home', since: '1.0.0' }, { name: 'x"><script>', replacedBy: 'home', since: '1.0.0' }, { name: 'a', replacedBy: 'b', since: '<b>' }]
      })
    )
    expect(c.icons.map((i) => i.name)).toEqual(['home'])
    expect(c.deprecated).toEqual([{ name: 'old', replacedBy: 'home', since: '1.0.0' }])
    expect(JSON.stringify(c)).not.toContain('script')
    expect(() => parseCatalog('{"icons":[{"name":"X Y"}]}')).toThrow(/No valid icons/)
    expect(() => parseCatalog('[]')).toThrow()
  })
})

import { clampSize, validExternalUrl, validBaseline, validDevResources, validFixRequests, validSharedConfig } from '../src/main/guards'
import { serializeShared } from '../src/core/config'

describe('main-thread guards (the UI is untrusted input)', () => {
  it('dev resources: https only, real node ids, bounded', () => {
    const ok = { nodeId: '1:2', url: 'https://github.com/o/r/blob/main/icons.json#home', name: 'cmn: home' }
    const out = validDevResources([ok, { ...ok, url: 'http://x.y' }, { ...ok, url: 'javascript:alert(1)' }, { ...ok, nodeId: 'I1:2;3:4' }, { ...ok, url: 'https://a b' }, null, 'x'])
    expect(out).toEqual([ok])
    expect(validDevResources('nope')).toEqual([])
    expect(validDevResources(Array.from({ length: 5000 }, () => ok)).length).toBe(2000)
  })
  it('baseline: size cap and target allow-list', () => {
    expect(validBaseline('abc', 'local')).toBe(true)
    expect(validBaseline('abc', 'elsewhere')).toBe(false)
    expect(validBaseline('x'.repeat(2_000_001), 'shared')).toBe(false)
    expect(validBaseline('', 'local')).toBe(false)
  })
  it('published config must parse as a shared config', () => {
    expect(validSharedConfig(serializeShared(DEFAULT_SETTINGS, '2026-01-01T00:00:00Z'))).toBe(true)
    expect(validSharedConfig('{"v":2}')).toBe(false)
    expect(validSharedConfig('x'.repeat(300_000))).toBe(false)
  })
  it('fix requests: known actions, clamped numbers, trimmed strings', () => {
    const r = validFixRequests([
      { id: 'a', action: 'wrap-and-convert', gridWidth: 99999, gridHeight: 'x', leafName: 'V'.repeat(500), name: 'n\u0000ame', renameLeaves: 'yes' },
      { id: 'b', action: 'rm -rf' },
      { action: 'apply-name' }
    ])
    expect(r).toHaveLength(1)
    expect(r[0].gridWidth).toBe(512)
    expect(r[0].gridHeight).toBe(24)
    expect(r[0].leafName.length).toBe(100)
    expect(r[0].name).toBe('n ame')
    expect(r[0].renameLeaves).toBe(false)
  })
  it('window size is clamped', () => {
    expect(clampSize(10, 99999, { w: 360, h: 460 }, { w: 1000, h: 1100 })).toEqual({ w: 360, h: 1100 })
    expect(clampSize(NaN, undefined, { w: 360, h: 460 }, { w: 1000, h: 1100 })).toEqual({ w: 360, h: 460 })
  })
})

import { angularSnippet, htmlSnippet, reactSnippet, webComponentSnippet } from '../src/core/snippets'
describe('snippets escape layer-derived values', () => {
  const evil = { ns: 'cmn', name: 'home', spritePath: './s/', sizePx: null, sizeUnit: 'px' as const, vars: { '--cmn-icon-color': "red'};alert(1);//" }, color: 'x" onload="y', label: 'Say "hi" <b>' }
  it('html, react, angular and web component', () => {
    for (const out of [htmlSnippet(evil), reactSnippet(evil), angularSnippet(evil), webComponentSnippet(evil)]) {
      expect(out).not.toMatch(/"hi"|<b>|onload="y"/)
    }
    expect(reactSnippet(evil)).toContain("red\\'};alert(1);//")
  })
})

describe('opening links', () => {
  it('only https, one line, bounded', () => {
    expect(validExternalUrl('https://github.com/acme/icons/compare/main...icons/update?expand=1&title=T')).toBe(true)
    for (const bad of ['http://x.y', 'javascript:alert(1)', 'https://a b', 'https://x.y/"onclick', 'file:///etc/passwd', '', 5, 'https://x.y/' + 'a'.repeat(9000)]) expect(validExternalUrl(bad), String(bad).slice(0, 30)).toBe(false)
  })
})
