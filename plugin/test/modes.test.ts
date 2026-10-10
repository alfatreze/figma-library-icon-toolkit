import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { processIcons } from '../src/core/process'
import { emptyFacts } from '../src/main/facts'
import { DEFAULT_SETTINGS, RawIcon } from '../src/types'

const svg = readFileSync(join(__dirname, 'fixtures', 'stroked.svg'), 'utf8')
const raw = (paints: RawIcon['facts']['paints']): RawIcon => ({
  key: 'k', nodeId: '1:1', pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: 'icon/Home', variantProps: {}, description: '', width: 24, height: 24,
  padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: { ...emptyFacts(), paints }, svg, categoryCtx: {}
})

describe('colour slots carry the variable modes', () => {
  it('a bound colour keeps its value per mode (Light / Dark)', () => {
    const p = processIcons([raw([{ role: 'stroke', hex: '#1f1d1d', opacity: 1, variable: 'color/icon/primary', collection: 'Semantic', modes: { Light: '#1f1d1d', Dark: '#ffffff' } }])], DEFAULT_SETTINGS, {})
    expect(p.icons[0].slots[0]).toMatchObject({ variable: 'color/icon/primary', modes: { Light: '#1f1d1d', Dark: '#ffffff' } })
  })
  it('a colour without a variable, or with a single-mode variable, has no modes', () => {
    const p = processIcons([raw([{ role: 'stroke', hex: '#1f1d1d', opacity: 1 }])], DEFAULT_SETTINGS, {})
    expect('modes' in p.icons[0].slots[0]).toBe(false)
  })
})

import { buildFiles } from '../src/core/generators'
describe('HTML preview page', () => {
  const build = (paints: RawIcon['facts']['paints']) => {
    const p = processIcons([{ ...raw(paints), facts: { ...emptyFacts(), leafCount: 1, paints } }], DEFAULT_SETTINGS, {})
    return buildFiles({ allIcons: p.icons, settings: DEFAULT_SETTINGS, grid: p.grid, tier: p.tier, generatedAt: '2026-10-10' })['html/index.html']
  }
  it('has a Mode switch and carries the mode colours when a variable has modes', () => {
    const html = build([{ role: 'stroke', hex: '#1f1d1d', opacity: 1, variable: 'color/icon/primary', collection: 'Semantic', modes: { Light: '#1f1d1d', Dark: '#ffd54a' } }])
    expect(html).toContain('id="mode"')
    expect(html).toContain('"modes":{"Light":"#1f1d1d","Dark":"#ffd54a"}')
  })
  it('the switch stays hidden by the page script when no icon has modes (data has none)', () => {
    expect(build([])).not.toContain('"modes":{')
  })
})
