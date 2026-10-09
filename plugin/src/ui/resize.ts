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
 * no pointer events outside itself. So while the drag grows the window it stays a little ahead of the pointer (the pointer is
 * still inside the iframe). The lead follows the pointer's speed (`lead`): a slow drag keeps the window only a few pixels ahead,
 * a fast one more, never beyond `LEAD_MAX`, so the window does not run visibly ahead of the cursor. The exact size is applied when the drag ends; when the button is released outside the
 * iframe no event arrives, so it is applied as soon as the pointer is back over the iframe without a button pressed.
 * Shrinking needs no lead: the pointer stays inside.
 */
const LEAD_MIN = 12
const LEAD_MAX = 120
/** how long Figma takes to apply a resize (ms): the window must be ahead by the distance the pointer covers in that time */
const LATENCY = 100
/** the lead for a pointer growing the window at `speed` px per ms: small for a slow drag, larger only for a fast one (used only while growing) */
export const lead = (speed: number): number => Math.min(LEAD_MAX, LEAD_MIN + Math.max(0, speed) * LATENCY)
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
      /** previous sample, for the pointer's speed (smoothed, px per ms, growing only) */
      let prev = { t: 0, w: 0, h: 0, vw: 0, vh: 0 }
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
        prev = { t: Date.now(), w: start.w, h: start.h, vw: 0, vh: 0 }
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
        // growing: stay ahead of the pointer by what it covers while Figma applies the resize (never past the maximum)
        const now = Date.now()
        const dt = Math.max(1, now - prev.t)
        // smoothed over consecutive events; after a pause the old speed no longer says anything about the pointer
        const keep = dt > 120 ? 0 : 0.5
        const vw = keep * prev.vw + (1 - keep) * Math.max(0, (w - prev.w) / dt)
        const vh = keep * prev.vh + (1 - keep) * Math.max(0, (h - prev.h) / dt)
        prev = { t: now, w, h, vw, vh }
        pending = {
          w: dir !== 'y' && dx > 0 ? Math.min(limits.maxWidth, w + lead(vw)) : w,
          h: dir !== 'x' && dy > 0 ? Math.min(limits.maxHeight, h + lead(vh)) : h
        }
        if (!raf) raf = requestAnimationFrame(flush)
      })
      el.addEventListener('pointerup', end)
      el.addEventListener('pointercancel', end)
      el.addEventListener('lostpointercapture', () => end())

      // released outside the iframe: the next event over the iframe has no button down, and ends the drag
      const back = (e: PointerEvent) => {
        if (start && e.buttons === 0) end()
      }
      document.addEventListener('pointermove', back)

      cleanups.push(() => {
        if (raf) cancelAnimationFrame(raf)
        document.removeEventListener('pointermove', back)
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
