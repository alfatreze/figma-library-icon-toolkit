import { describe, expect, it } from 'vitest'
import { buildHealth, healthHtml, healthMarkdown, HealthInput, MAX_BLOCKERS } from '../src/core/report'
import { Diff } from '../src/core/changelog'
import { Icon } from '../src/types'

const f = (ruleId: string, severity: 'error' | 'warn' | 'info', message = ruleId) => ({ ruleId, severity, message })
const icon = (name: string, findings: ReturnType<typeof f>[] = [], over: Partial<Icon> = {}): Icon =>
  ({ name, layerName: name, pageName: 'Icons', nodeId: `1:${name.length}${name}`.slice(0, 8), sourceKind: 'component', description: '', findings, fixes: [], ...over }) as unknown as Icon

const grid = { width: 16, height: 16, count: 4, total: 4, padding: 0, detected: true }
const input = (icons: Icon[], over: Partial<HealthInput> = {}): HealthInput => ({ title: 'gitl', generatedAt: '2026-10-10', icons, tier: 'T4', grid, profile: 'standard', diff: null, baseline: null, skipped: 0, ...over })

const library = [
  icon('clean', [], { description: 'tidy, neat' }),
  icon('noted', [f('unbound-color', 'info'), f('no-description', 'info')]),
  icon('warned', [f('off-grid', 'warn', 'Size 12×12 differs from library size 16×16.')]),
  icon('blocked', [f('auto-name', 'error', 'Layer still has a default Figma name.'), f('unbound-color', 'info')], { fixes: [{ kind: 'auto-name', actions: ['apply-name'], confidence: 'high' } as never] })
]

describe('health report numbers', () => {
  const r = buildHealth(input(library))
  it('splits the icons into blocked, warned, noted and ready', () => {
    expect(r.totals).toMatchObject({ icons: 4, blocked: 1, warned: 1, noted: 1, ready: 2, readyPct: 50 })
  })
  it('scores every area of the library and flags the ones that block or need attention', () => {
    expect(r.areas).toHaveLength(8)
    const names = r.areas.find((a) => a.step === 2)!
    expect(names).toMatchObject({ errors: 1, status: 'blocked' })
    expect(r.areas.find((a) => a.step === 3)).toMatchObject({ warnings: 1, status: 'attention' })
    expect(r.areas.find((a) => a.step === 1)).toMatchObject({ icons: 0, status: 'ok' })
    expect(r.areas.find((a) => a.step === 7)).toMatchObject({ errors: 0, warnings: 0, notes: 2, status: 'notes' }) // colours not bound: a note, shown as such, not as healthy
  })
  it('measures coverage', () => {
    expect(r.coverage.components).toBe(100)
    expect(r.coverage.descriptions).toBe(25)
    expect(r.coverage.boundColours).toBe(50)
  })
  it('lists the most common issues, worst first, with how many have an automatic fix', () => {
    expect(r.rules[0]).toMatchObject({ ruleId: 'auto-name', severity: 'error', icons: 1 })
    expect(r.rules.map((x) => x.severity)).toEqual(['error', 'warn', 'info', 'info'])
    expect(r.rules.find((x) => x.ruleId === 'unbound-color')).toMatchObject({ icons: 2 })
    expect(r.autoFixable).toBe(1)
  })
  it('names what blocks the export', () => {
    expect(r.blockers).toEqual([{ name: 'blocked', page: 'Icons', nodeId: expect.any(String), messages: ['Layer still has a default Figma name.'] }])
  })
  it('an empty library is not a division by zero', () => {
    const e = buildHealth(input([]))
    expect(e.totals).toMatchObject({ icons: 0, readyPct: 100 })
    expect(e.coverage.descriptions).toBe(100)
  })
  it('caps the list of blocked icons', () => {
    const many = Array.from({ length: MAX_BLOCKERS + 20 }, (_, i) => icon(`b${i}`, [f('auto-name', 'error')]))
    const big = buildHealth(input(many))
    expect(big.blockers).toHaveLength(MAX_BLOCKERS)
    expect(big.totals.blocked).toBe(MAX_BLOCKERS + 20)
    expect(healthMarkdown(big)).toContain('…and 20 more.')
  })
})

describe('changes since the baseline', () => {
  const diff = { added: [{}, {}], removed: [{}], renamed: [], changed: [{}], recoloured: [], relabelled: [], moved: [], unchanged: 5, bump: 'major', matchedBy: { key: 5, name: 0 } } as unknown as Diff
  it('are summarised, and a removal is called breaking', () => {
    const r = buildHealth(input(library, { diff, baseline: 'This computer' }))
    expect(r.changes).toMatchObject({ added: 2, removed: 1, changed: 1, unchanged: 5, bump: 'major', breaking: true })
    expect(healthMarkdown(r)).toContain('**Breaking:**')
  })
  it('say so when there is no baseline', () => {
    expect(buildHealth(input(library)).changes).toBeNull()
    expect(healthMarkdown(buildHealth(input(library)))).toContain('No baseline was selected')
  })
})

describe('rendering', () => {
  const r = buildHealth(input(library, { title: 'gitl' }))
  it('Markdown has the sections a manager looks for', () => {
    const md = healthMarkdown(r)
    for (const h of ['# gitl icon library: health report', '## Coverage', '## By area', '## Most common issues', '## Blocked icons (1)']) expect(md).toContain(h)
    expect(md).toContain('**Library health: good**')
  })
  it('HTML is one self-contained page: no scripts, no external resources', () => {
    const html = healthHtml(r)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toMatch(/<script|<link|src=|@import|https?:\/\//)
    expect(html).toContain('Library health: good')
    expect(html).toContain('prefers-color-scheme:dark')
  })
  it('escapes layer names, so a hostile name cannot inject markup or break a table', () => {
    const evil = buildHealth(input([icon('<img src=x onerror=alert(1)>|x', [f('auto-name', 'error', '<b>bad</b>')], { layerName: '<img src=x onerror=alert(1)>|x', pageName: 'P"age' })], { title: '<script>x</script>' }))
    const html = healthHtml(evil)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;img src=x')
    const md = healthMarkdown(evil)
    expect(md).not.toContain('<img')
    expect(md.split('\n').filter((l) => l.startsWith('| &lt;img')).every((l) => l.split('|').length === 6)).toBe(true)
  })
})
