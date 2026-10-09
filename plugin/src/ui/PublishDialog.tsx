import { Button } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { PublishPlan } from '../core/gitHost'
import { Dialog } from './Dialog'
import { BlockIcon, CheckIcon, WarnIcon } from './icons'
import { PublishResult } from './hooks/usePublish'
import styles from './styles'
import { Settings } from '../types'
import { plural } from './util'

export function PublishDialog(props: {
  repo: Settings['repo']
  planning: boolean
  plan: PublishPlan | null
  publishing: { done: number; total: number } | null
  result: PublishResult | null
  error: string | null
  description: { title: string; body: string }
  onOpen: (url: string) => void
  onCopy: (text: string) => void
  onCancel: () => void
  onSend: () => void
}) {
  const { plan, result } = props
  const host = props.repo.provider === 'github' ? 'GitHub' : 'GitLab'
  const request = props.repo.provider === 'github' ? 'pull request' : 'merge request'
  const nothing = !!plan && plan.changes.length === 0
  const list = (title: string, items: string[]) =>
    items.length ? (
      <div class={styles.section}>
        <span class={styles.sectionTitle}>{title} · {items.length}</span>
        <div class={styles.mono} style={{ maxHeight: 120, overflow: 'auto' }}>{items.slice(0, 60).map((i) => <div key={i}>{i}</div>)}{items.length > 60 && <div class={styles.muted}>+{items.length - 60} more</div>}</div>
      </div>
    ) : null
  const busy = props.planning || !!props.publishing
  const pct = props.publishing && props.publishing.total ? Math.round((props.publishing.done / props.publishing.total) * 100) : 0
  return (
    <Dialog label="Publish to repository" onClose={props.onCancel} busy={busy}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>Publish to {props.repo.repo.trim()}</strong>
          <Button secondary onClick={props.onCancel} disabled={busy}>{result ? 'Close' : 'Cancel'}</Button>
        </div>
        {plan && !result && (
          <div class={styles.muted}>
            New branch <code>{plan.branch}</code> from <code>{plan.base}</code>, folder <code>{plan.subdir}</code>. Nothing has been sent yet. {host} receives the files only when you confirm.
          </div>
        )}
      </div>
      <div class={styles.overlayBody}>
        {props.planning && <div class={styles.muted}>Comparing with the repository…</div>}
        {props.error && <div class={styles.fixResult + ' ' + styles.sevError}><BlockIcon /> <span>{props.error}</span></div>}

        {result && (
          <div class={styles.section}>
            <div class={styles.fixResult + ' ' + (result.url ? styles.sevInfo : styles.sevWarn)}>
              {result.url ? <CheckIcon /> : <WarnIcon />}
              <span>
                {result.url
                  ? `Branch ${result.branch} created and a ${request} opened.`
                  : `Branch ${result.branch} was created, but the ${request} could not be opened: ${result.requestError ?? 'unknown error'}.`}
              </span>
            </div>
            <div class={styles.fieldRow}>
              {result.url ? (
                <Button onClick={() => props.onOpen(result.url!)}>{`Open ${request}`}</Button>
              ) : (
                result.fallbackUrl && <Button onClick={() => props.onOpen(result.fallbackUrl!)}>{`Open the ${request} page`}</Button>
              )}
              <Button secondary onClick={() => props.onCopy(`${result.title}\n\n${result.body}`)}>Copy description</Button>
            </div>
            <details class={styles.muted}>
              <summary style={{ cursor: 'pointer' }}>{result.title}</summary>
              <pre class={styles.mono} style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', maxHeight: 160, overflow: 'auto' }}>{result.body}</pre>
            </details>
          </div>
        )}

        {plan && !result && (
          <div class={styles.section}>
            <div class={styles.releaseGrid}>
              <div class={styles.releaseCell}><strong>{plan.added.length}</strong>added</div>
              <div class={styles.releaseCell}><strong>{plan.changed.length}</strong>changed</div>
              <div class={styles.releaseCell}><strong>{plan.removed.length}</strong>removed</div>
              <div class={styles.releaseCell}><strong>{plan.unchanged}</strong>same</div>
            </div>
            {plan.removed.length > 0 && (
              <div class={styles.muted}><WarnIcon /> Removed files are only ones this tool published before (listed in <code>.icon-toolkit.json</code>); your own files are never deleted.</div>
            )}
            {nothing && <div class={styles.muted}>The repository is already up to date: nothing to publish.</div>}
            {list('Added', plan.added)}
            {list('Changed', plan.changed)}
            {list('Removed', plan.removed)}
            {!nothing && (
              <details class={styles.muted}>
                <summary style={{ cursor: 'pointer' }}>{request[0].toUpperCase() + request.slice(1)}: {props.description.title}</summary>
                <pre class={styles.mono} style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', maxHeight: 160, overflow: 'auto' }}>{props.description.body}</pre>
              </details>
            )}
          </div>
        )}
        {props.publishing && (
          <div>
            <div class={styles.progress}><div class={styles.progressBar} style={{ width: `${pct}%` }} /></div>
            <div class={styles.muted} style={{ marginTop: 6 }}>Uploading {props.publishing.done} of {props.publishing.total} files…</div>
          </div>
        )}
      </div>
      {plan && !result && (
        <div class={styles.footer}>
          <div class={styles.footerNote} />
          <Button onClick={props.onSend} loading={!!props.publishing} disabled={busy || nothing}>
            {`Create branch and open ${request}`}
          </Button>
        </div>
      )}
    </Dialog>
  )
}

export const publishSummary = (n: number) => plural(n, 'file')
