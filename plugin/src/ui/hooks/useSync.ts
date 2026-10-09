import { emit } from '@create-figma-plugin/utilities'
import { useState } from 'preact/hooks'
import { Files } from '../../core/generators'
import { OpenExternalHandler, Settings } from '../../types'
import { companionFetch } from '../companion'
import { SyncPlan, SyncResult } from '../SyncDialog'
import { notify } from '../util'

/** the branch to push: the one chosen in Settings, or a dated one so a push never lands on the default branch by accident */
export const pushBranch = (settings: Settings): string => settings.sync.branch || (settings.sync.commit && settings.sync.push ? `icons/update-${new Date().toISOString().slice(0, 10)}` : '')

/** Project sync (Labs): preview what would change in the project folder, then send. Talks to the local companion only. */
export function useSync(settings: Settings, makeFiles: () => Files, onWritten: () => void, describe: () => { title: string; body: string }) {
  const [status, setStatus] = useState('')
  const [plan, setPlan] = useState<SyncPlan | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const test = async () => {
    try {
      const st = await companionFetch(settings.sync, '/status')
      const origin = st.remote ? ` · origin ${st.remote.provider ?? st.remote.host}: ${st.remote.repo}${st.defaultBranch ? ` (default ${st.defaultBranch})` : ''}` : ''
      const pushNote = settings.sync.push && !st.allowPush ? ' · push is off: start the helper with --allow-push' : ''
      setStatus(`Connected: ${st.dir}${st.git?.repo ? ` · git ${st.git.branch}` : st.allowGit ? ' · not a git repo' : ' · git off'}${origin}${pushNote}`)
    } catch (e) {
      setStatus(message(e))
    }
  }
  const start = async () => {
    setError(null)
    setResult(null)
    try {
      const p = await companionFetch(settings.sync, '/export', { files: makeFiles(), subdir: settings.sync.subdir, dryRun: true })
      setPlan({ added: p.added, changed: p.changed, removed: p.removed, unchanged: p.unchanged })
    } catch (e) {
      setPlan({ added: [], changed: [], removed: [], unchanged: 0 })
      setError(message(e))
    }
  }
  const send = async () => {
    setSending(true)
    setError(null)
    try {
      const pr = settings.sync.push ? describe() : null
      const out = await companionFetch(settings.sync, '/export', {
        files: makeFiles(),
        subdir: settings.sync.subdir,
        dryRun: false,
        commit: settings.sync.commit,
        push: settings.sync.commit && settings.sync.push,
        message: pr ? pr.title : settings.sync.message,
        prTitle: pr?.title,
        prBody: pr?.body,
        branch: pushBranch(settings) || undefined
      })
      setResult({ committed: out.committed, description: pr ?? undefined })
      onWritten()
      notify('Written to your project folder')
    } catch (e) {
      setError(message(e))
    } finally {
      setSending(false)
    }
  }
  const open = (url: string) => emit<OpenExternalHandler>('OPEN_EXTERNAL', url)
  return { status, plan, result, error, sending, test, start, send, open, close: () => setPlan(null) }
}
