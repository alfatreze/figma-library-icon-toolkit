import { Button } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { PublishPlan } from '../core/gitHost'
import { Dialog } from './Dialog'
import { BlockIcon, CheckIcon, WarnIcon } from './icons'
import { GroupView } from './hooks/usePublish'
import styles from './styles'
import { OutputGroup } from '../core/outputs'
import { plural } from './util'

const hostName = (p: 'github' | 'gitlab') => (p === 'github' ? 'GitHub' : 'GitLab')
const requestName = (p: 'github' | 'gitlab') => (p === 'github' ? 'pull request' : 'merge request')

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div class={styles.section}>
      <span class={styles.sectionTitle}>{title} · {items.length}</span>
      <div class={styles.mono} style={{ maxHeight: 120, overflow: 'auto' }}>{items.slice(0, 60).map((i) => <div key={i}>{i}</div>)}{items.length > 60 && <div class={styles.muted}>+{items.length - 60} more</div>}</div>
    </div>
  )
}

/** one repository of the publish: what will change, or what happened */
function GroupBlock(props: { view: GroupView; description: { title: string; body: string }; onOpen: (url: string) => void; onCopy: (text: string) => void; planning: boolean; solo: boolean }) {
  const { view, description } = props
  const { group, plan, result } = view
  const request = requestName(group.provider)
  const nothing = !!plan && plan.changes.length === 0
  const folders = group.outputs.map((o) => `${o.name ? o.name + ': ' : ''}${o.subdir}`)
  return (
    <div class={styles.section}>
      {!props.solo && <strong>{group.repo} <span class={styles.muted}>on {hostName(group.provider)}</span></strong>}
      <div class={styles.muted}>Folders: {folders.join(' · ')}</div>
      {!plan && !view.error && props.planning && <div class={styles.muted}>Comparing with the repository…</div>}
      {view.error && <div class={styles.fixResult + ' ' + styles.sevError}><BlockIcon /> <span>{view.error}</span></div>}
      {plan && !result && (
        <div class={styles.muted}>New branch <code>{plan.branch}</code> from <code>{plan.base}</code>. Nothing has been sent yet.</div>
      )}

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
          <List title="Added" items={plan.added} />
          <List title="Changed" items={plan.changed} />
          <List title="Removed" items={plan.removed} />
          {!nothing && (
            <details class={styles.muted}>
              <summary style={{ cursor: 'pointer' }}>{request[0].toUpperCase() + request.slice(1)}: {description.title}</summary>
              <pre class={styles.mono} style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0', maxHeight: 160, overflow: 'auto' }}>{description.body}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

export function PublishDialog(props: {
  views: GroupView[]
  planning: boolean
  publishing: { done: number; total: number } | null
  description: (g: OutputGroup) => { title: string; body: string }
  onOpen: (url: string) => void
  onCopy: (text: string) => void
  onCancel: () => void
  onSend: () => void
}) {
  const { views } = props
  const busy = props.planning || !!props.publishing
  const done = views.length > 0 && views.every((v) => v.result || v.error || (v.plan && v.plan.changes.length === 0))
  const anyResult = views.some((v) => v.result)
  const pending = views.filter((v) => v.plan && !v.result && v.plan.changes.length > 0)
  const pct = props.publishing && props.publishing.total ? Math.round((props.publishing.done / props.publishing.total) * 100) : 0
  const title = views.length === 1 ? `Publish to ${views[0].group.repo}` : `Publish to ${views.length} repositories`
  const request = pending.length && pending.every((v) => v.group.provider === pending[0].group.provider) ? requestName(pending[0].group.provider) : 'pull / merge request'
  return (
    <Dialog label="Publish to repository" onClose={props.onCancel} busy={busy}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>{title}</strong>
          <Button secondary onClick={props.onCancel} disabled={busy}>{anyResult || done ? 'Close' : 'Cancel'}</Button>
        </div>
        {!anyResult && <div class={styles.muted}>The git hosts receive the files only when you confirm.</div>}
      </div>
      <div class={styles.overlayBody}>
        {views.map((v) => (
          <GroupBlock key={v.group.key} view={v} description={props.description(v.group)} onOpen={props.onOpen} onCopy={props.onCopy} planning={props.planning} solo={views.length === 1} />
        ))}
        {props.publishing && (
          <div>
            <div class={styles.progress}><div class={styles.progressBar} style={{ width: `${pct}%` }} /></div>
            <div class={styles.muted} style={{ marginTop: 6 }}>Uploading {props.publishing.done} of {props.publishing.total} files…</div>
          </div>
        )}
      </div>
      {pending.length > 0 && (
        <div class={styles.footer}>
          <div class={styles.footerNote} />
          <Button onClick={props.onSend} loading={!!props.publishing} disabled={busy}>
            {pending.length > 1 ? `Create ${pending.length} branches and open ${request}s` : `Create branch and open ${request}`}
          </Button>
        </div>
      )}
    </Dialog>
  )
}
