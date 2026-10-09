import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// the UI kit's CSS modules cannot be loaded by vitest: a plain button is enough to test the dialog
vi.mock('@create-figma-plugin/ui', () => ({
  Button: (p: { children?: unknown; disabled?: boolean; onClick?: () => void }) => <button disabled={p.disabled} onClick={p.onClick}>{p.children as never}</button>
}))
import { useDescriptions } from '../src/ui/hooks/useDescriptions'
import { Icon } from '../src/types'

const send = (name: string, ...args: unknown[]) => (window.onmessage as ((e: MessageEvent) => void) | null)?.(new MessageEvent('message', { data: { pluginMessage: [name, ...args] } }))
const icon = (nodeId: string, name: string, description = ''): Icon => ({ nodeId, name, description, categoryLabel: 'A', sourceKind: 'component' }) as unknown as Icon

let root: HTMLDivElement
let latest: ReturnType<typeof useDescriptions>
const icons = [icon('1:1', 'home'), icon('1:2', 'search', 'find')]
function Probe() {
  latest = useDescriptions(icons, 'cmn')
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

describe('useDescriptions', () => {
  it('counts the components without a description', () => {
    expect(latest.total).toBe(2)
    expect(latest.missing).toBe(1)
  })

  it('reads a filled template and plans the change', async () => {
    await act(async () => {
      await latest.load(new File(['nodeId,description\n1:1,"house, start"\n1:2,find\n'], 'x.csv'))
    })
    expect(latest.fileName).toBe('x.csv')
    expect(latest.plan?.changes.map((c) => c.name)).toEqual(['home'])
    expect(latest.plan?.unchanged).toBe(1)
  })

  it('reports a file that is not the template', async () => {
    await act(async () => {
      await latest.load(new File(['name,notes\nhome,x\n'], 'bad.csv'))
    })
    expect(latest.plan).toBeNull()
    expect(latest.problems[0]).toMatch(/nodeId/)
  })

  it('shows what Figma did and clears the loaded file afterwards', async () => {
    await act(async () => {
      await latest.load(new File(['nodeId,description\n1:1,house\n'], 'x.csv'))
    })
    act(() => latest.apply())
    expect(latest.applying).toBe(true)
    act(() => send('DESCRIPTIONS_APPLIED', 1, 0, 0, ''))
    expect(latest.applying).toBe(false)
    expect(latest.plan).toBeNull()
    expect(latest.result).toContain('1 description written')
    expect(latest.result).toContain('Cmd/Ctrl+Z')
  })

  it('applying with nothing to write does nothing', () => {
    act(() => latest.apply())
    expect(latest.applying).toBe(false)
  })
})

import { DescriptionsDialog } from '../src/ui/DescriptionsDialog'

describe('DescriptionsDialog', () => {
  const plan = { changes: [{ nodeId: '1:1', name: 'home', from: '', to: 'house, start', tags: ['house', 'start'] }], unchanged: 2, empty: 1, unknown: ['9:9'] }
  const d = (over: Record<string, unknown> = {}) => ({ open: true, show() {}, close() {}, total: 3, missing: 1, fileName: 'x.csv', problems: [], plan, applying: false, result: '', downloadTemplate() {}, load: async () => {}, clear() {}, apply() {}, ...over }) as unknown as ReturnType<typeof useDescriptions>

  it('shows the review and a Write button that needs Labs', () => {
    act(() => render(<DescriptionsDialog d={d()} labsReady={false} labsOn={true} onOpenSettings={() => {}} />, root))
    expect(root.textContent).toContain('1 of 3 components have no description')
    expect(root.textContent).toContain('house, start')
    expect(root.textContent).toContain('confirm you are working in a branch or a copy')
    const write = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Write 1 description'))!
    expect(write.hasAttribute('disabled')).toBe(true)
  })

  it('enables Write when Labs is ready', () => {
    act(() => render(<DescriptionsDialog d={d()} labsReady={true} labsOn={true} onOpenSettings={() => {}} />, root))
    const write = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Write 1 description'))!
    expect(write.hasAttribute('disabled')).toBe(false)
    expect(root.textContent).toContain('one undo step')
  })

  it('says so when every component already has a description', () => {
    act(() => render(<DescriptionsDialog d={d({ missing: 0, plan: null, fileName: '' })} labsReady={false} labsOn={false} onOpenSettings={() => {}} />, root))
    expect(root.textContent).toContain('All 3 components have a description')
  })
})

import { ReportDialog } from '../src/ui/ReportDialog'
import { buildHealth } from '../src/core/report'

describe('ReportDialog', () => {
  const icons = [icon('1:1', 'home'), icon('1:2', 'search', 'find')]
  const report = buildHealth({ title: 'cmn', generatedAt: '2026-10-10', icons, tier: 'T4', grid: { width: 16, height: 16, count: 2, total: 2, padding: 0, detected: true }, profile: 'standard', diff: null, baseline: null, skipped: 0 })

  it('summarises the library and offers the downloads', () => {
    const calls: string[] = []
    act(() => render(<ReportDialog report={report} onClose={() => {}} onHtml={() => calls.push('html')} onMarkdown={() => calls.push('md')} onFixPlan={() => calls.push('plan')} />, root))
    expect(root.textContent).toContain('Library health: good')
    expect(root.textContent).toContain('No baseline is selected')
    for (const b of Array.from(root.querySelectorAll('button'))) if (/HTML|Markdown|Fix plan/.test(b.textContent ?? '')) (b as HTMLButtonElement).click()
    expect(calls.sort()).toEqual(['html', 'md', 'plan'])
  })
})
