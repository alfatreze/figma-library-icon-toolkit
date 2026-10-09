import { h } from 'preact'
import { useState } from 'preact/hooks'
import { TARGETS, TargetKey } from '../../core/generators'
import styles from '../styles'
import { Settings } from '../../types'
import { OverviewRow, kb } from '../overview'

/** The formats people choose first; the rest sit behind "More formats" unless one of them is already on. */
const MAIN: TargetKey[] = ['svg', 'sprite', 'html', 'angularModern', 'react', 'webComponent']

/**
 * One list of export formats, used by Settings → Output and by the Export dialog so the choice always looks and behaves the same.
 * Each card: checkbox, name, one-line purpose, and the real size when the overview has been computed.
 */
export function FormatCards(props: { formats: Settings['formats']; onToggle: (key: TargetKey, on: boolean) => void; rows: OverviewRow[] | null }) {
  const extras = TARGETS.filter((t) => !MAIN.includes(t.key))
  const [more, setMore] = useState(() => extras.some((t) => props.formats[t.key]))
  const shown = TARGETS.filter((t) => MAIN.includes(t.key) || more)
  const size = (key: TargetKey) => {
    const r = props.rows?.find((x) => x.id === key)
    return r && r.files ? `${r.files} ${r.files === 1 ? 'file' : 'files'} · ${kb(r.bytes)}` : ''
  }
  return (
    <div>
      <div class={styles.fmtList}>
        {shown.map((t) => {
          const on = props.formats[t.key]
          return (
            <label key={t.key} class={`${styles.fmt} ${on ? styles.fmtOn : ''}`}>
              <input type="checkbox" class={styles.srOnly} checked={on} onChange={(e) => props.onToggle(t.key, (e.currentTarget as HTMLInputElement).checked)} />
              <span class={styles.fmtBox} aria-hidden="true">{on ? '✓' : ''}</span>
              <span>
                <span class={styles.fmtName}>{t.label}</span>
                <span class={styles.fmtHint}>{t.hint}</span>
              </span>
              <span class={styles.fmtSize}>{on ? size(t.key) : ''}</span>
            </label>
          )
        })}
      </div>
      <div style={{ marginTop: 8 }}>
        <button type="button" class={styles.linkBtn} onClick={() => setMore(!more)} aria-expanded={more}>
          {more ? 'Fewer formats' : `More formats (${extras.map((t) => t.label).join(', ')})`}
        </button>
      </div>
    </div>
  )
}
