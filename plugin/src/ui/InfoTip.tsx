import { ComponentChildren, h } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import styles from '../styles.css'
import { InfoIcon } from './icons'

/** A clear (i) button that opens a popover with a longer explanation. Click, Enter/Space or focus to open; Esc or outside click closes. */
export function InfoTip(props: { title: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number }>({ left: 8, top: 8, width: 260 })
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)

  const place = () => {
    const el = btn.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(280, window.innerWidth - 24)
    const left = Math.max(8, Math.min(r.left - 8, window.innerWidth - width - 16))
    if (r.bottom > window.innerHeight * 0.6) setPos({ left, bottom: window.innerHeight - r.top + 6, width })
    else setPos({ left, top: r.bottom + 6, width })
  }

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    const close = () => setOpen(false)
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <span class={styles.infoWrap}>
      <button
        ref={btn}
        type="button"
        class={styles.infoBtn}
        aria-label={`More info: ${props.title}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          if (!open) place()
          setOpen(!open)
        }}
      >
        <InfoIcon />
      </button>
      {open && (
        <div ref={pop} role="tooltip" class={styles.infoPop} style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width }}>
          <div class={styles.infoTitle}>{props.title}</div>
          <div>{props.children}</div>
        </div>
      )}
    </span>
  )
}
