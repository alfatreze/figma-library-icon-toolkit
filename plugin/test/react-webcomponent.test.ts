import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { buildFiles, Files } from '../src/core/generators'
import { processIcons } from '../src/core/process'
import { emptyFacts } from '../src/main/facts'
import { DEFAULT_SETTINGS, RawIcon, Settings } from '../src/types'

/** The generated React, Vue, Svelte and Web Component packages, pinned file by file (update the snapshot in the same commit as an intended change). */
const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf8')
const raw = (name: string, svg: string): RawIcon => ({
  key: name, nodeId: '1:' + name, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: name, variantProps: {}, description: '',
  width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: { ...emptyFacts(), leafCount: 1 }, svg, categoryCtx: {}
})
const none = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.formats).map((k) => [k, false])) as Settings['formats']

function generated(only: 'react' | 'vue' | 'svelte' | 'webComponent', dir: string, settings: Partial<Settings>): Files {
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

for (const [only, dir, label] of [['react', 'react', 'React'], ['vue', 'vue', 'Vue'], ['svelte', 'svelte', 'Svelte'], ['webComponent', 'web-component', 'Web Component']] as const) {
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

describe('every component package shares the CSS variable contract', () => {
  it('React, Vue, Svelte and the Web Component expose size, colour and stroke width through the same variables', () => {
    for (const [only, dir] of [['react', 'react'], ['vue', 'vue'], ['svelte', 'svelte'], ['webComponent', 'web-component']] as const) {
      const text = Object.values(generated(only, dir, {})).join('\n')
      for (const v of ['--cmn-icon-size', '--cmn-icon-color', '--cmn-icon-stroke-width']) expect(text, `${only} ${v}`).toContain(v)
    }
  })
  it('Vue and Svelte import types as types (they compile under verbatimModuleSyntax) and look icons up through the shared data', () => {
    for (const [only, dir] of [['vue', 'vue'], ['svelte', 'svelte']] as const) {
      const files = generated(only, dir, {})
      expect(files[`${dir}/cmn-icon-registry.ts`]).toContain("import type { CmnIconData } from './icon-data'")
      expect(files[`${dir}/index.ts`]).toContain('CmnIcon')
      expect(Object.keys(files).filter((p) => p.startsWith(`${dir}/icons/`))).toHaveLength(4) // three icons and the barrel
      expect(Object.keys(files).some((p) => p.startsWith(`${dir}/categories/`))).toBe(true)
    }
    expect(generated('svelte', 'svelte', {})['svelte/cmn-icon.svelte']).toContain('$$restProps')
  })
})
