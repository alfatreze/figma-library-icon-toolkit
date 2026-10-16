import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { unzipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PngSection } from '../src/ui/PngSection'
import { zipFiles } from '../src/core/zip'
import { colourOptions, planPng } from '../src/core/png'
import { DEFAULT_SETTINGS, Icon } from '../src/types'

vi.mock('@create-figma-plugin/ui', () => ({
  Button: (p: { children?: unknown; onClick?: () => void; disabled?: boolean }) => <button disabled={p.disabled} onClick={p.onClick}>{p.children as never}</button>,
  Textbox: (p: { value: string; placeholder?: string; onValueInput: (v: string) => void }) => <input value={p.value} placeholder={p.placeholder} onInput={(e) => p.onValueInput((e.currentTarget as HTMLInputElement).value)} />,
  Toggle: (p: { value: boolean; children?: unknown; onValueChange: (v: boolean) => void }) => <label><input type="checkbox" checked={p.value} onChange={(e) => p.onValueChange((e.currentTarget as HTMLInputElement).checked)} />{p.children as never}</label>,
  Dropdown: (p: { value: string; options: { value: string; text: string }[]; onValueChange: (v: string) => void }) => <select value={p.value} onChange={(e) => p.onValueChange((e.currentTarget as HTMLSelectElement).value)}>{p.options.map((o) => <option value={o.value}>{o.text}</option>)}</select>
}))

const icon = (name: string, multi = false): Icon =>
  ({
    name, width: 16, height: 16, svgOk: true, kind: multi ? 'multicolor' : 'filled',
    slots: multi ? [{ index: 1, hex: '#111111' }, { index: 2, hex: '#ff0000' }] : [{ index: 1, hex: '#111111' }],
    standalone: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none"><path fill="var(--c1, currentColor)"/></svg>'
  }) as unknown as Icon
const fileBase = (i: Icon) => `cmn-${i.name}`
const options = colourOptions([{ variable: 'icon/default', collection: 'Theme', modes: { Light: '#111111', Dark: '#eeeeee' } }])

describe('PngSection', () => {
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
    act(() => render(<PngSection png={png} options={options} plan={planPng(icons, png.rows, options, fileBase)} figmaNote="" onChange={onChange} />, root))
  const row = (id: string, size: string, suffix = '', colour: typeof DEFAULT_SETTINGS.png.rows[number]['colour'] = { kind: 'drawn' }) => ({ id, size, suffix, colour })

  it('adds a row with the icon\'s own size and the colour as drawn, and switches PNG on', () => {
    const changes: (typeof DEFAULT_SETTINGS.png)[] = []
    draw({ enabled: false, rows: [] }, (p) => changes.push(p))
    act(() => (Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Add row') as HTMLButtonElement).click())
    expect(changes[0].rows).toHaveLength(1)
    expect(changes[0].rows[0]).toMatchObject({ size: '1x', suffix: '', colour: { kind: 'drawn' } })
    const box = root.querySelector('input[type=checkbox]') as HTMLInputElement
    act(() => box.click())
    expect(changes[1].enabled).toBe(true)
  })

  it('offers the colours of the scanned variables per mode and stores the choice', () => {
    const changes: (typeof DEFAULT_SETTINGS.png)[] = []
    draw({ enabled: true, rows: [row('1', '2x', '@2x')] }, (p) => changes.push(p))
    const select = root.querySelector('select') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.text)).toEqual(['Colour: as drawn in Figma', 'Colour: custom…', 'Colour: icon/default · Light  #111111', 'Colour: icon/default · Dark  #eeeeee'])
    select.value = 'v1'
    act(() => { select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(changes[0].rows[0].colour).toEqual({ kind: 'variable', variable: 'icon/default', collection: 'Theme', mode: 'Dark' })
  })

  it('stores a typed colour only once it is valid', () => {
    const changes: (typeof DEFAULT_SETTINGS.png)[] = []
    draw({ enabled: true, rows: [row('1', '1x', '', { kind: 'hex', hex: '#000000' })] }, (p) => changes.push(p))
    const hex = Array.from(root.querySelectorAll('input')).find((i) => i.placeholder === '#112233') as HTMLInputElement
    hex.value = '#12'
    act(() => { hex.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(changes).toEqual([])
    expect(root.textContent).toContain('Use a colour like #112233')
    hex.value = '#ABC'
    act(() => { hex.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(changes[0].rows[0].colour).toEqual({ kind: 'hex', hex: '#aabbcc' })
  })

  it('shows the file count, the skipped multi-colour icons, and the problems of a row', () => {
    draw({ enabled: true, rows: [row('1', '1x'), row('2', '2x', '-red', { kind: 'hex', hex: '#ff0000' })] })
    expect(root.textContent).toContain('3 PNG files')
    expect(root.textContent).toContain('1 icon not drawn on rows with a colour')
    draw({ enabled: true, rows: [row('1', 'big')] })
    expect(root.textContent).toContain('“big” is not a size')
    expect(root.textContent).not.toContain('PNG file')
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
