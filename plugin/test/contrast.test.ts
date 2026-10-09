import { describe, expect, it } from 'vitest'
import { autoTile, contrastRatio, luminance } from '../src/core/contrast'
import { plural } from '../src/ui/util'

describe('contrast', () => {
  it('reads hex colours', () => {
    expect(luminance('#fff')).toBeCloseTo(1)
    expect(luminance('#000000')).toBe(0)
    expect(luminance('red')).toBeNull()
  })
  it('computes the WCAG ratio', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21)
    expect(contrastRatio('#fff', 'nope')).toBeNull()
  })
  it('picks a dark tile only when every colour would vanish on white', () => {
    expect(autoTile([{ hex: '#ffffff' }])).toBe('dark')
    expect(autoTile([{ hex: '#ffffff' }, { hex: '#1e1e1e' }])).toBe('light')
    expect(autoTile([{ hex: '#0d99ff' }])).toBe('light')
    expect(autoTile([])).toBe('light')
  })
})

describe('plural', () => {
  it('inflects with the count', () => {
    expect(plural(1, 'icon')).toBe('1 icon')
    expect(plural(2, 'icon')).toBe('2 icons')
    expect(plural(2, 'category')).toBe('2 categories')
    expect(plural(0, 'match')).toBe('0 matches')
  })
})

import { readFileSync } from 'fs'
import { join } from 'path'
import { processIcons } from '../src/core/process'
import { DEFAULT_SETTINGS, Facts, RawIcon } from '../src/types'
import { emptyFacts } from '../src/main/facts'

describe('theme-contrast rule', () => {
  const svg = readFileSync(join(__dirname, 'fixtures', 'multicolor.svg'), 'utf8')
  const icon = (paints: Facts['paints']): RawIcon => ({
    key: 'k', nodeId: '1:1', pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: 'icon/Pie', variantProps: {}, description: '', width: 24, height: 24,
    padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: { ...emptyFacts(), paints }, svg, categoryCtx: {}
  })
  const finding = (paints: Facts['paints']) => processIcons([icon(paints)], { ...DEFAULT_SETTINGS, profile: 'standard' }, {}).icons[0].findings.find((f) => f.ruleId === 'theme-contrast')

  it('flags a fixed colour that fades on a dark page', () => {
    const f = finding([{ role: 'fill', hex: '#222222', opacity: 1 }, { role: 'fill', hex: '#0d99ff', opacity: 1 }])
    expect(f?.message).toContain('#222222 on dark')
  })
  it('flags a fixed light colour on a light page', () => {
    expect(finding([{ role: 'fill', hex: '#f5f5f5', opacity: 1 }])?.message).toContain('on light')
  })
  it('does not flag colours bound to variables', () => {
    expect(finding([{ role: 'fill', hex: '#222222', opacity: 1, variable: 'color/icon/primary' }])).toBeUndefined()
  })
  it('does not flag colours that work on both', () => {
    expect(finding([{ role: 'fill', hex: '#d32f2f', opacity: 1 }])).toBeUndefined()
  })
})
