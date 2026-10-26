import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { unzipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PngBody } from '../src/ui/PngSection'
import { PackageCards } from '../src/ui/components/PackageCards'
import { zipFiles } from '../src/core/zip'
import { colourOptions, planPng } from '../src/core/png'
import { DEFAULT_SETTINGS, Icon } from '../src/types'

vi.mock('@create-figma-plugin/ui', () => ({
  Button: (p: { children?: unknown; onClick?: () => void; disabled?: boolean }) => <button disabled={p.disabled} onClick={p.onClick}>{p.children as never}</button>,
  Textbox: (p: { value: string; placeholder?: string; onValueInput: (v: string) => void }) => <input value={p.value} placeholder={p.placeholder} onInput={(e) => p.onValueInput((e.currentTarget as HTMLInputElement).value)} />,
  Toggle: (p: { value: boolean; children?: unknown; onValueChange: (v: boolean) => void }) => <label><input type="checkbox" checked={p.value} onChange={(e) => p.onValueChange((e.currentTarget as HTMLInputElement).checked)} />{p.children as never}</label>
}))

const icon = (name: string, multi = false): Icon =>
  ({
    name, width: 16, height: 16, svgOk: true, kind: multi ? 'multicolor' : 'filled',
    slots: multi ? [{ index: 1, hex: '#111111' }, { index: 2, hex: '#ff0000' }] : [{ index: 1, hex: '#111111' }],
    standalone: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path fill="var(--c1, currentColor)"/></svg>'
  }) as unknown as Icon
const fileBase = (i: Icon) => `cmn-${i.name}`
const options = colourOptions([{ variable: 'icon/default', collection: 'Theme', modes: { Light: '#111111', Dark: '#eeeeee' } }])

describe('PngBody', () => {
  let root: HTMLDivElement
  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })
  afterEach(() => {
    act(() => render(null, root))
    root.remove()
  })
  const draw = (png: typeof DEFAULT_SETTINGS.png, onChange: (p: typeof DEFAULT_SETTINGS.png) => void = () => {}, icons = [icon('a'), icon('m', true)]) =>
    act(() => render(<PngBody png={png} options={options} plan={planPng(icons, png.rows, options, fileBase)} figmaNote="" onChange={onChange} />, root))
  const row = (id: string, size: string, suffix = '', colour: typeof DEFAULT_SETTINGS.png.rows[number]['colour'] = { kind: 'drawn' }) => ({ id, size, suffix, colour })

  it('adds a row with the icon\'s own size and the colour as drawn', () => {
    const changes: (typeof DEFAULT_SETTINGS.png)[] = []
    draw({ enabled: true, rows: [] }, (p) => changes.push(p))
    act(() => (Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Add row') as HTMLButtonElement).click())
    expect(changes[0].rows).toHaveLength(1)
    expect(changes[0].rows[0]).toMatchObject({ size: '1x', suffix: '', colour: { kind: 'drawn' } })
  })

  const button = (text: string | RegExp) => Array.from(root.querySelectorAll('button')).find((b) => (typeof text === 'string' ? b.textContent === text : text.test(b.textContent ?? ''))) as HTMLButtonElement

  it('is one line per row: colour, size, suffix and remove', () => {
    draw({ enabled: true, rows: [row('1', '2x', '@2x')] })
    const line = root.querySelector('button[aria-label^="Colour:"]')!.parentElement!
    expect(line.querySelectorAll('input')).toHaveLength(2)
    expect(line.querySelector('button[aria-label="Remove this row"]')).not.toBeNull()
    expect(root.textContent).not.toContain('Type a colour') // the editor is closed until the swatch is clicked
  })

  it('lists the scanned variables per collection and mode with their colours, and stores the choice', () => {
    const changes: (typeof DEFAULT_SETTINGS.png)[] = []
    draw({ enabled: true, rows: [row('1', '2x', '@2x')] }, (p) => changes.push(p))
    act(() => (root.querySelector('button[aria-label^="Colour:"]') as HTMLButtonElement).click())
    expect(root.textContent).toContain('Theme')
    expect(root.textContent).toContain('icon/default')
    expect(root.textContent).toContain('#eeeeee')
    act(() => button(/Dark/).click())
    expect(changes[0].rows[0].colour).toEqual({ kind: 'variable', variable: 'icon/default', collection: 'Theme', mode: 'Dark' })
  })

  it('shows the chosen colour on the row, and “as drawn” by default', () => {
    draw({ enabled: true, rows: [row('1', '1x'), row('2', '1x', '-dark', { kind: 'variable', variable: 'icon/default', collection: 'Theme', mode: 'Dark' }), row('3', '1x', '-red', { kind: 'hex', hex: '#ff0000' })] })
    const labels = Array.from(root.querySelectorAll('button[aria-label^="Colour:"]')).map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(['Colour: As drawn', 'Colour: icon/default · Dark', 'Colour: #FF0000'])
  })

  it('stores a typed colour only once it is valid', () => {
    const changes: (typeof DEFAULT_SETTINGS.png)[] = []
    draw({ enabled: true, rows: [row('1', '1x')] }, (p) => changes.push(p))
    act(() => (root.querySelector('button[aria-label^="Colour:"]') as HTMLButtonElement).click())
    const hex = Array.from(root.querySelectorAll('input')).find((i) => i.placeholder.startsWith('Type a colour')) as HTMLInputElement
    hex.value = '#12'
    act(() => { hex.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(changes).toEqual([])
    expect(root.textContent).toContain('Use a colour like #112233')
    hex.value = '#ABC'
    act(() => { hex.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(changes[0].rows[0].colour).toEqual({ kind: 'hex', hex: '#aabbcc' })
  })

  it('goes back to “as drawn” from the editor', () => {
    const changes: (typeof DEFAULT_SETTINGS.png)[] = []
    draw({ enabled: true, rows: [row('1', '1x', '', { kind: 'hex', hex: '#ff0000' })] }, (p) => changes.push(p))
    act(() => (root.querySelector('button[aria-label^="Colour:"]') as HTMLButtonElement).click())
    act(() => button(/As drawn in Figma/).click())
    expect(changes[0].rows[0].colour).toEqual({ kind: 'drawn' })
  })

  it('shows the skipped multi-colour icons, and the problems of a row', () => {
    draw({ enabled: true, rows: [row('1', '1x'), row('2', '2x', '-red', { kind: 'hex', hex: '#ff0000' })] })
    expect(root.textContent).toContain('1 icon not drawn on rows with a colour')
    draw({ enabled: true, rows: [row('1', 'big')] })
    expect(root.textContent).toContain('“big” is not a size')
    expect(root.textContent).not.toContain('not drawn on rows with a colour')
  })

  it('removes a row', () => {
    const changes: (typeof DEFAULT_SETTINGS.png)[] = []
    draw({ enabled: true, rows: [row('1', '1x'), row('2', '2x', '@2x')] }, (p) => changes.push(p))
    act(() => (root.querySelector('button[aria-label="Remove this row"]') as HTMLButtonElement).click())
    expect(changes[0].rows.map((r) => r.id)).toEqual(['2'])
  })
})

describe('the ZIP with PNG files', () => {
  it('stores PNG bytes unchanged next to the compressed text files', () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
    const out = unzipSync(zipFiles({ 'README.md': 'hello' }, { 'png/cmn-a@2x.png': png }))
    expect(Object.keys(out).sort()).toEqual(['README.md', 'png/cmn-a@2x.png'])
    expect(Array.from(out['png/cmn-a@2x.png'])).toEqual(Array.from(png))
  })
})


describe('PackageCards', () => {
  let root: HTMLDivElement
  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })
  afterEach(() => {
    act(() => render(null, root))
    root.remove()
  })
  const draw = (formats: typeof DEFAULT_SETTINGS.formats, png = DEFAULT_SETTINGS.png, on: { f?: (f: typeof formats) => void; p?: (p: typeof png) => void } = {}) =>
    act(() => render(<PackageCards formats={formats} png={png} npm={DEFAULT_SETTINGS.npm} onNpm={() => {}} onFormats={on.f ?? (() => {})} onPng={on.p ?? (() => {})} rows={null} pngBody={<div>PNG rows here</div>} pngFiles={6} />, root))
  const names = () => Array.from(root.querySelectorAll('input[type=checkbox]')).map((i) => i.closest('label')!.textContent)

  it('lists SVG, PNG, HTML & CSS, Angular, React, Vue, Svelte, Web Component, Code Connect and npm packages, PNG right after SVG', () => {
    draw(DEFAULT_SETTINGS.formats)
    const titles = Array.from(root.querySelectorAll('label')).map((l) => (l.textContent ?? '').replace(/^✓/, ''))
    const order = ['SVG', 'PNG', 'HTML & CSS', 'Angular', 'React', 'Vue', 'Svelte', 'Web Component', 'Code Connect', 'npm packages'].map((t) => titles.findIndex((x) => x.startsWith(t)))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(names()).toHaveLength(10)
  })

  it('starts folded, and a card folds out to its own settings', () => {
    draw(DEFAULT_SETTINGS.formats)
    expect(root.textContent).not.toContain('PNG rows here')
    act(() => (root.querySelector('button[aria-label="Show PNG settings"]') as HTMLButtonElement).click())
    expect(root.textContent).toContain('PNG rows here')
    act(() => (root.querySelector('button[aria-label="Hide PNG settings"]') as HTMLButtonElement).click())
    expect(root.textContent).not.toContain('PNG rows here')
  })

  it('switches PNG on and shows its file count', () => {
    const changes: (typeof DEFAULT_SETTINGS.png)[] = []
    draw(DEFAULT_SETTINGS.formats, { enabled: false, rows: [] }, { p: (p) => changes.push(p) })
    expect(root.textContent).not.toContain('6 files')
    const box = Array.from(root.querySelectorAll('input[type=checkbox]')).find((i) => i.closest('label')!.textContent!.replace(/^✓/, '').startsWith('PNG')) as HTMLInputElement
    act(() => box.click())
    expect(changes[0].enabled).toBe(true)
    draw(DEFAULT_SETTINGS.formats, { enabled: true, rows: [] })
    expect(root.textContent).toContain('6 files')
  })

  it('npm packages: a card with scope and licence, switched on with the others', () => {
    const changes: (typeof DEFAULT_SETTINGS.npm)[] = []
    act(() => render(<PackageCards formats={DEFAULT_SETTINGS.formats} png={DEFAULT_SETTINGS.png} npm={{ enabled: true, scope: 'acme', license: '', stories: false }} onNpm={(n) => changes.push(n)} onFormats={() => {}} onPng={() => {}} rows={null} pngBody={null} pngFiles={0} />, root))
    act(() => (root.querySelector('button[aria-label="Show npm packages settings"]') as HTMLButtonElement).click())
    expect(root.textContent).toContain('Use a scope like @acme')
    expect(root.textContent).toContain('UNLICENSED is used until then')
    const scope = Array.from(root.querySelectorAll('input')).find((i) => i.placeholder.startsWith('@acme')) as HTMLInputElement
    scope.value = '@acme'
    act(() => { scope.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(changes[0]).toEqual({ enabled: true, scope: '@acme', license: '', stories: false })
  })

  it('Angular: one card, the version is a choice inside it (17.1+, 14+ or both)', () => {
    const changes: (typeof DEFAULT_SETTINGS.formats)[] = []
    draw({ ...DEFAULT_SETTINGS.formats, angularModern: true, angularClassic: false }, DEFAULT_SETTINGS.png, { f: (f) => changes.push(f) })
    act(() => (root.querySelector('button[aria-label="Show Angular settings"]') as HTMLButtonElement).click())
    const radios = Array.from(root.querySelectorAll('[role=radio]'))
    expect(radios.map((r) => r.textContent)).toEqual(['17.1+', '14+', 'Both'])
    expect(radios[0].getAttribute('aria-checked')).toBe('true')
    act(() => (radios[2] as HTMLElement).click())
    expect(changes[0]).toMatchObject({ angularModern: true, angularClassic: true })
    act(() => (radios[1] as HTMLElement).click())
    expect(changes[1]).toMatchObject({ angularModern: false, angularClassic: true })
  })

  it('switching a card on turns on its default part, off turns all its parts off', () => {
    const changes: (typeof DEFAULT_SETTINGS.formats)[] = []
    const allOff = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.formats).map((k) => [k, false])) as typeof DEFAULT_SETTINGS.formats
    draw(allOff, DEFAULT_SETTINGS.png, { f: (f) => changes.push(f) })
    const box = (title: string) => Array.from(root.querySelectorAll('input[type=checkbox]')).find((i) => i.closest('label')!.textContent!.replace(/^✓/, '').startsWith(title)) as HTMLInputElement
    act(() => box('HTML & CSS').click())
    expect(changes[0]).toMatchObject({ html: true, css: true, mask: false })
    draw({ ...allOff, html: true, css: true }, DEFAULT_SETTINGS.png, { f: (f) => changes.push(f) })
    act(() => box('HTML & CSS').click())
    expect(changes[1]).toMatchObject({ html: false, css: false, mask: false })
  })

  it('HTML & CSS and SVG hold their parts as separate switches', () => {
    const changes: (typeof DEFAULT_SETTINGS.formats)[] = []
    draw({ ...DEFAULT_SETTINGS.formats, html: true, css: true, mask: false }, DEFAULT_SETTINGS.png, { f: (f) => changes.push(f) })
    act(() => (root.querySelector('button[aria-label="Show HTML & CSS settings"]') as HTMLButtonElement).click())
    expect(root.textContent).toContain('HTML preview page')
    expect(root.textContent).toContain('CSS file')
    expect(root.textContent).toContain('CSS mask classes')
    const mask = Array.from(root.querySelectorAll('input[type=checkbox]')).find((i) => i.closest('label')!.textContent!.replace(/^✓/, '').startsWith('CSS mask classes')) as HTMLInputElement
    act(() => mask.click())
    expect(changes[0]).toMatchObject({ html: true, css: true, mask: true })
    act(() => (root.querySelector('button[aria-label="Show SVG settings"]') as HTMLButtonElement).click())
    expect(root.textContent).toContain('SVG files')
    expect(root.textContent).toContain('SVG sprite')
  })
})
