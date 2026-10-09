import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useScan } from '../src/ui/hooks/useScan'

// create-figma-plugin installs its listener as window.onmessage
const send = (name: string, ...args: unknown[]) => (window.onmessage as ((e: MessageEvent) => void) | null)?.(new MessageEvent('message', { data: { pluginMessage: [name, ...args] } }))
const row = (key: string) => ({ key }) as never

let root: HTMLDivElement
let latest: ReturnType<typeof useScan>
let starts = 0
function Probe() {
  latest = useScan(() => {
    starts++
  })
  return <div>{latest.raws.length}</div>
}

beforeEach(() => {
  vi.useFakeTimers()
  starts = 0
  root = document.createElement('div')
  document.body.appendChild(root)
  act(() => render(<Probe />, root))
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
  vi.useRealTimers()
})

describe('useScan', () => {
  it('collects batches and publishes them at most every 250 ms', () => {
    act(() => send('SCAN_START'))
    expect(latest.scanning).toBe(true)
    expect(starts).toBe(1)
    act(() => {
      for (let i = 0; i < 10; i++) send('SCAN_BATCH', [row('a' + i), row('b' + i)], i / 10)
    })
    expect(latest.raws.length).toBe(0) // not published yet
    act(() => {
      vi.advanceTimersByTime(260)
    })
    expect(latest.raws.length).toBe(20)
    expect(latest.progress).toBeCloseTo(0.9)
  })

  it('SCAN_DONE flushes immediately and a new scan clears the old rows', () => {
    act(() => send('SCAN_START'))
    act(() => send('SCAN_BATCH', [row('x')], 1))
    act(() => send('SCAN_DONE', { scanned: 1, skipped: [], adapters: {} }))
    expect(latest.raws.length).toBe(1)
    expect(latest.scanning).toBe(false)
    expect(latest.summary?.scanned).toBe(1)
    act(() => send('SCAN_START'))
    expect(latest.raws.length).toBe(0)
    expect(latest.summary).toBeNull()
    expect(starts).toBe(2)
  })

  it('an error keeps the partial rows and stops the spinner; a refused second scan does not', () => {
    act(() => send('SCAN_START'))
    act(() => send('SCAN_BATCH', [row('x')], 0.5))
    act(() => send('SCAN_ERROR', 'A scan is already running.'))
    expect(latest.scanning).toBe(true)
    expect(latest.scanError).toBeNull()
    act(() => send('SCAN_ERROR', 'Boom'))
    expect(latest.scanning).toBe(false)
    expect(latest.scanError).toBe('Boom')
    expect(latest.raws.length).toBe(1)
  })
})
