import { ComponentChildren, h } from 'preact'
import styles from '../../styles.css'

export interface SegmentOption<T extends string> {
  value: T
  children: ComponentChildren
  disabled?: boolean
  title?: string
}

/**
 * One of N, as radio buttons. Replaces the UI kit's SegmentedControl so the active segment is clearly visible (raised, filled, bold)
 * and keyboard users get arrow-key movement with a single tab stop.
 */
export function Segmented<T extends string>(props: {
  value: T
  options: SegmentOption<T>[]
  onValueChange: (v: T) => void
  label?: string
  compact?: boolean
  disabled?: boolean
}) {
  const enabled = props.options.filter((o) => !o.disabled)
  const onKeyDown = (e: KeyboardEvent) => {
    const i = enabled.findIndex((o) => o.value === props.value)
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? enabled[(i + 1) % enabled.length] : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? enabled[(i - 1 + enabled.length) % enabled.length] : null
    if (!next || props.disabled) return
    e.preventDefault()
    props.onValueChange(next.value)
    requestAnimationFrame(() => ((e.currentTarget as HTMLElement).querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus())
  }
  return (
    <div class={`${styles.segmented} ${props.compact ? styles.segmentedCompact : ''}`} role="radiogroup" aria-label={props.label} onKeyDown={onKeyDown}>
      {props.options.map((o) => {
        const active = o.value === props.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={props.disabled || o.disabled}
            title={o.title}
            class={`${styles.segBtn} ${active ? styles.segBtnActive : ''}`}
            onClick={() => props.onValueChange(o.value)}
          >
            {o.children}
          </button>
        )
      })}
    </div>
  )
}
