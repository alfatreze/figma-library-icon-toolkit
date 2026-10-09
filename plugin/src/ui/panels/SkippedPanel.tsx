import { h } from 'preact'
import { LocateIcon } from '../icons'
import styles from '../styles'
import { ScanSummary } from '../../types'
import { cx } from '../util'

/** the Skipped tab: layers the scan looked at but did not treat as icons */
export function SkippedPanel(p: { summary: ScanSummary | null; onLocate: (nodeId: string) => void }) {
  const skipped = p.summary?.skipped ?? []
  return (
      <div class={styles.list}>
        <div class={styles.muted} style={{ padding: '8px 0' }}>
          Layers the scan looked at but did not treat as icons. Change <em>Scan mode</em> or <em>Max icon size</em> in Settings to include them.
        </div>
        {skipped.length === 0 && <div class={styles.empty}>Nothing was skipped.</div>}
        {skipped.map((s) => (
          <div class={styles.skipRow} key={s.nodeId}>
            <div style={{ minWidth: 0 }}>
              <div class={cx(styles.name, styles.ellipsis)} title={s.name}>{s.name}</div>
              <div class={styles.muted}>{s.reason}</div>
            </div>
            <button class={styles.iconBtn} onClick={() => p.onLocate(s.nodeId)} aria-label={`Locate ${s.name}`} data-hint="Locate on canvas"><LocateIcon /> Locate</button>
          </div>
        ))}
      </div>

  )
}
