import { gitBlobSha } from './sha'
import { MANAGED_FILE, safeGeneratedPath, safeSubdir, validBranch } from './paths'
import { Change, HostClient, HostError } from './types'

export interface PublishPlan {
  provider: HostClient['provider']
  base: string
  branch: string
  subdir: string
  added: string[]
  changed: string[]
  removed: string[]
  unchanged: number
  /** what will be committed, including the managed-files list */
  changes: Change[]
  existing: Set<string>
}

const pad = (n: number) => String(n).padStart(2, '0')
/** icons/update-2026-10-09-1204: unique per minute, so a second publish never collides with the first branch */
export const autoBranch = (d = new Date()) => `icons/update-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`

/**
 * Compares the export with the repository's default branch, without writing anything.
 * Only files this tool created earlier (listed in <folder>/.icon-toolkit.json) are ever deleted.
 */
export async function planPublish(a: { client: HostClient; files: Record<string, string>; subdir: string; branch?: string; now?: Date }): Promise<PublishPlan> {
  const subdir = safeSubdir(a.subdir)
  if (!subdir) throw new HostError('invalid', 'Use a plain folder name such as "icons": not the repository root, not a hidden folder.')
  for (const rel of Object.keys(a.files)) if (!safeGeneratedPath(rel)) throw new HostError('invalid', `Refusing to publish "${rel}": only plain asset files (svg, ts, js, css, html, json, md) are allowed.`)

  const info = await a.client.info()
  if (!info.canWrite) throw new HostError('permission', 'This token cannot write to the repository. Give it write access to contents and pull / merge requests.')
  const base = info.defaultBranch
  const branch = (a.branch ?? '').trim() || autoBranch(a.now)
  if (!validBranch(branch)) throw new HostError('invalid', `"${branch}" is not a usable branch name.`)
  if (branch === base) throw new HostError('invalid', `Not publishing to "${base}": use a separate branch so the change can be reviewed.`)
  if (await a.client.branchExists(branch)) throw new HostError('exists', `The branch "${branch}" already exists. Choose another name or leave it empty for an automatic one.`)

  const current = new Map((await a.client.listFiles(base, subdir)).map((e) => [e.path, e.sha]))
  let previous: string[] = []
  const managedText = await a.client.readFile(base, `${subdir}/${MANAGED_FILE}`)
  if (managedText) {
    try {
      const parsed = JSON.parse(managedText) as { files?: unknown }
      if (Array.isArray(parsed.files)) previous = parsed.files.filter((f): f is string => typeof f === 'string' && safeGeneratedPath(f))
    } catch {
      previous = []
    }
  }

  const added: string[] = []
  const changed: string[] = []
  const changes: Change[] = []
  let unchanged = 0
  for (const [rel, content] of Object.entries(a.files)) {
    const full = `${subdir}/${rel}`
    const sha = current.get(full)
    if (sha === undefined) added.push(rel)
    else if (sha !== (await gitBlobSha(content))) changed.push(rel)
    else {
      unchanged++
      continue
    }
    changes.push({ path: full, content })
  }
  const removed = previous.filter((rel) => !(rel in a.files) && current.has(`${subdir}/${rel}`))
  for (const rel of removed) changes.push({ path: `${subdir}/${rel}`, content: null })

  if (changes.length) {
    const manifest = JSON.stringify({ files: Object.keys(a.files), syncedAt: (a.now ?? new Date()).toISOString() }, null, 2) + '\n'
    changes.push({ path: `${subdir}/${MANAGED_FILE}`, content: manifest })
  }
  return { provider: a.client.provider, base, branch, subdir, added, changed, removed, unchanged, changes, existing: new Set(current.keys()) }
}

/** Creates the branch and the commit, then opens the pull / merge request. If only the last step fails, the branch is already there and the error says so. */
export async function publishPlan(
  client: HostClient,
  plan: PublishPlan,
  a: { message: string; title: string; body: string; onProgress?: (done: number, total: number) => void }
): Promise<{ url: string | null; number: number | null; branch: string; sha: string; commits: number; requestError?: string }> {
  if (!plan.changes.length) throw new HostError('invalid', 'Nothing to publish: the repository is already up to date.')
  const commit = await client.commit({ base: plan.base, branch: plan.branch, message: a.message, changes: plan.changes, existing: plan.existing, onProgress: a.onProgress })
  try {
    const r = await client.openRequest({ base: plan.base, branch: plan.branch, title: a.title, body: a.body })
    return { url: r.url, number: r.number, branch: plan.branch, sha: commit.sha, commits: commit.commits }
  } catch (e) {
    return { url: null, number: null, branch: plan.branch, sha: commit.sha, commits: commit.commits, requestError: e instanceof Error ? e.message : String(e) }
  }
}
