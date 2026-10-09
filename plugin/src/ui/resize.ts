import { useEffect } from 'preact/hooks'

interface Limits {
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

type Dir = 'both' | 'x' | 'y'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** handle thickness in px (the corner is a square) */
export const EDGE = 10
export const CORNER = 20

/**
 * Window resize handles (right edge, bottom edge, corner).
 *
 * The window is sized from the pointer's ABSOLUTE position inside the iframe, the method of Figma's own resize example and of
 * `useWindowResize` in @create-figma-plugin/ui: the iframe's top-left corner stays where it is while the window grows to the right
 * and down, so `clientX / clientY` (plus how far from the handle's outer edge the grab happened) is the size the window should have.
 * Pointer capture keeps the events coming when the pointer is outside the iframe, which is what lets the window grow. There are no
 * deltas, no screen coordinates and no guessing ahead of the pointer, so the window cannot jump or run ahead of the cursor.
 *
 * Why not the stock hook itself: it rebuilds its handles (dropping the pointer capture mid-drag) whenever the callback it is given
 * changes. Here the handles are created once. A drag ends on pointerup / pointercancel, or when a move arrives with no button down;
 * `lostpointercapture` is deliberately not used, a capture that is dropped while the button is still down would end the drag early.
 */
export function useResizeHandles(onSize: (width: number, height: number) => void, limits: Limits): void {
  useEffect(() => {
    const cleanups: (() => void)[] = []

    const make = (dir: Dir) => {
      const el = document.createElement('div')
      el.setAttribute('data-resize-handle', dir)
      const common = 'position:fixed;z-index:1000;touch-action:none;user-select:none;'
      el.style.cssText =
        dir === 'both'
          ? `${common}right:0;bottom:0;width:${CORNER}px;height:${CORNER}px;cursor:nwse-resize;`
          : dir === 'x'
            ? `${common}right:0;top:0;bottom:${CORNER}px;width:${EDGE}px;cursor:ew-resize;`
            : `${common}left:0;right:${CORNER}px;bottom:0;height:${EDGE}px;cursor:ns-resize;`
      document.body.appendChild(el)

      /** how far the pointer was from the window's right / bottom edge when it grabbed the handle */
      let toEdge: { x: number; y: number } | null = null
      let pending: { w: number; h: number } | null = null
      let last: { w: number; h: number } | null = null
      let raf = 0

      const flush = () => {
        raf = 0
        if (!pending) return
        const p = pending
        pending = null
        // the same size twice in a row would only make Figma do the work again
        if (last && last.w === p.w && last.h === p.h) return
        last = p
        onSize(p.w, p.h)
      }
      const end = (e?: PointerEvent) => {
        if (!toEdge) return
        toEdge = null
        if (raf) cancelAnimationFrame(raf)
        flush()
        last = null
        if (e) {
          try {
            el.releasePointerCapture(e.pointerId)
          } catch {
            /* already released */
          }
        }
      }

      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        // the handles sit on the window's right / bottom edge, so the distance to the outer edge is the viewport size minus the pointer position
        toEdge = { x: Math.max(0, window.innerWidth - e.clientX), y: Math.max(0, window.innerHeight - e.clientY) }
        el.setPointerCapture(e.pointerId)
      })
      el.addEventListener('pointermove', (e) => {
        if (!toEdge) return
        if (e.buttons === 0) {
          end(e)
          return
        }
        const w = dir === 'y' ? window.innerWidth : clamp(Math.round(e.clientX + toEdge.x), limits.minWidth, limits.maxWidth)
        const h = dir === 'x' ? window.innerHeight : clamp(Math.round(e.clientY + toEdge.y), limits.minHeight, limits.maxHeight)
        pending = { w, h }
        if (!raf) raf = requestAnimationFrame(flush)
      })
      el.addEventListener('pointerup', end)
      el.addEventListener('pointercancel', end)

      cleanups.push(() => {
        if (raf) cancelAnimationFrame(raf)
        el.remove()
      })
    }

    make('x')
    make('y')
    make('both')
    return () => cleanups.forEach((c) => c())
    // handles are created once; limits/onSize are stable by construction
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
