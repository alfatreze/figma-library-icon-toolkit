import { call, commonError, messageOf } from './http'
import { Change, CommitArgs, FetchFn, HostClient, HostError, RepoInfo, TreeEntry } from './types'

const API = 'https://api.github.com'
const CHUNK_BYTES = 1_500_000
const CHUNK_FILES = 250

const b64decode = (b64: string): string => {
  const bin = atob(b64.replace(/\s/g, ''))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** split changes into requests that stay well below GitHub's body limits */
export function chunkChanges(changes: Change[]): Change[][] {
  const out: Change[][] = []
  let cur: Change[] = []
  let bytes = 0
  for (const c of changes) {
    const size = c.content ? c.content.length * 1.1 + 200 : 200
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

/** GitHub through its REST API with a personal access token (fine-grained: Contents and Pull requests, read and write). */
export function githubClient(repo: string, token: string, fetchFn: FetchFn): HostClient {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }
  const base = `${API}/repos/${repo.split('/').map(encodeURIComponent).join('/')}`
  const fail = (status: number, data: unknown) => {
    if (status === 422 && /already exists/i.test(messageOf(data))) return new HostError('exists', 'That branch already exists. Choose another branch name.', status)
    return commonError(status, data, 'GitHub')
  }
  const get = <T>(path: string, allow: number[] = []) => call<T>(fetchFn, base + path, { headers }, fail, allow)
  const post = <T>(path: string, body: unknown) => call<T>(fetchFn, base + path, { method: 'POST', headers, body }, fail)

  return {
    provider: 'github',

    async info(): Promise<RepoInfo> {
      const { data } = await get<{ default_branch: string; html_url: string; permissions?: { push?: boolean; admin?: boolean; maintain?: boolean } }>('')
      return { defaultBranch: data.default_branch, webUrl: data.html_url, canWrite: !!(data.permissions?.push || data.permissions?.admin || data.permissions?.maintain) }
    },

    async listFiles(ref, dir): Promise<TreeEntry[]> {
      const r = await get<{ tree: { path: string; type: string; sha: string }[]; truncated?: boolean }>(`/git/trees/${encodeURIComponent(`${ref}:${dir}`)}?recursive=1`, [404])
      if (r.status === 404) return []
      if (r.data.truncated) throw new HostError('invalid', `The folder "${dir}" has too many files for GitHub to list. Use a smaller folder.`)
      return r.data.tree.filter((e) => e.type === 'blob').map((e) => ({ path: `${dir}/${e.path}`, sha: e.sha }))
    },

    async readFile(ref, path) {
      const r = await get<{ content?: string; encoding?: string }>(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, [404])
      if (r.status === 404 || !r.data.content) return null
      return r.data.encoding === 'base64' ? b64decode(r.data.content) : r.data.content
    },

    async branchExists(branch) {
      const r = await get(`/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`, [404])
      return r.status !== 404
    },

    async commit(a: CommitArgs) {
      const ref = await get<{ object: { sha: string } }>(`/git/ref/heads/${a.base.split('/').map(encodeURIComponent).join('/')}`)
      const parent = ref.data.object.sha
      const parentCommit = await get<{ tree: { sha: string } }>(`/git/commits/${parent}`)
      let tree = parentCommit.data.tree.sha
      const chunks = chunkChanges(a.changes)
      let done = 0
      for (const chunk of chunks) {
        const t = await post<{ sha: string }>('/git/trees', {
          base_tree: tree,
          tree: chunk.map((c) => (c.content === null ? { path: c.path, mode: '100644', type: 'blob', sha: null } : { path: c.path, mode: '100644', type: 'blob', content: c.content }))
        })
        tree = t.data.sha
        done += chunk.length
        a.onProgress?.(done, a.changes.length)
      }
      const commit = await post<{ sha: string }>('/git/commits', { message: a.message, tree, parents: [parent] })
      await post('/git/refs', { ref: `refs/heads/${a.branch}`, sha: commit.data.sha })
      return { sha: commit.data.sha, commits: 1 }
    },

    async openRequest(a) {
      const { data } = await post<{ html_url: string; number: number }>('/pulls', { title: a.title, head: a.branch, base: a.base, body: a.body, maintainer_can_modify: true })
      return { url: data.html_url, number: data.number }
    }
  }
}
