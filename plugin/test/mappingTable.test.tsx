import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { explicitMapping, mappingKey, normaliseCssVar, setMappingEntry, tokenVarName, validCssVar } from '../src/core/tokens'
import { MappingDialog } from '../src/ui/MappingDialog'
import { DEFAULT_SETTINGS } from '../src/types'

vi.mock('@create-figma-plugin/ui', () => ({
  Button: (p: { children?: unknown; onClick?: () => void }) => <button onClick={p.onClick}>{p.children as never}</button>,
  Textbox: (p: { value: string; placeholder?: string; onValueInput: (v: string) => void }) => <input value={p.value} placeholder={p.placeholder} onInput={(e) => p.onValueInput((e.currentTarget as HTMLInputElement).value)} />
}))

describe('mapping text as data', () => {
  it('keys a variable by collection when it has one', () => {
    expect(mappingKey('color/icon', 'Semantic')).toBe('Semantic::color/icon')
    expect(mappingKey('color/icon')).toBe('color/icon')
  })
  it('normalises and validates CSS names', () => {
    expect(normaliseCssVar(' icon-color ')).toBe('--icon-color')
    expect(normaliseCssVar('--x')).toBe('--x')
    expect(normaliseCssVar('  ')).toBe('')
    expect(validCssVar('--icon-color_2')).toBe(true)
    expect(validCssVar('--a b')).toBe(false)
    expect(validCssVar('--a;b')).toBe(false)
  })
  it('sets, replaces and removes one line and keeps the rest (comments, order, other lines)', () => {
    let m = '# icons\ncolor/icon/muted = --icon-muted\n'
    m = setMappingEntry(m, 'color/icon/primary', 'Semantic', 'icon-primary')
    expect(m).toBe('# icons\ncolor/icon/muted = --icon-muted\nSemantic::color/icon/primary = --icon-primary')
    m = setMappingEntry(m, 'color/icon/primary', 'Semantic', '--ip')
    expect(m).toContain('Semantic::color/icon/primary = --ip')
    expect(m.match(/primary/g)).toHaveLength(1)
    m = setMappingEntry(m, 'color/icon/muted', undefined, '')
    expect(m).toBe('# icons\nSemantic::color/icon/primary = --ip')
    expect(setMappingEntry('', 'a', undefined, '')).toBe('')
  })
  it('reads the explicit name back, and the mapping then drives the token name', () => {
    const m = setMappingEntry('', 'color/icon/primary', 'Semantic', 'icon-primary')
    expect(explicitMapping(m, 'color/icon/primary', 'Semantic')).toBe('--icon-primary')
    expect(explicitMapping(m, 'color/icon/primary', 'Other')).toBe('')
    expect(tokenVarName('color/icon/primary', 'Semantic', { ...DEFAULT_SETTINGS.tokenNaming, mode: 'custom', mapping: m })).toBe('--icon-primary')
  })
})

describe('MappingDialog', () => {
  let root: HTMLDivElement
  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
  })
  afterEach(() => {
    act(() => render(null, root))
    root.remove()
  })
  const naming = { ...DEFAULT_SETTINGS.tokenNaming, mode: 'custom' as const, mapping: 'Semantic::color/icon/primary = --icon-primary' }
  const vars = [
    { variable: 'color/icon/primary', collection: 'Semantic', modes: { Light: '#1a1a1a', Dark: '#ffffff' } },
    { variable: 'color/icon/muted', collection: 'Semantic' }
  ]

  it('lists variables by collection with their colours per mode and the name they get', () => {
    act(() => render(<MappingDialog naming={naming} variables={vars} onChange={() => {}} onClose={() => {}} />, root))
    expect(root.textContent).toContain('Semantic')
    expect(root.textContent).toContain('color/icon/primary')
    expect(root.textContent).toContain('Light')
    expect(root.textContent).toContain('Dark')
    expect(root.textContent).toContain('one colour for every mode')
    expect(root.textContent).toContain('--icon-primary')
    expect(root.textContent).toContain('1 named by you')
  })

  it('editing a field changes only that variable\'s line', () => {
    const changes: string[] = []
    act(() => render(<MappingDialog naming={naming} variables={vars} onChange={(m) => changes.push(m)} onClose={() => {}} />, root))
    const inputs = Array.from(root.querySelectorAll('input'))
    const muted = inputs[0] // sorted: muted before primary
    ;(muted as HTMLInputElement).value = 'icon-muted'
    act(() => {
      muted.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(changes[0]).toBe('Semantic::color/icon/primary = --icon-primary\nSemantic::color/icon/muted = --icon-muted')
  })
})
