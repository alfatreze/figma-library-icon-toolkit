import { emit } from '@create-figma-plugin/utilities'
import { useState } from 'preact/hooks'
import { HostError, planPublish, PublishPlan, publishPlan } from '../../core/gitHost'
import { Files } from '../../core/generators'
import { OpenExternalHandler, Settings } from '../../types'
import { clientFor, repoConfigured } from '../repoClient'

export interface PublishResult {
  url: string | null
  branch: string
  base: string
  commits: number
  requestError?: string
  /** where to open the request by hand if it could not be created */
  fallbackUrl: string | null
  title: string
  body: string
}

const message = (e: unknown) => (e instanceof HostError ? e.message : e instanceof Error ? e.message : String(e))

/** the page that starts a pull / merge request for a branch, used when creating it through the API failed */
export function requestPage(provider: Settings['repo']['provider'], repo: string, base: string, branch: string): string {
  return provider === 'github'
    ? `https://github.com/${repo}/compare/${base}...${branch.split('/').map(encodeURIComponent).join('/')}`
    : `https://gitlab.com/${repo}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(branch)}&merge_request%5Btarget_branch%5D=${encodeURIComponent(base)}`
}

/**
 * Publish to a repository, straight from the plugin: compare with the default branch, then create a branch, commit and open a
 * pull / merge request. The token is the user's own, kept on this computer; requests go only to the git host.
 */
export function usePublish(settings: Settings, makeFiles: () => Files, onPublished: () => void, describe: () => { title: string; body: string }) {
  const [plan, setPlan] = useState<PublishPlan | null>(null)
  const [planning, setPlanning] = useState(false)
  const [publishing, setPublishing] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const [open, setOpen] = useState(false)
  const r = settings.repo

  const test = async () => {
    setTestMessage('Checking…')
    try {
      const info = await clientFor(r).info()
      setTestMessage(`Connected to ${r.repo.trim()} (default branch ${info.defaultBranch}). ${info.canWrite ? 'This token can publish.' : 'This token can read but not write: give it write access.'}`)
    } catch (e) {
      setTestMessage(message(e))
    }
  }

  const start = async () => {
    setOpen(true)
    setError(null)
    setResult(null)
    setPlan(null)
    setPlanning(true)
    try {
      setPlan(await planPublish({ client: clientFor(r), files: makeFiles(), subdir: r.subdir, branch: r.branch }))
    } catch (e) {
      setError(message(e))
    } finally {
      setPlanning(false)
    }
  }

  const send = async () => {
    if (!plan) return
    setError(null)
    setPublishing({ done: 0, total: plan.changes.length })
    const text = describe()
    try {
      const done = await publishPlan(clientFor(r), plan, {
        message: text.title,
        title: text.title,
        body: text.body,
        onProgress: (d, total) => setPublishing({ done: d, total })
      })
      setResult({
        url: done.url,
        branch: done.branch,
        base: plan.base,
        commits: done.commits,
        requestError: done.requestError,
        fallbackUrl: done.url ? null : requestPage(r.provider, r.repo.trim(), plan.base, done.branch),
        title: text.title,
        body: text.body
      })
      onPublished()
    } catch (e) {
      setError(message(e))
    } finally {
      setPublishing(null)
    }
  }

  const openLink = (url: string) => emit<OpenExternalHandler>('OPEN_EXTERNAL', url)
  const close = () => {
    setOpen(false)
    setPlan(null)
    setResult(null)
    setError(null)
  }
  return { open, plan, planning, publishing, result, error, testMessage, configured: repoConfigured(r), test, start, send, openLink, close }
}
