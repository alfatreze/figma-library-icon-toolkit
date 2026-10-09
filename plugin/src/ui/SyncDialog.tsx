import { Button } from '@create-figma-plugin/ui'
import { Dialog } from './Dialog'
import { h } from 'preact'
import styles from './styles'
import { BlockIcon, CheckIcon, WarnIcon } from './icons'
import { plural } from './util'

export interface SyncPlan {
  added: string[]
  changed: string[]
  removed: string[]
  unchanged: number
}

export interface SyncResult {
  committed?: { branch: string; sha: string | null; files: number; pushed?: boolean; links?: { provider: 'github' | 'gitlab' | null; base: string; branch: string; compare: string | null } } | null
  /** pull / merge request text generated for this export (when pushing) */
  description?: { title: string; body: string }
}


export function SyncDialog(props: {
  plan: SyncPlan
  subdir: string
  commit: boolean
  branch: string
  sending: boolean
  result: SyncResult | null
  error: string | null
  push: boolean
  onOpen: (url: string) => void
  onCopy: (text: string) => void
  onCancel: () => void
  onSend: () => void
}) {
  const { plan } = props
  const nothing = !plan.added.length && !plan.changed.length && !plan.removed.length
  const list = (title: string, items: string[]) =>
    items.length ? (
      <div class={styles.section}>
        <span class={styles.sectionTitle}>{title} · {items.length}</span>
        <div class={styles.mono} style={{ maxHeight: 120, overflow: 'auto' }}>{items.slice(0, 60).map((i) => <div key={i}>{i}</div>)}{items.length > 60 && <div class={styles.muted}>+{items.length - 60} more</div>}</div>
      </div>
    ) : null
  return (
    <Dialog label="Send to project" onClose={props.onCancel} busy={props.sending}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>Send to project</strong>
          <Button secondary onClick={props.onCancel} disabled={props.sending}>{props.result ? 'Close' : 'Cancel'}</Button>
        </div>
      </div>
      <div class={styles.overlayBody}>
        <div class={styles.muted}>Dry run: nothing has been written yet. Target folder: <code>{props.subdir || '.'}</code>{props.commit && props.push ? <span> · Will commit on <code>{props.branch}</code> and push it to origin. The default branch is never pushed to.</span> : null}</div>
        {props.error && <div class={styles.fixResult + ' ' + styles.sevError}><BlockIcon /> <span>{props.error}</span></div>}
        {props.result && (
          <div class={styles.fixResult + ' ' + styles.sevInfo}>
            <CheckIcon />
            <span>
              Written.{props.result.committed ? ` Committed ${props.result.committed.sha ? props.result.committed.sha + ' ' : '(no changes) '}on ${props.result.committed.branch}${props.result.committed.pushed ? ' and pushed to origin' : ''}.` : ''}
            </span>
          </div>
        )}
        {props.result?.committed?.pushed && (
          <div class={styles.section}>
            <span class={styles.sectionTitle}>Next: review and merge</span>
            <div class={styles.fieldRow}>
              {props.result.committed.links?.compare ? (
                <Button onClick={() => props.onOpen(props.result!.committed!.links!.compare!)}>
                  {props.result.committed.links.provider === 'gitlab' ? 'Open merge request page' : 'Open pull request page'}
                </Button>
              ) : (
                <span class={styles.muted}>Open a pull or merge request for <code>{props.result.committed.branch}</code> on your git host.</span>
              )}
              {props.result.description && <Button secondary onClick={() => props.onCopy(`${props.result!.description!.title}\n\n${props.result!.description!.body}`)}>Copy description</Button>}
            </div>
            {props.result.description && (
              <details class={styles.muted}>
                <summary style={{ cursor: 'pointer' }}>{props.result.description.title}</summary>
                <pre class={styles.mono} style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', maxHeight: 160, overflow: 'auto' }}>{props.result.description.body}</pre>
              </details>
            )}
          </div>
        )}
        <div class={styles.releaseGrid}>
          <div class={styles.releaseCell}><strong>{plan.added.length}</strong>added</div>
          <div class={styles.releaseCell}><strong>{plan.changed.length}</strong>changed</div>
          <div class={styles.releaseCell}><strong>{plan.removed.length}</strong>removed</div>
          <div class={styles.releaseCell}><strong>{plan.unchanged}</strong>same</div>
        </div>
        {plan.removed.length > 0 && (
          <div class={styles.muted}><WarnIcon /> Removed files are only ones created by an earlier sync (listed in <code>.icon-toolkit.json</code>); your own files are never deleted.</div>
        )}
        {list('Added', plan.added)}
        {list('Changed', plan.changed)}
        {list('Removed', plan.removed)}
        {nothing && <div class={styles.muted}>The project folder is already up to date.</div>}
      </div>
      {!props.result && (
        <div class={styles.footer}>
          <Button fullWidth onClick={props.onSend} loading={props.sending} disabled={props.sending || nothing && !props.commit}>
            {props.commit ? `Write ${plural(plan.added.length + plan.changed.length + plan.removed.length, 'change')}, commit${props.push ? ' and push' : ''}${props.branch ? ` to ${props.branch}` : ''}` : `Write ${plural(plan.added.length + plan.changed.length + plan.removed.length, 'change')}`}
          </Button>
        </div>
      )}
    </Dialog>
  )
}
