import { emit } from '@create-figma-plugin/utilities'
import { useRef, useState } from 'preact/hooks'
import { HostError, planPublish, PublishPlan, publishPlan } from '../../core/gitHost'
import { Files } from '../../core/generators'
import { OpenExternalHandler, OutputSettings, Settings } from '../../types'
import { groupOutputs, mergePlans, OutputGroup, outputReady, validateOutputs } from '../../core/outputs'
import { clientFor } from '../repoClient'

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
export function requestPage(provider: OutputSettings['provider'], repo: string, base: string, branch: string): string {
  return provider === 'github'
    ? `https://github.com/${repo}/compare/${base}...${branch.split('/').map(encodeURIComponent).join('/')}`
    : `https://gitlab.com/${repo}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(branch)}&merge_request%5Btarget_branch%5D=${encodeURIComponent(base)}`
}

/** one repository in a publish: its outputs, the combined plan against the default branch, and what happened */
export interface GroupView {
  group: OutputGroup
  plan: PublishPlan | null
  result: PublishResult | null
  error: string | null
}

/**
 * Publish to repositories, straight from the plugin. Outputs that share a repository are planned separately (each has its own
 * folder and managed-files list) and published together: one branch, one commit, one pull / merge request. The tokens are the user's
 * own, kept on this computer; requests go only to the git host.
 */
export function usePublish(
  settings: Settings,
  filesFor: (o: OutputSettings) => Files,
  onPublished: () => void,
  describe: (g: OutputGroup) => { title: string; body: string }
) {
  const [views, setViews] = useState<GroupView[]>([])
  const [planning, setPlanning] = useState(false)
  const [publishing, setPublishing] = useState<{ done: number; total: number } | null>(null)
  const [testMessages, setTestMessages] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  const latest = useRef(views)
  latest.current = views
  const patchView = (key: string, p: Partial<GroupView>) => setViews((vs) => vs.map((v) => (v.group.key === key ? { ...v, ...p } : v)))

  const problems = validateOutputs(settings.outputs, settings.tokens, settings.formats)
  const ready = settings.outputs.filter((o) => outputReady(o, settings.tokens) && !problems[o.id])
  const configured = ready.length > 0 && ready.length === settings.outputs.length

  const test = async (o: OutputSettings) => {
    setTestMessages((m) => ({ ...m, [o.id]: 'Checking…' }))
    let text: string
    try {
      const info = await clientFor(o, settings.tokens).info()
      text = `Connected to ${o.repo.trim()} (default branch ${info.defaultBranch}). ${info.canWrite ? 'This token can publish.' : 'This token can read but not write: give it write access.'}`
    } catch (e) {
      text = message(e)
    }
    setTestMessages((m) => ({ ...m, [o.id]: text }))
  }

  const start = async () => {
    const groups = groupOutputs(settings.outputs, settings.formats)
    setOpen(true)
    setViews(groups.map((group) => ({ group, plan: null, result: null, error: null })))
    setPlanning(true)
    const now = new Date()
    for (const group of groups) {
      try {
        const plans = []
        for (const o of group.outputs) plans.push(await planPublish({ client: clientFor(o, settings.tokens), files: filesFor(o), subdir: o.subdir, branch: group.branch, now }))
        patchView(group.key, { plan: mergePlans(plans) })
      } catch (e) {
        patchView(group.key, { error: message(e) })
      }
    }
    setPlanning(false)
  }

  const send = async () => {
    for (const v of latest.current) {
      if (!v.plan || v.result || !v.plan.changes.length) continue
      const { group, plan } = v
      const text = describe(group)
      setPublishing({ done: 0, total: plan.changes.length })
      patchView(group.key, { error: null })
      try {
        const done = await publishPlan(clientFor(group.outputs[0], settings.tokens), plan, {
          message: text.title,
          title: text.title,
          body: text.body,
          onProgress: (d, total) => setPublishing({ done: d, total })
        })
        patchView(group.key, {
          result: {
            url: done.url,
            branch: done.branch,
            base: plan.base,
            commits: done.commits,
            requestError: done.requestError,
            fallbackUrl: done.url ? null : requestPage(group.provider, group.repo, plan.base, done.branch),
            title: text.title,
            body: text.body
          }
        })
        onPublished()
      } catch (e) {
        patchView(group.key, { error: message(e) })
      }
    }
    setPublishing(null)
  }

  const openLink = (url: string) => emit<OpenExternalHandler>('OPEN_EXTERNAL', url)
  const close = () => {
    setOpen(false)
    setViews([])
  }
  return { open, views, planning, publishing, testMessages, configured, problems, test, start, send, openLink, close }
}
