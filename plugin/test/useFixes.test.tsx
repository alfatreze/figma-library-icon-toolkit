import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, FixCandidate, ScanSummary } from '../src/types'
import { useFixes } from '../src/ui/hooks/useFixes'

const send = (name: string, ...args: unknown[]) => (window.onmessage as ((e: MessageEvent) => void) | null)?.(new MessageEvent('message', { data: { pluginMessage: [name, ...args] } }))
const fix = (id: string, extra: Partial<FixCandidate> = {}) => ({ id, kind: 'layer-names', confidence: 'high', actions: ['apply'], ...extra }) as unknown as FixCandidate

let root: HTMLDivElement
let latest: ReturnType<typeof useFixes>
const summary = {} as ScanSummary
const fixes = [fix('a'), fix('b', { kind: 'wrap-loose' }), fix('c', { confidence: 'low' })]
function Probe() {
  latest = useFixes(fixes, summary, DEFAULT_SETTINGS, { width: 24, height: 24 })
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

describe('useFixes', () => {
  it('pre-selects only safe, high-confidence fixes once per scan', () => {
    expect(latest.selected.map((f) => f.id)).toEqual(['a'])
  })

  it('records per-fix results sent by the main thread and treats a fixed one as done', () => {
    act(() => send('FIX_RESULT', { id: 'a', ok: true, message: '' }))
    expect(latest.results.a.ok).toBe(true)
    expect(latest.fixable(fixes[0])).toBe(false)
    expect(latest.selected).toEqual([])
  })

  it('closes the confirmation and clears the selection when Figma reports the batch done', () => {
    act(() => latest.review(fixes))
    expect(latest.confirmOpen).toBe(true)
    expect(latest.selected.map((f) => f.id)).toEqual(['a', 'b']) // low confidence stays out of "fix all"
    act(() => latest.apply())
    expect(latest.applying).toBe(true)
    act(() => send('FIXES_APPLIED', 2, 0))
    expect(latest.applying).toBe(false)
    expect(latest.confirmOpen).toBe(false)
    expect(latest.selected).toEqual([])
  })

  it('chooses an action per fix and falls back to the first one', () => {
    expect(latest.actionOf(fixes[0])).toBe('apply')
    act(() => latest.setAction('a', 'detach' as never))
    expect(latest.actionOf(fixes[0])).toBe('detach')
  })

  it('reset clears results, actions and open groups', () => {
    act(() => send('FIX_RESULT', { id: 'b', ok: false, message: 'x' }))
    act(() => latest.toggleGroup('layer-names'))
    act(() => latest.reset())
    expect(latest.results).toEqual({})
    expect(latest.groupOpen.size).toBe(0)
  })
})
