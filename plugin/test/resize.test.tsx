import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResizeHandles } from '../src/ui/resize'

const LIMITS = { minWidth: 360, minHeight: 460, maxWidth: 1000, maxHeight: 1100 }
let root: HTMLDivElement
let sizes: [number, number][]

function Probe() {
  useResizeHandles((w, h) => sizes.push([w, h]), LIMITS)
  return <div />
}

const handle = (dir: string) => document.querySelector(`[data-resize-handle="${dir}"]`) as HTMLElement
/** a pointer event at (x, y) in the iframe's own coordinates; outside the iframe x / y simply exceed its size, as with pointer capture */
const fire = (el: HTMLElement, type: string, x: number, y: number, buttons = 1) => {
  const e = new MouseEvent(type, { clientX: x, clientY: y, buttons, button: 0, bubbles: true })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  el.dispatchEvent(e)
}
const frame = () => vi.advanceTimersByTime(20)
const last = () => sizes[sizes.length - 1]

beforeEach(() => {
  vi.useFakeTimers()
  sizes = []
  window.innerWidth = 500
  window.innerHeight = 600
  ;(HTMLElement.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {}
  ;(HTMLElement.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => {}
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  root = document.createElement('div')
  document.body.appendChild(root)
  act(() => render(<Probe />, root))
})
afterEach(() => {
  act(() => render(null, root))
  root.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('window resize handles (size = pointer position in the iframe + the grab offset)', () => {
  it('the window edge stays exactly under the pointer, outward and inward', () => {
    const el = handle('both')
    fire(el, 'pointerdown', 490, 590) // grabbed 10 px from the right and bottom edge
    fire(el, 'pointermove', 590, 690) // outside the iframe: pointer capture keeps the events coming
    frame()
    expect(last()).toEqual([600, 700])
    fire(el, 'pointermove', 440, 530)
    frame()
    expect(last()).toEqual([450, 540])
  })

  it('never runs ahead of the pointer: the same pointer position always gives the same size', () => {
    const el = handle('x')
    fire(el, 'pointerdown', 495, 300)
    for (const x of [520, 700, 560, 700, 520]) {
      fire(el, 'pointermove', x, 300)
      frame()
      expect(last()[0]).toBe(x + 5)
    }
  })

  it('does not depend on how long the drag takes or on pauses', () => {
    const el = handle('both')
    fire(el, 'pointerdown', 495, 595)
    fire(el, 'pointermove', 595, 595)
    frame()
    vi.advanceTimersByTime(10_000)
    expect(last()).toEqual([600, 600])
    fire(el, 'pointermove', 596, 595)
    frame()
    expect(last()).toEqual([601, 600])
  })

  it('does not resend a size that has not changed', () => {
    const el = handle('x')
    fire(el, 'pointerdown', 495, 300)
    fire(el, 'pointermove', 595, 300)
    frame()
    fire(el, 'pointermove', 595, 301)
    frame()
    expect(sizes).toHaveLength(1)
  })

  it('stays within the limits', () => {
    const el = handle('both')
    fire(el, 'pointerdown', 495, 595)
    fire(el, 'pointermove', 5000, 5000)
    frame()
    expect(last()).toEqual([1000, 1100])
    fire(el, 'pointermove', -50, -50)
    frame()
    expect(last()).toEqual([360, 460])
  })

  it('an edge handle moves only its own axis', () => {
    const y = handle('y')
    fire(y, 'pointerdown', 300, 595)
    fire(y, 'pointermove', 900, 695)
    frame()
    expect(last()).toEqual([500, 700])
    const x = handle('x')
    sizes.length = 0
    fire(x, 'pointerdown', 495, 300)
    fire(x, 'pointermove', 645, 900)
    frame()
    expect(last()).toEqual([650, 600])
  })

  it('a released button ends the drag even when the release happened outside the iframe', () => {
    const el = handle('x')
    fire(el, 'pointerdown', 495, 300)
    fire(el, 'pointermove', 595, 300)
    frame()
    fire(el, 'pointermove', 700, 300, 0) // back over the iframe with no button down
    frame()
    expect(last()).toEqual([600, 600])
  })

  it('a plain click without movement changes nothing', () => {
    const el = handle('both')
    fire(el, 'pointerdown', 495, 595)
    fire(el, 'pointerup', 495, 595, 0)
    expect(sizes).toEqual([])
  })
})
