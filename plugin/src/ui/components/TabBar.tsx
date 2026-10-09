import { ComponentChildren, h } from 'preact'
import styles from '../styles'

export interface TabItem<T extends string> {
  id: T
  label: string
  badge?: ComponentChildren
  tone?: 'error' | 'warn'
}

/** Tabs with the WAI-ARIA keyboard pattern (arrows, Home, End; roving tabindex). Used by the results tabs and by Settings. */
export function TabBar<T extends string>(props: { tabs: TabItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  const onKeyDown = (e: KeyboardEvent) => {
    const i = props.tabs.findIndex((t) => t.id === props.value)
    const n = props.tabs.length
    const next = e.key === 'ArrowRight' ? props.tabs[(i + 1) % n] : e.key === 'ArrowLeft' ? props.tabs[(i - 1 + n) % n] : e.key === 'Home' ? props.tabs[0] : e.key === 'End' ? props.tabs[n - 1] : null
    if (!next) return
    e.preventDefault()
    props.onChange(next.id)
    requestAnimationFrame(() => ((e.currentTarget as HTMLElement).querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus())
  }
  return (
    <div class={styles.tabs} role="tablist" aria-label={props.label} onKeyDown={onKeyDown}>
      {props.tabs.map((t) => {
        const active = t.id === props.value
        return (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={active} tabIndex={active ? 0 : -1} class={`${styles.tab} ${active ? styles.tabActive : ''}`} onClick={() => props.onChange(t.id)}>
            {t.label}
            {t.badge !== undefined && <span class={`${styles.count} ${t.tone === 'error' ? styles.countError : t.tone === 'warn' ? styles.countWarn : ''}`}>{t.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}
