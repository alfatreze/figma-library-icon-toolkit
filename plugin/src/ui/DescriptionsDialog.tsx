import { Button } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { Dialog } from './Dialog'
import { InfoTip } from './InfoTip'
import { WarnIcon } from './icons'
import { useDescriptions } from './hooks/useDescriptions'
import styles from './styles'
import { cx, plural } from './util'

const SHOWN = 40

export function DescriptionsDialog(props: { d: ReturnType<typeof useDescriptions>; labsReady: boolean; labsOn: boolean; onOpenSettings: () => void }) {
  const { d } = props
  const plan = d.plan
  return (
    <Dialog label="Descriptions and tags" onClose={d.close} busy={d.applying}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>Descriptions and tags</strong>
          <Button secondary onClick={d.close} disabled={d.applying}>Close</Button>
        </div>
        <div class={styles.muted}>
          {d.missing === 0 ? `All ${plural(d.total, 'component')} have a description.` : `${d.missing} of ${plural(d.total, 'component')} have no description.`} The description becomes the search tags in the export.
        </div>
      </div>
      <div class={styles.overlayBody}>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>1. Get the template</span>
          <div class={styles.muted}>A CSV with one row per component. Fill the <strong>description</strong> column with comma-separated words people would search for (for example <code>home, house, start</code>), in a spreadsheet or with help from someone who knows the icons.</div>
          <div class={styles.fieldRow} style={{ flexWrap: 'wrap' }}>
            <Button secondary onClick={() => d.downloadTemplate(true)} disabled={d.missing === 0}>Download: only without a description ({d.missing})</Button>
            <Button secondary onClick={() => d.downloadTemplate(false)} disabled={d.total === 0}>Download: all ({d.total})</Button>
            <InfoTip title="About the template">
              <span>Columns: <code>nodeId</code> (do not change it: it is how a row finds its component), <code>name</code>, <code>category</code>, <code>description</code>. An empty description cell never clears an existing description. Instances and loose frames are left out because they have no description of their own. Semicolon or tab separated files from spreadsheet programs are read too.</span>
            </InfoTip>
          </div>
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>2. Load the filled template</span>
          <div class={styles.fieldRow}>
            <label class={styles.fileBtn}>
              Choose CSV…
              <input type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }} onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) void d.load(f); (e.currentTarget as HTMLInputElement).value = '' }} />
            </label>
            {d.fileName && <span class={styles.muted}>{d.fileName}</span>}
            {d.fileName && <button class={styles.linkBtn} onClick={d.clear} disabled={d.applying}>Clear</button>}
          </div>
          {d.problems.map((m) => <div key={m} class={styles.sevWarn}>{m}</div>)}
        </div>

        {plan && (
          <div class={styles.section}>
            <span class={styles.sectionTitle}>3. Review</span>
            <div class={styles.releaseGrid}>
              <div class={styles.releaseCell}><strong>{plan.changes.length}</strong>to write</div>
              <div class={styles.releaseCell}><strong>{plan.unchanged}</strong>same</div>
              <div class={styles.releaseCell}><strong>{plan.empty}</strong>empty</div>
              <div class={styles.releaseCell}><strong>{plan.unknown.length}</strong>not found</div>
            </div>
            {plan.unknown.length > 0 && <div class={styles.muted}>Not found in the current scan (scan the same page again, or the row is not a component): {plan.unknown.slice(0, 6).join(', ')}{plan.unknown.length > 6 ? '…' : ''}</div>}
            {plan.changes.length === 0 && <div class={styles.muted}>Nothing to write: every row is empty, unchanged or not found.</div>}
            {plan.changes.slice(0, SHOWN).map((c) => (
              <div key={c.nodeId} style={{ padding: '4px 0' }}>
                <div class={styles.name}>{c.name}</div>
                <div class={styles.muted}>{c.from.trim() ? `${c.from.trim()}  →  ` : ''}{c.to}</div>
                <div class={styles.muted}>tags: {c.tags.join(' · ') || '(none)'}</div>
              </div>
            ))}
            {plan.changes.length > SHOWN && <div class={styles.muted}>+{plan.changes.length - SHOWN} more</div>}
          </div>
        )}

        {d.result && <div class={cx(styles.pill, styles.pillInfo)} style={{ height: 'auto', padding: 8, borderRadius: 8 }}>{d.result}</div>}
      </div>
      {plan && plan.changes.length > 0 && (
        <div class={styles.footer}>
          <div class={styles.footerNote}>
            {props.labsReady ? (
              <span class={cx(styles.muted, styles.pillWarn)} style={{ padding: '2px 8px', borderRadius: 6, display: 'inline-flex', gap: 6, alignItems: 'center' }}><WarnIcon /> Edits your Figma file; one undo step.</span>
            ) : (
              <span class={styles.muted}>
                Writing is a Labs feature{props.labsOn ? ': confirm you are working in a branch or a copy.' : ' (off).'}{' '}
                <button class={styles.linkBtn} onClick={props.onOpenSettings}>{props.labsOn ? 'Open Labs settings' : 'Enable Labs…'}</button>
              </span>
            )}
          </div>
          <Button onClick={d.apply} disabled={!props.labsReady || d.applying} loading={d.applying}>
            {`Write ${plural(plan.changes.length, 'description')}`}
          </Button>
        </div>
      )}
    </Dialog>
  )
}
