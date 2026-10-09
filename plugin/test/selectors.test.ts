import { describe, expect, it } from 'vitest'
import { ChangeKind } from '../src/core/baseline'
import { countChanges, filterIcons, groupIssues, isAlert, isBlocked, presentChangeKinds } from '../src/ui/selectors'
import { Finding, Icon } from '../src/types'

const icon = (name: string, findings: Partial<Finding>[] = [], extra: Partial<Icon> = {}): Icon =>
  ({ key: name, name, layerName: 'icon/' + name, categoryLabel: 'Nav', category: ['nav'], tags: ['tag'], findings: findings.map((f) => ({ ruleId: 'r', severity: 'info', message: '', ...f })), ...extra }) as unknown as Icon

describe('issue grouping', () => {
  it('counts an icon once per rule, escalates severity, and sorts worst first', () => {
    const a = icon('a', [{ ruleId: 'x', severity: 'warn' }, { ruleId: 'x', severity: 'warn' }, { ruleId: 'y', severity: 'info' }])
    const b = icon('b', [{ ruleId: 'x', severity: 'error' }])
    const c = icon('c', [{ ruleId: 'y', severity: 'info' }, { ruleId: 'y', severity: 'info', formats: ['svg'] }])
    const g = groupIssues([a, b, c])
    expect(g.map((x) => x.ruleId)).toEqual(['x', 'y'])
    expect(g[0].severity).toBe('error')
    expect(g[0].icons).toEqual([a, b])
    expect(g[1].icons).toEqual([a, c])
    expect(g[1].formats).toEqual(['svg'])
  })
  it('blocked vs alerts are mutually exclusive', () => {
    const e = icon('e', [{ severity: 'error' }, { severity: 'warn' }])
    const w = icon('w', [{ severity: 'warn' }])
    expect([isBlocked(e), isAlert(e), isBlocked(w), isAlert(w)]).toEqual([true, false, false, true])
  })
})

describe('icon filtering', () => {
  const icons = [icon('home', [], { tags: ['house'] }), icon('search', [{ ruleId: 'x', severity: 'error' }], { category: ['tools'], categoryLabel: 'Tools' }), icon('plus', [{ severity: 'warn' }])]
  const none = new Map<string, Set<ChangeKind>>()
  const base = { status: 'all' as const, ruleId: null, category: '', change: null, query: '' }
  it('by status, rule, category, text (name, layer, category label, tags)', () => {
    expect(filterIcons(icons, { ...base, status: 'blocked' }, new Set(), none).map((i) => i.name)).toEqual(['search'])
    expect(filterIcons(icons, { ...base, status: 'alerts' }, new Set(), none).map((i) => i.name)).toEqual(['plus'])
    expect(filterIcons(icons, { ...base, ruleId: 'x' }, new Set(), none).map((i) => i.name)).toEqual(['search'])
    expect(filterIcons(icons, { ...base, category: 'tools' }, new Set(), none).map((i) => i.name)).toEqual(['search'])
    expect(filterIcons(icons, { ...base, query: ' HOUSE ' }, new Set(), none).map((i) => i.name)).toEqual(['home'])
    expect(filterIcons(icons, { ...base, status: 'excluded' }, new Set(['plus']), none).map((i) => i.name)).toEqual(['plus'])
  })
  it('by change since the baseline', () => {
    const changes = new Map<string, Set<ChangeKind>>([['home', new Set<ChangeKind>(['added'])], ['plus', new Set<ChangeKind>(['changed', 'added'])]])
    expect(filterIcons(icons, { ...base, change: 'added' }, new Set(), changes).map((i) => i.name)).toEqual(['home', 'plus'])
    expect(filterIcons(icons, { ...base, change: 'changed' }, new Set(), changes).map((i) => i.name)).toEqual(['plus'])
    const counts = countChanges(changes)
    expect(counts).toEqual({ added: 2, changed: 1 })
    expect(presentChangeKinds(counts)).toEqual(['added', 'changed'])
  })
})
