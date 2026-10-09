import { beforeEach, describe, expect, it } from 'vitest'
import { buildTemplate, csvCell, hasOwnDescription, parseCsv, planDescriptions, readTemplate } from '../src/core/descriptions'
import { validDescriptions } from '../src/main/guards'
import { applyDescriptions } from '../src/main/descriptions'
import { Icon } from '../src/types'
import { FakeFigma, FakeNode, installFigma, makeComponent } from './helpers/fakeFigma'

const icon = (nodeId: string, name: string, description = '', over: Partial<Icon> = {}): Icon =>
  ({ nodeId, name, description, categoryLabel: 'Arrows', sourceKind: 'component', ...over }) as unknown as Icon

describe('CSV template', () => {
  it('quotes cells with commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
  })
  it('lists components only, and only the ones without a description when asked', () => {
    const icons = [icon('1:1', 'home'), icon('1:2', 'search', 'find, magnifier'), icon('1:3', 'pic', '', { sourceKind: 'instance' }), icon('1:4', 'loose', '', { sourceKind: 'frame' })]
    expect(icons.filter(hasOwnDescription)).toHaveLength(2)
    const missing = buildTemplate(icons, { onlyMissing: true })
    expect(missing).toContain('1:1,home,Arrows,')
    expect(missing).not.toContain('1:2')
    expect(missing).not.toContain('1:3')
    expect(buildTemplate(icons, { onlyMissing: false })).toContain('"find, magnifier"')
  })
  it('keeps a spreadsheet from running a name or description as a formula', () => {
    const t = buildTemplate([icon('1:1', 'x', '=HYPERLINK("http://evil")')], { onlyMissing: false })
    expect(t).toContain("'=HYPERLINK")
    expect(readTemplate(t).rows[0].description).toBe('=HYPERLINK("http://evil")')
  })
})

describe('reading a filled template', () => {
  it('parses quoted cells with delimiters, quotes and line breaks', () => {
    expect(parseCsv('a,"b, c","d ""e""",f\r\n1,2,3,4\n', ',')).toEqual([['a', 'b, c', 'd "e"', 'f'], ['1', '2', '3', '4']])
    expect(parseCsv('x,"line1\nline2"\n', ',')).toEqual([['x', 'line1\nline2']])
  })
  it('accepts a BOM, any column order, and semicolons or tabs (spreadsheet exports)', () => {
    expect(readTemplate('﻿name;description;nodeId\nhome;house, start;1:1\n').rows).toEqual([{ nodeId: '1:1', description: 'house, start' }])
    expect(readTemplate('nodeId\tdescription\n1:1\ta, b\n').rows).toEqual([{ nodeId: '1:1', description: 'a, b' }])
  })
  it('explains a file that is not the template', () => {
    expect(readTemplate('').problems[0]).toMatch(/empty/)
    expect(readTemplate('name,notes\nhome,x\n').problems[0]).toMatch(/nodeId/)
  })
  it('drops control characters and rows without an id', () => {
    const r = readTemplate('nodeId,description\n1:1,"a\u0007b"\n,orphan\n')
    expect(r.rows).toEqual([{ nodeId: '1:1', description: 'ab' }])
  })
})

describe('planning', () => {
  const icons = [icon('1:1', 'home'), icon('1:2', 'search', 'find'), icon('1:3', 'bell', 'alert'), icon('1:4', 'gone', '', { sourceKind: 'instance' })]
  it('changes only what differs, never clears a description from an empty cell, and reports unknown ids', () => {
    const plan = planDescriptions(
      [
        { nodeId: '1:1', description: 'house, start' },
        { nodeId: '1:2', description: 'find' },
        { nodeId: '1:3', description: '' },
        { nodeId: '9:9', description: 'x' },
        { nodeId: '1:4', description: 'x' },
        { nodeId: '1:1', description: 'duplicate row' }
      ],
      icons
    )
    expect(plan.changes).toEqual([{ nodeId: '1:1', name: 'home', from: '', to: 'house, start', tags: ['house', 'start'] }])
    expect(plan.unchanged).toBe(1)
    expect(plan.empty).toBe(1)
    expect(plan.unknown).toEqual(['9:9', '1:4'])
  })
})

describe('guards for the write', () => {
  it('keeps valid items, trims, and drops empty or malformed ones', () => {
    const items = validDescriptions([{ nodeId: '1:1', from: '', to: '  tags  ' }, { nodeId: 'bad', from: '', to: 'x' }, { nodeId: '1:2', from: '', to: '   ' }, { nodeId: '1:3', from: 5, to: 'x' }, null])
    expect(items).toEqual([{ nodeId: '1:1', from: '', to: 'tags' }])
    expect(validDescriptions('nope')).toEqual([])
  })
})

describe('writing descriptions', () => {
  let fig: FakeFigma
  beforeEach(() => {
    fig = installFigma()
  })
  const comp = (name: string, description = ''): FakeNode => {
    const c = makeComponent(fig, name)
    c.description = description
    return c
  }

  it('writes a description when the file still has the scanned one', async () => {
    const a = comp('home', 'old')
    const r = await applyDescriptions([{ nodeId: a.id, from: 'old', to: 'house, start' }])
    expect(r).toMatchObject({ ok: 1, skipped: 0, failed: 0 })
    expect(a.description).toBe('house, start')
  })
  it('skips one that a designer changed since the scan, and one from a library', async () => {
    const a = comp('a', 'typed by a designer')
    const b = comp('b')
    b.remote = true
    const r = await applyDescriptions([{ nodeId: a.id, from: '', to: 'x' }, { nodeId: b.id, from: '', to: 'y' }])
    expect(r).toMatchObject({ ok: 0, skipped: 2 })
    expect(a.description).toBe('typed by a designer')
    expect(b.description).toBe('')
  })
  it('counts missing nodes and things that are not components as failed, and keeps going', async () => {
    const frame = new FakeNode('FRAME', 'f')
    fig.nodes.set(frame.id, frame)
    const ok = comp('ok')
    const r = await applyDescriptions([{ nodeId: '9:9', from: '', to: 'x' }, { nodeId: frame.id, from: '', to: 'x' }, { nodeId: ok.id, from: '', to: 'fine' }])
    expect(r).toMatchObject({ ok: 1, failed: 2 })
    expect(ok.description).toBe('fine')
  })
})
