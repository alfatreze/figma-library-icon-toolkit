import { useState } from 'preact/hooks'
import { Files } from '../../core/generators'
import { Settings } from '../../types'
import { companionFetch } from '../companion'
import { SyncPlan, SyncResult } from '../SyncDialog'
import { notify } from '../util'

/** Project sync (Labs): preview what would change in the project folder, then send. Talks to the local companion only. */
export function useSync(settings: Settings, makeFiles: () => Files, onWritten: () => void) {
  const [status, setStatus] = useState('')
  const [plan, setPlan] = useState<SyncPlan | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

  const test = async () => {
    try {
      const st = await companionFetch(settings.sync, '/status')
      setStatus(`Connected: ${st.dir}${st.git?.repo ? ` · git ${st.git.branch}` : st.allowGit ? ' · not a git repo' : ' · git off'}`)
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
      const out = await companionFetch(settings.sync, '/export', { files: makeFiles(), subdir: settings.sync.subdir, dryRun: false, commit: settings.sync.commit, message: settings.sync.message, branch: settings.sync.branch || undefined })
      setResult({ committed: out.committed })
      onWritten()
      notify('Written to your project folder')
    } catch (e) {
      setError(message(e))
    } finally {
      setSending(false)
    }
  }
  return { status, plan, result, error, sending, test, start, send, close: () => setPlan(null) }
}
