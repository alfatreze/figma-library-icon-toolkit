import { beforeEach, describe, expect, it } from 'vitest'
import { scan } from '../src/main/scan'
import { RawIcon, ScanOptions } from '../src/types'
import { FakeFigma, FakeNode, installFigma, makeComponent, makeFrame } from './helpers/fakeFigma'

let fig: FakeFigma
beforeEach(() => {
  fig = installFigma()
})

const OPTS: ScanOptions = { mode: 'auto', scope: 'page', usageOnly: false, maxIconSize: 128, compositeFrames: 'ignore', leafName: 'Vector', leafNameMode: 'auto' }
const run = async (opts: Partial<ScanOptions> = {}, cancelled = () => false) => {
  const icons: RawIcon[] = []
  const phases: string[] = []
  const summary = await scan({ ...OPTS, ...opts }, cancelled, (t) => phases.push(t), (batch) => icons.push(...batch))
  return { icons, summary, phases }
}
const vector = (hex = '#111111') => {
  const v = new FakeNode('VECTOR', 'Vector')
  const n = parseInt(hex.slice(1), 16)
  v.fills = [{ type: 'SOLID', color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 } }]
  return v
}
const track = (n: FakeNode) => {
  fig.nodes.set(n.id, n)
  return n
}

describe('scan: what becomes an icon', () => {
  it('lists components and the variants of a component set once, and an instance of a variant is not a second icon', async () => {
    const set = track(new FakeNode('COMPONENT_SET', 'Home'))
    fig.page.appendChild(set)
    const filled = track(new FakeNode('COMPONENT', 'Style=Filled'))
    filled.key = 'k-filled'
    filled.appendChild(vector())
    set.appendChild(filled)
    const plain = makeComponent(fig, 'icon/Plus')
    // a screen using both
    const screen = makeFrame(fig, fig.page, 'Screen', [])
    screen.width = 400
    screen.height = 400
    screen.appendChild(filled.createInstance())
    screen.appendChild(plain.createInstance())
    const { icons } = await run()
    expect(icons.map((i) => i.rawName).sort()).toEqual(['Style=Filled', 'icon/Plus'])
    expect(icons.every((i) => i.sourceKind !== 'instance')).toBe(true)
  })

  it('does not offer frames that live inside an instance (they cannot be converted)', async () => {
    const card = track(new FakeNode('COMPONENT', 'Card'))
    card.width = 300
    card.height = 300
    const inner = makeFrame(fig, card, 'inner icon-like frame', ['#111111'])
    inner.width = 24
    inner.height = 24
    fig.page.appendChild(card)
    const screen = makeFrame(fig, fig.page, 'Screen', [])
    screen.width = 500
    screen.height = 500
    screen.appendChild(card.createInstance())
    const { icons } = await run({ maxIconSize: 64 })
    expect(icons.filter((i) => i.sourceKind === 'frame')).toHaveLength(0)
  })

  it('usage mode counts icon instances placed inside components (a button chevron)', async () => {
    const chevron = makeComponent(fig, 'icon/Chevron')
    const button = track(new FakeNode('COMPONENT', 'Button'))
    button.width = 200
    button.height = 40
    button.appendChild(chevron.createInstance())
    fig.page.appendChild(button)
    const { icons } = await run({ usageOnly: true })
    const row = icons.find((i) => i.rawName === 'icon/Chevron')
    expect(row?.usage?.instances).toBe(1)
  })
})

describe('scan: resilience', () => {
  it('one unreadable layer becomes a blocked row instead of ending the scan', async () => {
    makeComponent(fig, 'icon/Good')
    const bad = makeComponent(fig, 'icon/Bad')
    Object.defineProperty(bad.children[0], 'fills', {
      get() {
        throw new Error('node is not readable')
      }
    })
    bad.failOn = 'export'
    const { icons, summary } = await run()
    expect(icons).toHaveLength(2)
    expect(summary.scanned).toBe(2)
    const row = icons.find((i) => i.rawName === 'icon/Bad')!
    expect(row.exportError).toBeTruthy()
    expect(icons.find((i) => i.rawName === 'icon/Good')!.exportError).toBeUndefined()
  })

  it('cancel stops between pages (document scope loads one page at a time)', async () => {
    const p2 = new FakeNode('PAGE', 'Second')
    fig.root.appendChild(p2)
    const comp = new FakeNode('COMPONENT', 'icon/OnSecond')
    comp.appendChild(vector())
    p2.appendChild(comp)
    fig.nodes.set(comp.id, comp)
    makeComponent(fig, 'icon/OnFirst')
    let loaded = 0
    for (const p of fig.root.children) {
      const orig = p.loadAsync.bind(p)
      p.loadAsync = async () => {
        loaded++
        await orig()
      }
    }
    const { icons } = await run({ scope: 'document' }, () => loaded >= 1)
    expect(loaded).toBe(1)
    expect(icons.length).toBeLessThanOrEqual(1)
  })

  it('a selected component is listed even in usage mode (Dev Mode: you click the component)', async () => {
    const c = makeComponent(fig, 'icon/Picked')
    ;(fig.currentPage as unknown as FakeNode).selection = [c]
    ;(fig as unknown as { currentPage: { selection: FakeNode[] } }).currentPage = Object.assign(fig.page, { selection: [c] }) as never
    const { icons } = await run({ scope: 'selection', usageOnly: true })
    expect(icons.map((i) => i.rawName)).toEqual(['icon/Picked'])
  })

  it('unreadable layers do not vote for the library grid', async () => {
    const { detectGrid } = await import('../src/core/library')
    const { DEFAULT_SETTINGS } = await import('../src/types')
    const mk = (w: number): RawIcon => ({ key: String(w), nodeId: '1:1', pageId: 'p', pageName: 'p', sourceKind: 'component', rawName: 'x', variantProps: {}, description: '', width: w, height: w, padding: null, facts: {} as never, svg: null, categoryCtx: {} })
    expect(detectGrid([mk(0), mk(0), mk(0), mk(24)], DEFAULT_SETTINGS).width).toBe(24)
  })
})
