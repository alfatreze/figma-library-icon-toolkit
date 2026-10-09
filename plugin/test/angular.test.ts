import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildFiles, Files } from '../src/core/generators'
import { processIcons } from '../src/core/process'
import { emptyFacts } from '../src/main/facts'
import { DEFAULT_SETTINGS, RawIcon, Settings } from '../src/types'

/**
 * The generated Angular packages are pinned file by file. Both flavours (modern: signals, 17.1+; classic: @Input, 14+) are written
 * from shared pieces; any change to the generated text must show up here on purpose (update the snapshot in the same commit).
 */
const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const raw = (name: string, svg: string): RawIcon => ({
  key: name, nodeId: '1:' + name, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: name, variantProps: {}, description: '',
  width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: emptyFacts(), svg, categoryCtx: {}
})
const none = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.formats).map((k) => [k, false])) as Settings['formats']

function angular(settings: Partial<Settings>, spriteStrategy?: boolean): Files {
  const s: Settings = { ...DEFAULT_SETTINGS, namespace: 'cmn', ...settings }
  const processed = processIcons(
    [raw('nav/Home', fx('stroked.svg')), raw('nav/Pie', fx('multicolor.svg')), raw('arrows/Bars', fx('bars-multipath.svg'))],
    s,
    {}
  )
  const all = buildFiles({ allIcons: processed.icons, settings: s, grid: processed.grid, tier: processed.tier, generatedAt: '2026-01-01', spriteStrategy })
  return Object.fromEntries(Object.entries(all).filter(([p]) => p.startsWith('angular/') || p.startsWith('angular-classic/')).sort(([a], [b]) => a.localeCompare(b)))
}

const both = { ...none, angularModern: true, angularClassic: true }
const cases: [string, Partial<Settings>, boolean?][] = [
  ['with the sprite package', { formats: { ...both, sprite: true } }],
  ['without the sprite package', { formats: both }],
  ['sprite strategy supplied by another output', { formats: both }, true],
  ['weight-by-size stroke policy and category split', { formats: { ...both, sprite: true }, strokePolicy: 'table', splitByCategory: true }]
]

describe('generated Angular packages', () => {
  for (const [name, settings, strategy] of cases) {
    it(`stay the same: ${name}`, () => {
      const files = angular(settings, strategy)
      expect(Object.keys(files).length).toBeGreaterThan(10)
      expect(files).toMatchSnapshot()
    })
  }
  it('both flavours share the same selector, inputs and CSS variables', () => {
    const files = angular({ formats: { ...both, sprite: true } })
    for (const dir of ['angular', 'angular-classic']) {
      const c = files[`${dir}/cmn-icon.component.ts`]
      expect(c).toContain("selector: 'cmn-icon'")
      for (const v of ['--cmn-icon-size', '--cmn-icon-color', '--cmn-icon-stroke-width']) expect(c, `${dir} ${v}`).toContain(v)
    }
    expect(files['angular/cmn-icon.component.ts']).toContain('input<')
    expect(files['angular-classic/cmn-icon.component.ts']).toContain('@Input()')
  })
})
