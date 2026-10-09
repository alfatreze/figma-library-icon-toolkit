import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../src/core/changelog'
import { buildFiles } from '../src/core/generators'
import { processIcons } from '../src/core/process'
import { emptyFacts } from '../src/main/facts'
import { DEFAULT_SETTINGS, RawIcon } from '../src/types'

const raw = (name: string): RawIcon => ({
  key: name, nodeId: '1:' + name, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: name, variantProps: {}, description: '',
  width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: emptyFacts(), svg: readFileSync(join(__dirname, 'fixtures', 'stroked.svg'), 'utf8'), categoryCtx: {}
})
const build = (partial?: boolean) => {
  const p = processIcons([raw('icon/Home')], DEFAULT_SETTINGS, {})
  return buildFiles({ allIcons: p.icons, settings: DEFAULT_SETTINGS, grid: p.grid, tier: p.tier, generatedAt: '2026-01-01', partial })
}

describe('partial export (a Dev Mode selection)', () => {
  it('is marked in icons.json and the README', () => {
    const files = build(true)
    expect(JSON.parse(files['icons.json']).partial).toBe(true)
    expect(files['README.md']).toContain('**Partial export:**')
  })
  it('a full export carries neither mark', () => {
    const files = build()
    expect('partial' in JSON.parse(files['icons.json'])).toBe(false)
    expect(files['README.md']).not.toContain('Partial export')
  })
  it('is recognised when read back, so it can be refused as a baseline', () => {
    expect(parseCatalog(build(true)['icons.json']).partial).toBe(true)
    expect(parseCatalog(build()['icons.json']).partial).toBeUndefined()
  })
})
