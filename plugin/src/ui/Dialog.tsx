import { ComponentChildren, h } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import styles from '../styles.css'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * A modal panel with the behaviour assistive technology and keyboard users expect:
 * focus moves into it on open, Tab stays inside, Esc closes it (unless `busy`), and focus returns to where it was when it closes.
 */
export function Dialog(props: { label: string; onClose: () => void; busy?: boolean; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null)
  const onClose = useRef(props.onClose)
  const busy = useRef(!!props.busy)
  onClose.current = props.onClose
  busy.current = !!props.busy

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const root = ref.current
    const first = root?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? root)?.focus()
    return () => previous?.focus?.()
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !busy.current) {
      e.stopPropagation()
      onClose.current()
      return
    }
    if (e.key !== 'Tab' || !ref.current) return
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
    if (!items.length) {
      e.preventDefault()
      return
    }
    const firstEl = items[0]
    const lastEl = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === firstEl || active === ref.current)) {
      e.preventDefault()
      lastEl.focus()
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault()
      firstEl.focus()
    }
  }

  return (
    <div ref={ref} class={styles.overlay} role="dialog" aria-modal="true" aria-label={props.label} tabIndex={-1} onKeyDown={onKeyDown}>
      {props.children}
    </div>
  )
}
