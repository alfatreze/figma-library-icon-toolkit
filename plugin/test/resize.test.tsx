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
const fire = (el: HTMLElement, type: string, x: number, y: number, buttons = 1) => {
  const e = new MouseEvent(type, { screenX: x, screenY: y, buttons, button: 0, bubbles: true })
  Object.defineProperty(e, 'pointerId', { value: 1 })
  el.dispatchEvent(e)
}

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

const last = () => sizes[sizes.length - 1]

describe('window resize handles', () => {
  it('shrinking follows the pointer exactly', () => {
    const el = handle('both')
    fire(el, 'pointerdown', 1000, 800)
    fire(el, 'pointermove', 940, 730)
    vi.advanceTimersByTime(5)
    expect(last()).toEqual([440, 530])
  })

  it('expanding stays ahead of the pointer so it never leaves the iframe, and settles on the exact size when the drag ends', () => {
    const el = handle('both')
    fire(el, 'pointerdown', 1000, 800)
    fire(el, 'pointermove', 1080, 850)
    vi.advanceTimersByTime(5)
    expect(last()).toEqual([580 + 160, 650 + 160])
    fire(el, 'pointerup', 1080, 850, 0)
    expect(last()).toEqual([580, 650])
  })

  it('settles on the exact size when the button is released outside the iframe (no events arrive)', () => {
    const el = handle('x')
    fire(el, 'pointerdown', 1000, 800)
    fire(el, 'pointermove', 1100, 800)
    vi.advanceTimersByTime(5)
    expect(last()[0]).toBe(600 + 160)
    vi.advanceTimersByTime(800)
    expect(last()).toEqual([600, 600])
  })

  it('never asks for more than the maximum, with or without the lead', () => {
    const el = handle('both')
    fire(el, 'pointerdown', 1000, 800)
    fire(el, 'pointermove', 2000, 2000)
    vi.advanceTimersByTime(5)
    expect(last()).toEqual([1000, 1100])
  })

  it('moves only the axis of an edge handle', () => {
    const y = handle('y')
    fire(y, 'pointerdown', 1000, 800)
    fire(y, 'pointermove', 1300, 850)
    vi.advanceTimersByTime(5)
    expect(last()[0]).toBe(500)
    expect(last()[1]).toBe(650 + 160)
  })

  it('a plain click without movement changes nothing', () => {
    const el = handle('both')
    fire(el, 'pointerdown', 1000, 800)
    fire(el, 'pointerup', 1000, 800, 0)
    expect(sizes).toEqual([])
  })
})
