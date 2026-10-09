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
 *
 * Expanding: the pointer leaves the iframe on the first outward pixel, before Figma has grown the window, and the iframe receives
 * no pointer events outside itself. So while the drag grows the window it stays `LEAD` px ahead of the pointer (the pointer is
 * still inside the iframe), and the exact size is applied when the drag ends, or after `IDLE` ms without events (the button was
 * released outside the iframe). Shrinking needs no lead: the pointer stays inside.
 */
const LEAD = 160
const IDLE = 700
export function useResizeHandles(onSize: (width: number, height: number) => void, limits: Limits): void {
  useEffect(() => {
    const cleanups: (() => void)[] = []

    const make = (dir: Dir) => {
      const el = document.createElement('div')
      el.setAttribute('data-resize-handle', dir)
      const common = 'position:fixed;z-index:1000;touch-action:none;user-select:none;'
      el.style.cssText =
        dir === 'both'
          ? `${common}right:0;bottom:0;width:20px;height:20px;cursor:nwse-resize;`
          : dir === 'x'
            ? `${common}right:0;top:0;bottom:20px;width:10px;cursor:ew-resize;`
            : `${common}left:0;right:20px;bottom:0;height:10px;cursor:ns-resize;`
      document.body.appendChild(el)

      let start: { sx: number; sy: number; w: number; h: number } | null = null
      let pending: { w: number; h: number } | null = null
      /** the size the pointer is asking for (without the lead) */
      let target: { w: number; h: number } | null = null
      let idle = 0
      let raf = 0

      const flush = () => {
        raf = 0
        if (pending) {
          const p = pending
          pending = null
          onSize(p.w, p.h)
        }
      }
      const settle = () => {
        if (raf) cancelAnimationFrame(raf)
        raf = 0
        pending = null
        if (target) onSize(target.w, target.h)
      }
      const end = (e?: PointerEvent) => {
        if (!start) return
        start = null
        if (idle) clearTimeout(idle)
        idle = 0
        settle()
        target = null
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
        const dx = e.screenX - start.sx
        const dy = e.screenY - start.sy
        const w = dir === 'y' ? start.w : clamp(start.w + dx, limits.minWidth, limits.maxWidth)
        const h = dir === 'x' ? start.h : clamp(start.h + dy, limits.minHeight, limits.maxHeight)
        target = { w, h }
        // growing: stay ahead of the pointer (never past the maximum)
        pending = {
          w: dir !== 'y' && dx > 0 ? Math.min(limits.maxWidth, w + LEAD) : w,
          h: dir !== 'x' && dy > 0 ? Math.min(limits.maxHeight, h + LEAD) : h
        }
        if (!raf) raf = requestAnimationFrame(flush)
        // no events for a moment: the button was probably released outside the iframe, so settle on the exact size
        if (idle) clearTimeout(idle)
        idle = window.setTimeout(settle, IDLE)
      })
      el.addEventListener('pointerup', end)
      el.addEventListener('pointercancel', end)
      el.addEventListener('lostpointercapture', () => end())

      cleanups.push(() => {
        if (raf) cancelAnimationFrame(raf)
        if (idle) clearTimeout(idle)
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
