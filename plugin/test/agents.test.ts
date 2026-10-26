import { describe, expect, it } from 'vitest'
import { buildFiles } from '../src/core/generators'
import { processIcons } from '../src/core/process'
import { emptyFacts } from '../src/main/facts'
import { DEFAULT_SETTINGS, RawIcon, Settings } from '../src/types'

const raw = (name: string): RawIcon => ({
  key: name, nodeId: '1:' + name, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: name, variantProps: {}, description: 'home, house',
  width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: { ...emptyFacts(), leafCount: 1 },
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 2h20v20H2z" fill="#112233"/></svg>', categoryCtx: {}
})
const off = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.formats).map((k) => [k, false])) as Settings['formats']

function agents(over: Partial<Settings>, on: Partial<Settings['formats']> = {}): string {
  const s: Settings = { ...DEFAULT_SETTINGS, namespace: 'cmn', ...over, formats: { ...off, ...on } }
  const p = processIcons([raw('nav/Home'), raw('nav/Search')], s, {})
  return buildFiles({ allIcons: p.icons, settings: s, grid: p.grid, tier: p.tier, generatedAt: '2026-01-01' })['AGENTS.md']
}

describe('AGENTS.md', () => {
  it('lists only the packages that were exported, each with a usage line using a real icon name', () => {
    const text = agents({}, { react: true, vue: true, svelte: true })
    expect(text).toContain('| React 17+ | `react/` |')
    expect(text).toContain('| Vue 3 | `vue/` |')
    expect(text).toContain('| Svelte 4 and 5 | `svelte/` |')
    expect(text).not.toContain('`angular/`')
    expect(text).not.toContain('web-component/')
    expect(text).toMatch(/<CmnIcon name="(home|search)" size=\{24\} \/>/)
  })

  it('says so when no code package was exported', () => {
    expect(agents({}, { svg: false })).toContain('No code package was exported')
  })

  it('has recipes for using, adding, renaming and debugging an icon, and says generated files are never edited by hand', () => {
    const text = agents({}, { react: true })
    for (const h of ['### Use an icon that exists', '### Add a new icon', '### Rename or remove an icon', '### Fix an icon that does not show']) expect(text, h).toContain(h)
    expect(text).toContain('never edit them by hand')
    expect(text).toContain('named `<category>/<name>`')
    expect(text).toContain('`--cmn-icon-size`')
  })

  it('states the naming rules this library was exported with', () => {
    const text = agents({ duplicateNames: 'category', ignoreSegments: ['icon', 'icons'], ignoreVariantValues: ['Default'], categorySource: 'section', colorMode: 'original' }, { react: true })
    expect(text).toContain('the category is put in front of the name')
    expect(text).toContain('Category folders left out of names: `icon`, `icons`')
    expect(text).toContain('Variant values left out of names: `Default`')
    expect(text).toContain('Figma section')
    expect(text).toContain('fixed as drawn in Figma (not themeable)')
    expect(agents({ duplicateNames: 'block' }, { react: true })).toContain('the export stops until one is renamed')
  })

  it('mentions the import path and the npm packages when they are set', () => {
    const text = agents({ importPath: '@/icons', npm: { enabled: true, scope: '', license: 'MIT', stories: false } }, { react: true })
    expect(text).toContain('Components are imported from `@/icons`')
    expect(text).toContain('can be published to npm')
    expect(agents({ importPath: '' }, { react: true })).not.toContain('Components are imported from')
  })
})
