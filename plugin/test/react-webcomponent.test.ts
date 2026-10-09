import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildFiles, Files } from '../src/core/generators'
import { processIcons } from '../src/core/process'
import { emptyFacts } from '../src/main/facts'
import { DEFAULT_SETTINGS, RawIcon, Settings } from '../src/types'

/** The generated React and Web Component packages, pinned file by file (update the snapshot in the same commit as an intended change). */
const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const raw = (name: string, svg: string): RawIcon => ({
  key: name, nodeId: '1:' + name, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: name, variantProps: {}, description: '',
  width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: emptyFacts(), svg, categoryCtx: {}
})
const none = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.formats).map((k) => [k, false])) as Settings['formats']

function generated(only: 'react' | 'webComponent', dir: string, settings: Partial<Settings>): Files {
  const s: Settings = { ...DEFAULT_SETTINGS, namespace: 'cmn', ...settings, formats: { ...none, [only]: true } }
  const processed = processIcons([raw('nav/Home', fx('stroked.svg')), raw('nav/Pie', fx('multicolor.svg')), raw('arrows/Bars', fx('bars-multipath.svg'))], s, {})
  const all = buildFiles({ allIcons: processed.icons, settings: s, grid: processed.grid, tier: processed.tier, generatedAt: '2026-01-01' })
  return Object.fromEntries(Object.entries(all).filter(([p]) => p.startsWith(dir + '/')).sort(([a], [b]) => a.localeCompare(b)))
}

const cases: [string, Partial<Settings>][] = [
  ['default settings', {}],
  ['weight-by-size stroke policy and category split', { strokePolicy: 'table', splitByCategory: true }],
  ['another namespace and original colours', { namespace: 'acme', colorMode: 'original' }]
]

for (const [only, dir, label] of [['react', 'react', 'React'], ['webComponent', 'web-component', 'Web Component']] as const) {
  describe(`generated ${label} package`, () => {
    for (const [name, settings] of cases) {
      it(`stays the same: ${name}`, () => {
        const files = generated(only, dir, settings)
        expect(Object.keys(files).length).toBeGreaterThan(2)
        expect(files).toMatchSnapshot()
      })
    }
  })
}

describe('React and Web Component share the CSS variable contract', () => {
  it('both expose size, colour and stroke width through the same variables', () => {
    const react = Object.values(generated('react', 'react', {})).join('\n')
    const wc = Object.values(generated('webComponent', 'web-component', {})).join('\n')
    for (const v of ['--cmn-icon-size', '--cmn-icon-color', '--cmn-icon-stroke-width']) {
      expect(react, `react ${v}`).toContain(v)
      expect(wc, `web component ${v}`).toContain(v)
    }
  })
})
