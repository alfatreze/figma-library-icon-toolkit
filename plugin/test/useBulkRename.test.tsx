import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BulkRenameDialog } from '../src/ui/BulkRenameDialog'
import { useBulkRename } from '../src/ui/hooks/useBulkRename'
import { Icon } from '../src/types'

// the UI kit's CSS modules cannot be loaded by vitest: plain elements are enough to test the dialog
vi.mock('@create-figma-plugin/ui', () => ({
  Button: (p: { children?: unknown; disabled?: boolean; onClick?: () => void }) => <button disabled={p.disabled} onClick={p.onClick}>{p.children as never}</button>,
  Checkbox: (p: { value: boolean; onValueChange: (v: boolean) => void; children?: unknown }) => <label><input type="checkbox" checked={p.value} onChange={(e) => p.onValueChange((e.currentTarget as HTMLInputElement).checked)} />{p.children as never}</label>,
  Dropdown: (p: { value: string; options: { value: string; text: string }[]; onValueChange: (v: string) => void }) => <select value={p.value} onChange={(e) => p.onValueChange((e.currentTarget as HTMLSelectElement).value)}>{p.options.map((o) => <option value={o.value}>{o.text}</option>)}</select>,
  Textbox: (p: { value: string; onValueInput: (v: string) => void; placeholder?: string }) => <input value={p.value} placeholder={p.placeholder} onInput={(e) => p.onValueInput((e.currentTarget as HTMLInputElement).value)} />,
  SegmentedControl: (p: { value: string; options: { value: string; children: unknown }[]; onValueChange: (e: { currentTarget: { value: string } }) => void }) => <div>{p.options.map((o) => <button onClick={() => p.onValueChange({ currentTarget: { value: o.value } })}>{o.children as never}</button>)}</div>
}))

const send = (name: string, ...args: unknown[]) => (window.onmessage as ((e: MessageEvent) => void) | null)?.(new MessageEvent('message', { data: { pluginMessage: [name, ...args] } }))
const icon = (nodeId: string, layerName: string): Icon => ({ nodeId, layerName, sourceKind: 'component', variantProps: {} }) as unknown as Icon

let root: HTMLDivElement
let latest: ReturnType<typeof useBulkRename>
const all = [icon('1:1', 'Arrow Left'), icon('1:2', 'arrow-right'), icon('1:3', 'Arrow Up')]
const shown = [all[0]]
function Probe() {
  latest = useBulkRename(all, shown)
  return <div />
}

beforeEach(() => {
  root = document.createElement('div')
  document.body.appendChild(root)
  act(() => render(<Probe />, root))
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
})

describe('useBulkRename', () => {
  it('plans live from the rules and the scope', () => {
    expect(latest.plan.changes).toEqual([])
    act(() => latest.set({ caseStyle: 'kebab' }))
    expect(latest.plan.changes.map((c) => c.to)).toEqual(['arrow-left', 'arrow-up'])
    act(() => latest.setScope('shown'))
    expect(latest.plan.changes.map((c) => c.to)).toEqual(['arrow-left'])
    expect(latest.kebab).toEqual({ total: 1, off: 1 })
  })
  it('a bad pattern gives a message and no plan', () => {
    act(() => latest.set({ regex: true, find: '(' }))
    expect(latest.problem).toMatch(/not a valid/)
    expect(latest.plan.changes).toEqual([])
  })
  it('shows what Figma did, and clears the rules', () => {
    act(() => latest.set({ caseStyle: 'kebab' }))
    act(() => latest.apply())
    expect(latest.applying).toBe(true)
    act(() => send('RENAMES_APPLIED', 2, 1, 0, ''))
    expect(latest.applying).toBe(false)
    expect(latest.result).toContain('2 layers renamed')
    expect(latest.result).toContain('1 left alone')
    expect(latest.plan.changes).toEqual([])
  })
  it('applying with nothing to rename does nothing', () => {
    act(() => latest.apply())
    expect(latest.applying).toBe(false)
  })
})

describe('BulkRenameDialog', () => {
  const Dialog = (p: { labsReady: boolean }) => {
    const r = useBulkRename(all, shown)
    latest = r
    return <BulkRenameDialog r={r} labsReady={p.labsReady} labsOn={true} onOpenSettings={() => {}} />
  }
  it('previews the rename and needs Labs before it can write', () => {
    act(() => render(<Dialog labsReady={false} />, root))
    act(() => latest.set({ caseStyle: 'kebab' }))
    expect(root.textContent).toContain('Arrow Left')
    expect(root.textContent).toContain('arrow-left')
    expect(root.textContent).toContain('confirm you are working in a branch or a copy')
    const write = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Rename 2 layers'))!
    expect(write.hasAttribute('disabled')).toBe(true)
  })
  it('enables the write button when Labs is ready', () => {
    act(() => render(<Dialog labsReady={true} />, root))
    act(() => latest.set({ caseStyle: 'kebab' }))
    const write = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Rename 2 layers'))!
    expect(write.hasAttribute('disabled')).toBe(false)
  })
})
