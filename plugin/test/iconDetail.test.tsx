import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { modeNames, modeStyle, slotColour, tileForMode } from '../src/core/iconDetail'
import { IconDetail } from '../src/ui/IconDetail'
import { DEFAULT_SETTINGS, Icon } from '../src/types'

vi.mock('@create-figma-plugin/ui', () => ({
  Button: (p: { children?: unknown; disabled?: boolean; onClick?: () => void }) => <button disabled={p.disabled} onClick={p.onClick}>{p.children as never}</button>,
  Checkbox: (p: { value: boolean; onValueChange: (v: boolean) => void; children?: unknown }) => <label><input type="checkbox" checked={p.value} onChange={(e) => p.onValueChange((e.currentTarget as HTMLInputElement).checked)} />{p.children as never}</label>,
  Textbox: (p: { value: string; onValueInput: (v: string) => void }) => <input value={p.value} onInput={(e) => p.onValueInput((e.currentTarget as HTMLInputElement).value)} />
}))

const slot = (index: number, hex: string, modes?: Record<string, string>, variable?: string) => ({ index, cssVar: index === 1 ? '--cmn-icon-color' : `--cmn-icon-color-${index}`, hex, uses: 1, ...(modes ? { modes } : {}), ...(variable ? { variable } : {}) })
const icon = (over: Partial<Icon> = {}): Icon =>
  ({
    key: 'k', name: 'home', layerName: 'icon/Home', pageName: 'Icons', sourceKind: 'component', width: 24, height: 24, categoryLabel: 'Nav', variantProps: {}, description: '', tags: [], findings: [], slots: [], hasStroke: false,
    nameOverride: null, outlined: false, canOutline: false, svgOk: true, standalone: '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>', kind: 'filled', ...over
  }) as unknown as Icon

describe('modes of an icon', () => {
  const themed = icon({ slots: [slot(1, '#1a1a1a', { Light: '#1a1a1a', Dark: '#ffffff' }, 'color/icon/primary'), slot(2, '#ff0000')] })
  it('lists the modes in order of appearance, and none for an icon without variable modes', () => {
    expect(modeNames(themed)).toEqual(['Light', 'Dark'])
    expect(modeNames(icon({ slots: [slot(1, '#000000')] }))).toEqual([])
  })
  it('a slot has its mode colour, or keeps the drawn colour when it has no such mode', () => {
    expect(slotColour(themed.slots[0], 'Dark')).toBe('#ffffff')
    expect(slotColour(themed.slots[1], 'Dark')).toBe('#ff0000')
    expect(slotColour(themed.slots[0], null)).toBe('#1a1a1a')
  })
  it('sets every slot variable for a mode', () => {
    expect(modeStyle(themed, 'Dark')).toBe('--cmn-icon-color:#ffffff;--cmn-icon-color-2:#ff0000')
    expect(modeStyle(themed, null)).toBe('')
  })
  it('picks a dark tile for light colours and a light tile otherwise', () => {
    expect(tileForMode(themed, 'Dark')).toBe('light') // the red second slot is not light: keep a light tile
    expect(tileForMode(icon({ slots: [slot(1, '#000000', { Light: '#000000', Dark: '#ffffff' })] }), 'Dark')).toBe('dark')
    expect(tileForMode(icon({ slots: [slot(1, '#000000', { Light: '#000000', Dark: '#ffffff' })] }), 'Light')).toBe('light')
    expect(tileForMode(icon(), null)).toBe('light')
  })
})

describe('IconDetail', () => {
  let root: HTMLDivElement
  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })
  afterEach(() => {
    act(() => render(null, root))
    root.remove()
  })
  const noop = () => {}
  const mount = (i: Icon, over: Record<string, unknown> = {}) =>
    act(() => render(<IconDetail icon={i} settings={DEFAULT_SETTINGS} included={true} changes={[]} index={1} count={3} onInclude={noop} onRename={noop} onOutline={noop} onLocate={noop} onStep={noop} onClose={noop} {...over} />, root))

  it('shows the preview, source, colours, findings and the way to use it', () => {
    mount(icon({ slots: [slot(1, '#1a1a1a', { Light: '#1a1a1a', Dark: '#ffffff' }, 'color/icon/primary')], findings: [{ ruleId: 'off-grid', severity: 'warn', message: 'Size 12×12 differs from library size 16×16.', fixHint: 'Resize the frame.' }] as never, description: 'house, start', tags: ['house', 'start'] }), { changes: ['changed'] })
    const t = root.textContent ?? ''
    for (const s of ['home', '2 / 3', 'icon/Home', 'Nav', 'color/icon/primary', 'Light #1a1a1a', 'Dark #ffffff', 'Off the library grid', 'Size 12×12', 'Resize the frame.', 'house, start', 'drawing since the baseline', 'Copy Angular']) expect(t, s).toContain(s)
  })
  it('switches the preview to a mode', () => {
    mount(icon({ slots: [slot(1, '#1a1a1a', { Light: '#1a1a1a', Dark: '#ffffff' })] }))
    const dark = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === 'Dark')!
    act(() => dark.click())
    expect(dark.getAttribute('aria-pressed')).toBe('true')
    expect(root.innerHTML).toMatch(/--cmn-icon-color: ?#ffffff/)
  })
  it('has no mode switch for an icon without variable modes', () => {
    mount(icon({ slots: [slot(1, '#000000')] }))
    expect(root.querySelector('[aria-label="Mode"]')).toBeNull()
  })
  it('steps through the list and is limited at both ends', () => {
    const steps: number[] = []
    mount(icon(), { index: 0, count: 2, onStep: (d: number) => steps.push(d) })
    expect(root.querySelector('[aria-label="Previous icon"]')!.hasAttribute('disabled')).toBe(true)
    act(() => (root.querySelector('[aria-label="Next icon"]') as HTMLElement).click())
    expect(steps).toEqual([1])
  })
})
