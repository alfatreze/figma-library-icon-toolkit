import { call, commonError, messageOf } from './http'
import { Change, CommitArgs, FetchFn, HostClient, HostError, RepoInfo, TreeEntry } from './types'

const API = 'https://gitlab.com/api/v4'
const CHUNK_BYTES = 1_500_000
const CHUNK_FILES = 200
const DEVELOPER = 30

export function chunkActions<T extends { content?: string | null }>(items: T[]): T[][] {
  const out: T[][] = []
  let cur: T[] = []
  let bytes = 0
  for (const c of items) {
    const size = (c.content ? c.content.length * 1.1 : 0) + 200
    if (cur.length && (cur.length >= CHUNK_FILES || bytes + size > CHUNK_BYTES)) {
      out.push(cur)
      cur = []
      bytes = 0
    }
    cur.push(c)
    bytes += size
  }
  if (cur.length) out.push(cur)
  return out
}

/** gitlab.com through its REST API with a personal or project access token (scope: api). */
export function gitlabClient(repo: string, token: string, fetchFn: FetchFn): HostClient {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const project = `${API}/projects/${encodeURIComponent(repo)}`
  const fail = (status: number, data: unknown) => {
    const m = messageOf(data)
    if (status === 400 && /already exists/i.test(m)) return new HostError('exists', 'That branch already exists. Choose another branch name.', status)
    return commonError(status, data, 'GitLab')
  }
  const get = <T>(path: string, allow: number[] = []) => call<T>(fetchFn, project + path, { headers }, fail, allow)
  const post = <T>(path: string, body: unknown) => call<T>(fetchFn, project + path, { method: 'POST', headers, body }, fail)

  return {
    provider: 'gitlab',

    async info(): Promise<RepoInfo> {
      const { data } = await get<{ default_branch: string | null; web_url: string; permissions?: { project_access?: { access_level: number } | null; group_access?: { access_level: number } | null } }>('')
      const level = Math.max(data.permissions?.project_access?.access_level ?? 0, data.permissions?.group_access?.access_level ?? 0)
      return { defaultBranch: data.default_branch ?? 'main', webUrl: data.web_url, canWrite: level >= DEVELOPER }
    },

    async listFiles(ref, dir): Promise<TreeEntry[]> {
      const out: TreeEntry[] = []
      for (let page = 1; page <= 200; page++) {
        const r = await get<{ type: string; path: string; id: string }[]>(`/repository/tree?path=${encodeURIComponent(dir)}&recursive=true&ref=${encodeURIComponent(ref)}&per_page=100&page=${page}`, [404])
        if (r.status === 404) return []
        for (const e of r.data) if (e.type === 'blob') out.push({ path: e.path, sha: e.id })
        if (!r.headers.get('x-next-page')) break
      }
      return out
    },

    async readFile(ref, path) {
      const r = await call<string>(fetchFn, `${project}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`, { headers }, fail, [404])
      return r.status === 404 ? null : typeof r.data === 'string' ? r.data : JSON.stringify(r.data)
    },

    async branchExists(branch) {
      const r = await get(`/repository/branches/${encodeURIComponent(branch)}`, [404])
      return r.status !== 404
    },

    async commit(a: CommitArgs) {
      const actions = a.changes.map((c: Change) => ({ action: c.content === null ? 'delete' : a.existing.has(c.path) ? 'update' : 'create', file_path: c.path, content: c.content ?? undefined }))
      const chunks = chunkActions(actions)
      let done = 0
      let last = ''
      for (const [i, chunk] of chunks.entries()) {
        const body: Record<string, unknown> = { branch: a.branch, commit_message: chunks.length > 1 ? `${a.message} (${i + 1}/${chunks.length})` : a.message, actions: chunk }
        if (i === 0) body.start_branch = a.base
        const r = await post<{ id: string }>('/repository/commits', body)
        last = r.data.id
        done += chunk.length
        a.onProgress?.(done, a.changes.length)
      }
      return { sha: last, commits: chunks.length }
    },

    async openRequest(a) {
      const { data } = await post<{ web_url: string; iid: number }>('/merge_requests', { source_branch: a.branch, target_branch: a.base, title: a.title, description: a.body })
      return { url: data.web_url, number: data.iid }
    }
  }
}
