import { Button } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { HealthReport, UNUSED_NOTE } from '../core/report'
import { Dialog } from './Dialog'
import styles from './styles'
import { cx, plural } from './util'

const verdictClass = (v: HealthReport['verdict']) => (v === 'good' ? styles.sevInfo : v === 'fair' ? styles.sevWarn : styles.sevError)
const areaClass = (s: 'ok' | 'notes' | 'attention' | 'blocked') => (s === 'blocked' ? styles.sevError : s === 'attention' ? styles.sevWarn : styles.muted)

/** Report… in the Issues tab: what the report says, and the files to hand to someone who does not open Figma */
export function ReportDialog(props: { report: HealthReport; onHtml: () => void; onMarkdown: () => void; onFixPlan: () => void; onClose: () => void }) {
  const r = props.report
  const t = r.totals
  const c = r.changes
  return (
    <Dialog label="Library report" onClose={props.onClose}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>Library report</strong>
          <Button secondary onClick={props.onClose}>Close</Button>
        </div>
        <div class={styles.muted}>Read-only. Nothing is changed in your Figma file.</div>
      </div>
      <div class={styles.overlayBody}>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Summary</span>
          <div>
            <strong class={verdictClass(r.verdict)}>Library health: {r.verdict}</strong> <span class={styles.muted}>{r.tierLabel} · audit level {r.profile} · grid {r.grid}</span>
          </div>
          <div class={styles.releaseGrid}>
            <div class={styles.releaseCell}><strong>{t.readyPct}%</strong>ready</div>
            <div class={styles.releaseCell}><strong>{t.blocked}</strong>blocked</div>
            <div class={styles.releaseCell}><strong>{t.warned}</strong>warnings</div>
            <div class={styles.releaseCell}><strong>{r.autoFixable}</strong>auto-fixable</div>
          </div>
          <div class={styles.muted}>
            {plural(t.icons, 'icon')} scanned. {r.coverage.descriptions}% of components have a description, {r.coverage.boundColours}% of icons use colour variables.
          </div>
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>By area</span>
          {r.areas.map((a) => (
            <div key={a.step} class={styles.fieldRow}>
              <span class={styles.grow}>{a.step}. {a.title}</span>
              <span class={cx(areaClass(a.status))}>{a.status === 'ok' ? 'ok' : a.status === 'notes' ? `${plural(a.notes, 'icon')} with notes` : a.status === 'blocked' ? `${plural(a.errors, 'icon')} blocked` : `${plural(a.warnings, 'icon')} to look at`}</span>
            </div>
          ))}
        </div>

        {r.unused.of > 0 && (
          <div class={styles.section}>
            <span class={styles.sectionTitle}>Unused</span>
            <div>{r.unused.count} of {plural(r.unused.of, 'component')} are not placed in the scanned pages.</div>
            <div class={styles.muted}>{UNUSED_NOTE}</div>
          </div>
        )}

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Changes</span>
          {c ? (
            <div>
              {c.added} added · {c.removed} removed · {c.renamed} renamed · {c.changed} changed · {c.recoloured} recoloured
              <div class={styles.muted}>Compared with: {c.baseline}. {c.breaking ? 'Breaking: needs a major version.' : `Suggested bump: ${c.bump}.`}</div>
            </div>
          ) : (
            <div class={styles.muted}>No baseline is selected, so the report has no changes section. Choose one in the Export dialog (Version &amp; identity).</div>
          )}
        </div>
      </div>
      <div class={styles.footer} style={{ flexWrap: 'wrap' }}>
        <div class={styles.footerNote}>
          <button class={styles.linkBtn} onClick={props.onMarkdown}>Markdown</button>
          <button class={styles.linkBtn} onClick={props.onFixPlan} data-hint="Every finding, one row per icon, in the order to fix a library">Fix plan (.md)</button>
        </div>
        <Button onClick={props.onHtml}>Download HTML report</Button>
      </div>
    </Dialog>
  )
}
