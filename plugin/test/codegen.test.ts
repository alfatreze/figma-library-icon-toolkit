import { beforeEach, describe, expect, it } from 'vitest'
import { registerCodegen } from '../src/main/codegen'
import { resetFactCaches } from '../src/main/facts'
import { FakeFigma, FakeNode, installFigma, makeComponent } from './helpers/fakeFigma'

type Handler = (e: { node: unknown; language: string }) => Promise<{ title: string; code: string; language: string }[]>
let fig: FakeFigma
let generate: Handler
let custom: Record<string, string>

beforeEach(() => {
  fig = installFigma()
  custom = {}
  resetFactCaches()
  const codegen = {
    preferences: { get customSettings() { return custom } },
    on: (_event: string, h: Handler) => {
      generate = h
    }
  }
  ;(fig as unknown as { codegen: unknown }).codegen = codegen
  registerCodegen()
})

const run = (node: FakeNode, language = '') => generate({ node, language })
const titles = (r: { title: string }[]) => r.map((x) => x.title)

describe('codegen (Dev Mode)', () => {
  it('asks for an icon when nothing usable is selected', async () => {
    const r = await run(new FakeNode('FRAME', 'Screen'))
    expect(r[0].code).toMatch(/Select an icon instance/)
  })

  it('shows every framework for an instance of an icon component', async () => {
    const c = makeComponent(fig, 'icon/Home')
    const r = await run(c.createInstance())
    expect(titles(r)).toEqual(expect.arrayContaining(['Angular', 'HTML (sprite)', 'React', 'Web Component', 'CSS variables']))
    const html = r.find((x) => x.title === 'HTML (sprite)')!.code
    expect(html).toContain('-sprite.svg#')
    expect(html).toContain('home')
  })

  it('narrows to the language Dev Mode asked for', async () => {
    const c = makeComponent(fig, 'icon/Home')
    const r = await run(c.createInstance(), 'react')
    expect(r.find((x) => x.title === 'React')).toBeTruthy()
    expect(r.find((x) => x.title === 'Angular')).toBeUndefined()
  })

  it('reports a colour override as a CSS variable and a resized instance as a size', async () => {
    const c = makeComponent(fig, 'icon/Home', ['#111111'])
    const inst = c.createInstance()
    inst.fills = []
    inst.children[0].fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]
    inst.width = 48
    inst.height = 48
    const html = (await run(inst, 'html')).find((x) => x.title === 'HTML (sprite)')!.code
    expect(html).toContain('-icon-color: #ff0000')
  })

  it('follows the sprite path and accessibility preferences', async () => {
    custom = { spritePath: '/assets/', a11y: 'labelled' }
    const c = makeComponent(fig, 'icon/Home')
    const html = (await run(c.createInstance(), 'html')).find((x) => x.title === 'HTML (sprite)')!.code
    expect(html).toContain('/assets/')
    expect(html).toContain('aria-label="home"')
  })

  it('lists the icons used in a frame', async () => {
    const c = makeComponent(fig, 'icon/Home')
    const frame = new FakeNode('FRAME', 'Screen')
    frame.appendChild(c.createInstance())
    frame.appendChild(c.createInstance())
    const r = await run(frame)
    expect(r[0].title).toBe('Icons used here (1)')
    expect(r[0].code).toContain('×2')
  })

  it('says which settings it used when the file has no published config', async () => {
    const c = makeComponent(fig, 'icon/Home')
    const r = await run(c.createInstance())
    expect(r.some((x) => x.title === 'Library config')).toBe(true)
  })

  it('answers with a message, not an exception, when something goes wrong', async () => {
    const broken = new FakeNode('INSTANCE', 'x')
    broken.getMainComponentAsync = async () => {
      throw new Error('boom')
    }
    const r = await run(broken)
    expect(r[0].code).toMatch(/Could not generate code.*boom/)
  })
})
