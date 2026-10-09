import { useEffect } from 'preact/hooks'

interface Limits {
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

type Dir = 'both' | 'x' | 'y'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Window resize handles (right edge, bottom edge, corner).
 *
 * Why not the stock `useWindowResize` hook: it recreates its handle elements whenever the component re-renders,
 * and the plugin re-rendered on every resize step, which destroyed the handle (and its pointer capture) mid-drag.
 * Here the handles are created once, size is never kept in React state, deltas use `screenX/Y` (the iframe itself
 * moves under the pointer while Figma resizes it, so client coordinates would feed back), and a drag ends cleanly
 * if the button is released outside the iframe.
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
          ? `${common}right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;`
          : dir === 'x'
            ? `${common}right:0;top:0;bottom:16px;width:8px;cursor:ew-resize;`
            : `${common}left:0;right:16px;bottom:0;height:8px;cursor:ns-resize;`
      document.body.appendChild(el)

      let start: { sx: number; sy: number; w: number; h: number } | null = null
      let pending: { w: number; h: number } | null = null
      let raf = 0

      const flush = () => {
        raf = 0
        if (pending) {
          const p = pending
          pending = null
          onSize(p.w, p.h)
        }
      }
      const end = (e?: PointerEvent) => {
        if (!start) return
        start = null
        if (raf) cancelAnimationFrame(raf)
        flush()
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
        start = { sx: e.screenX, sy: e.screenY, w: window.innerWidth, h: window.innerHeight }
        el.setPointerCapture(e.pointerId)
      })
      el.addEventListener('pointermove', (e) => {
        if (!start) return
        if (e.buttons === 0) {
          end(e)
          return
        }
        const w = clamp(start.w + (e.screenX - start.sx), limits.minWidth, limits.maxWidth)
        const h = dir === 'x' ? start.h : clamp(start.h + (e.screenY - start.sy), limits.minHeight, limits.maxHeight)
        pending = { w: dir === 'y' ? start.w : w, h }
        if (!raf) raf = requestAnimationFrame(flush)
      })
      el.addEventListener('pointerup', end)
      el.addEventListener('pointercancel', end)
      el.addEventListener('lostpointercapture', () => end())

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
