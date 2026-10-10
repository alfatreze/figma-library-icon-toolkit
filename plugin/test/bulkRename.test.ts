import { beforeEach, describe, expect, it } from 'vitest'
import { applyCase, NO_RULES, patternCheck, planRename, regexProblem, renameOne, renamable, RenameRules } from '../src/core/bulkRename'
import { validRenames } from '../src/main/guards'
import { applyRenames } from '../src/main/rename'
import { Icon } from '../src/types'
import { FakeFigma, FakeNode, installFigma, makeComponent } from './helpers/fakeFigma'

const r = (over: Partial<RenameRules>): RenameRules => ({ ...NO_RULES, ...over })
const icon = (nodeId: string, layerName: string, over: Partial<Icon> = {}): Icon => ({ nodeId, layerName, sourceKind: 'component', variantProps: {}, ...over }) as unknown as Icon

describe('case styles', () => {
  it('converts between styles, folding accents', () => {
    expect(applyCase('Arrow Left', 'kebab')).toBe('arrow-left')
    expect(applyCase('arrowLeft', 'kebab')).toBe('arrow-left')
    expect(applyCase('Deficiência visual', 'kebab')).toBe('deficiencia-visual')
    expect(applyCase('arrow-left', 'snake')).toBe('arrow_left')
    expect(applyCase('arrow-left', 'camel')).toBe('arrowLeft')
    expect(applyCase('arrow-left', 'pascal')).toBe('ArrowLeft')
    expect(applyCase('arrow-left', 'title')).toBe('Arrow Left')
    expect(applyCase('Arrow', 'upper')).toBe('ARROW')
    expect(applyCase('Arrow', 'none')).toBe('Arrow')
  })
})

describe('renameOne', () => {
  it('changes only the last segment unless the whole name is asked for', () => {
    expect(renameOne('Arrows/Left Arrow', r({ caseStyle: 'kebab' }))).toBe('Arrows/left-arrow')
    expect(renameOne('Arrows/Left Arrow', r({ caseStyle: 'kebab', wholeName: true }))).toBe('arrows-left-arrow')
  })
  it('finds and replaces as plain text (including characters that mean something in a pattern) or as a regular expression', () => {
    expect(renameOne('icon (copy)', r({ find: ' (copy)' }))).toBe('icon')
    expect(renameOne('a.b', r({ find: '.', replace: '-' }))).toBe('a-b')
    expect(renameOne('cost $5', r({ find: '$5', replace: '$$' }))).toBe('cost $$')
    expect(renameOne('home-old', r({ find: '(\\w+)-old', replace: '$1-new', regex: true }))).toBe('home-new')
    expect(renameOne('Home', r({ find: 'home', replace: 'x', caseSensitive: true }))).toBe('Home')
    expect(renameOne('Home', r({ find: 'home', replace: 'x' }))).toBe('x')
  })
  it('removes and adds prefixes and suffixes, adding last so a case style does not rewrite them', () => {
    expect(renameOne('icon-Home-copy', r({ removePrefix: 'icon-', removeSuffix: '-copy' }))).toBe('Home')
    expect(renameOne('Home Page', r({ caseStyle: 'kebab', addPrefix: 'Nav_', addSuffix: '_FILLED' }))).toBe('Nav_home-page_FILLED')
  })
  it('strips control characters', () => {
    expect(renameOne('a\u0007b', r({ addSuffix: '' }))).toBe('a b')
  })
})

describe('regular expressions are checked, never trusted', () => {
  it('reports an invalid, an over-long or a catastrophic pattern instead of running it', () => {
    expect(regexProblem(r({ regex: true, find: '(' }))).toMatch(/not a valid/)
    expect(regexProblem(r({ regex: true, find: 'a'.repeat(300) }))).toMatch(/longer/)
    expect(regexProblem(r({ regex: true, find: '(a+)+$' }))).toMatch(/very long/)
    expect(regexProblem(r({ regex: true, find: '^icon-' }))).toBeNull()
    expect(renameOne('aaaa!', r({ regex: true, find: '(a+)+$', replace: 'x' }))).toBe('aaaa!') // not run
  })
})

describe('planning a rename', () => {
  const all = [icon('1:1', 'Arrow Left'), icon('1:2', 'arrow-right'), icon('1:3', 'Arrow Up'), icon('1:4', 'v', { setName: 'Set', variantProps: { Size: '16' } }), icon('1:5', 'inst', { sourceKind: 'instance' })]
  it('splits what changes from what stays, and skips variants and instances', () => {
    const p = planRename(all, all, r({ caseStyle: 'kebab' }))
    expect(p.changes.map((c) => `${c.from}→${c.to}`)).toEqual(['Arrow Left→arrow-left', 'Arrow Up→arrow-up'])
    expect(p.unchanged).toBe(1)
    expect(p.skipped).toBe(2)
    expect(renamable(all[3])).toBe(false)
  })
  it('blocks a new name that two layers would share, or that another layer already has', () => {
    const list = [icon('1:1', 'Home'), icon('1:2', 'home '), icon('1:3', 'Search'), icon('1:4', 'find')]
    const p = planRename(list, list, r({ caseStyle: 'kebab' }))
    expect(p.blocked.map((b) => `${b.from}:${b.problem}`)).toEqual(['Home:duplicate', 'home :duplicate'])
    expect(p.changes.map((c) => c.to)).toEqual(['search'])
    const taken = planRename([list[2]], [...list], r({ find: 'Search', replace: 'find' }))
    expect(taken.blocked[0]).toMatchObject({ problem: 'taken' })
  })
  it('a rename that frees a name another layer wants is allowed (swap through the plan, not through the file)', () => {
    const list = [icon('1:1', 'a'), icon('1:2', 'b')]
    const p = planRename([list[0]], list, r({ find: 'a', replace: 'c' }))
    expect(p.changes).toHaveLength(1)
  })
  it('blocks an empty name', () => {
    const list = [icon('1:1', 'x')]
    expect(planRename(list, list, r({ find: 'x', replace: '' })).blocked[0].problem).toBe('empty')
  })
  it('checks the naming pattern', () => {
    expect(patternCheck(all, 'kebab')).toEqual({ total: 3, off: 2 })
  })
})

describe('writing renames', () => {
  let fig: FakeFigma
  beforeEach(() => {
    fig = installFigma()
  })
  it('renames a layer that still has the scanned name, and leaves one that was renamed since', async () => {
    const a = makeComponent(fig, 'Old A')
    const b = makeComponent(fig, 'Old B')
    b.name = 'Designer changed it'
    const res = await applyRenames([{ nodeId: a.id, from: 'Old A', to: 'new-a' }, { nodeId: b.id, from: 'Old B', to: 'new-b' }])
    expect(res).toMatchObject({ ok: 1, skipped: 1, failed: 0 })
    expect(a.name).toBe('new-a')
    expect(b.name).toBe('Designer changed it')
  })
  it('never renames variants, instances or layers inside an instance', async () => {
    const set = new FakeNode('COMPONENT_SET', 'Set')
    const variant = new FakeNode('COMPONENT', 'Size=16')
    set.appendChild(variant)
    fig.page.appendChild(set)
    fig.nodes.set(variant.id, variant)
    const inst = new FakeNode('INSTANCE', 'inst')
    const inner = new FakeNode('FRAME', 'inner')
    inst.appendChild(inner)
    fig.page.appendChild(inst)
    fig.nodes.set(inst.id, inst)
    fig.nodes.set(inner.id, inner)
    const res = await applyRenames([{ nodeId: variant.id, from: 'Size=16', to: 'x' }, { nodeId: inst.id, from: 'inst', to: 'y' }, { nodeId: inner.id, from: 'inner', to: 'z' }])
    expect(res).toMatchObject({ ok: 0, skipped: 3 })
    expect(variant.name).toBe('Size=16')
  })
  it('counts missing nodes as failed and keeps going', async () => {
    const a = makeComponent(fig, 'A')
    const res = await applyRenames([{ nodeId: '9:9', from: 'x', to: 'y' }, { nodeId: a.id, from: 'A', to: 'a' }])
    expect(res).toMatchObject({ ok: 1, failed: 1 })
  })
  it('the guard drops malformed or empty renames', () => {
    expect(validRenames([{ nodeId: '1:1', from: 'a', to: ' b ' }, { nodeId: 'x', from: 'a', to: 'b' }, { nodeId: '1:2', from: 'a', to: '  ' }, null])).toEqual([{ nodeId: '1:1', from: 'a', to: 'b' }])
    expect(validRenames('nope')).toEqual([])
  })
})
