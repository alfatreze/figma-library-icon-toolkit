import { beforeEach, describe, expect, it } from 'vitest'
import { cleanPageName, leavesOf, signatureOf } from '../src/main/diagnose'
import { emptyFacts, gatherFacts, isIconish, resetFactCaches, toHex } from '../src/main/facts'
import { FakeFigma, FakeNode, installFigma, makeComponent, makeFrame } from './helpers/fakeFigma'

let fig: FakeFigma
beforeEach(() => {
  fig = installFigma()
  resetFactCaches()
})
const asScene = (n: FakeNode) => n as unknown as SceneNode

describe('facts', () => {
  it('converts Figma colours to hex and clamps out-of-range channels', () => {
    expect(toHex({ r: 1, g: 0, b: 0 })).toBe('#ff0000')
    expect(toHex({ r: 2, g: -1, b: 0.5 })).toBe('#ff0080')
  })
  it('starts from an all-clear fact sheet', () => {
    const f = emptyFacts()
    expect(f.leafCount).toBe(0)
    expect(f.hasText || f.hasImage || f.hasGradient).toBe(false)
  })
  it('treats vector-only layers as icons and text, nested instances or empty frames as not', () => {
    expect(isIconish(asScene(makeComponent(fig, 'a')))).toBe(true)
    const withText = makeComponent(fig, 'b')
    withText.appendChild(new FakeNode('TEXT', 'label'))
    expect(isIconish(asScene(withText))).toBe(false)
    const withInstance = makeComponent(fig, 'c')
    withInstance.appendChild(new FakeNode('INSTANCE', 'inner'))
    expect(isIconish(asScene(withInstance))).toBe(false)
    expect(isIconish(asScene(withInstance), true)).toBe(true) // Labs composite mode accepts it (it has a vector leaf)
    expect(isIconish(asScene(new FakeNode('FRAME', 'empty')))).toBe(false)
  })
  it('ignores hidden layers', () => {
    const c = makeComponent(fig, 'd', ['#111111'])
    c.children[0].visible = false
    expect(isIconish(asScene(c))).toBe(false)
  })
  it('gathers the paints of a coloured icon', async () => {
    const c = makeComponent(fig, 'e', ['#ff0000', '#00ff00'])
    const { facts } = await gatherFacts(asScene(c))
    expect(facts.leafCount).toBe(2)
    expect(facts.paints.map((p) => p.hex).sort()).toEqual(['#00ff00', '#ff0000'])
    expect(facts.hasText).toBe(false)
  })
  it('flags text inside an icon', async () => {
    const c = makeComponent(fig, 'f')
    c.appendChild(new FakeNode('TEXT', 'x'))
    expect((await gatherFacts(asScene(c))).facts.hasText).toBe(true)
  })
})

describe('diagnose helpers', () => {
  it('strips decoration from page names but keeps names that are only decoration', () => {
    expect(cleanPageName('↳ Icons')).toBe('Icons')
    expect(cleanPageName('  — Actions ')).toBe('Actions')
    expect(cleanPageName('---')).toBe('---')
  })
  it('lists visible vector leaves with their fill colour', () => {
    const c = makeComponent(fig, 'g', ['#ff0000', '#0000ff'])
    c.children[1].visible = false
    const leaves = leavesOf(asScene(c))
    expect(leaves).toHaveLength(1)
    expect(leaves[0].hex).toBe('#ff0000')
  })
  it('gives identical artwork the same signature and different colour the same shape', () => {
    const a = makeComponent(fig, 'h', ['#111111'])
    const b = makeFrame(fig, fig.page as unknown as FakeNode, 'h copy', ['#111111'])
    const c = makeFrame(fig, fig.page as unknown as FakeNode, 'h other', ['#111111', '#111111'])
    expect(signatureOf(asScene(a)).geom).toBe(signatureOf(asScene(b)).geom)
    expect(signatureOf(asScene(a)).geom).not.toBe(signatureOf(asScene(c)).geom)
  })
})

describe('facts: variable modes', () => {
  const rgb = (r: number, g: number, b: number) => ({ r, g, b })
  const bind = (hex: string, id: string) => ({ type: 'SOLID', color: { r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 }, boundVariables: { color: { type: 'VARIABLE_ALIAS', id } } })

  it('reads the colour of a variable in every mode, following aliases', async () => {
    fig.variables.collections.set('c1', { id: 'c1', name: 'Semantic', defaultModeId: 'm1', modes: [{ modeId: 'm1', name: 'Light' }, { modeId: 'm2', name: 'Dark' }] })
    fig.variables.collections.set('c0', { id: 'c0', name: 'Primitives', defaultModeId: 'p1', modes: [{ modeId: 'p1', name: 'Value' }] })
    fig.variables.store.set('V:base', { id: 'V:base', name: 'neutral/900', resolvedType: 'COLOR', variableCollectionId: 'c0', valuesByMode: { p1: rgb(0.1, 0.1, 0.1) } })
    fig.variables.store.set('V:icon', { id: 'V:icon', name: 'color/icon/primary', resolvedType: 'COLOR', variableCollectionId: 'c1', valuesByMode: { m1: { type: 'VARIABLE_ALIAS', id: 'V:base' }, m2: rgb(1, 1, 1) } })
    const c = makeComponent(fig, 'icon/Home')
    c.children[0].fills = [bind('#1a1a1a', 'V:icon')]
    const { facts } = await gatherFacts(asScene(c))
    expect(facts.paints[0]).toMatchObject({ variable: 'color/icon/primary', collection: 'Semantic', modes: { Light: '#1a1a1a', Dark: '#ffffff' } })
  })

  it('has no modes for a variable of a single-mode collection', async () => {
    fig.variables.collections.set('c0', { id: 'c0', name: 'Primitives', defaultModeId: 'p1', modes: [{ modeId: 'p1', name: 'Value' }] })
    fig.variables.store.set('V:base', { id: 'V:base', name: 'neutral/900', resolvedType: 'COLOR', variableCollectionId: 'c0', valuesByMode: { p1: rgb(0.1, 0.1, 0.1) } })
    const c = makeComponent(fig, 'icon/Home')
    c.children[0].fills = [bind('#1a1a1a', 'V:base')]
    const { facts } = await gatherFacts(asScene(c))
    expect(facts.paints[0].modes).toBeUndefined()
  })
})
