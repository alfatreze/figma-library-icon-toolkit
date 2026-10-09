import { gitBlobSha } from '../../src/core/gitHost/sha'
import { FetchFn } from '../../src/core/gitHost/types'

/**
 * In-memory stand-ins for the GitHub and GitLab REST APIs: just the endpoints publishing uses, with the rules that matter
 * (token required, create vs update, one-branch-per-name, trees that build on a base tree). Every request is logged.
 */
export interface FakeState {
  token: string
  canWrite: boolean
  defaultBranch: string
  /** branch -> files */
  branches: Map<string, Map<string, string>>
  requests: { method: string; url: string; body: unknown }[]
  pulls: { title: string; head: string; base: string; body: string }[]
  commits: { branch: string; message: string; paths: string[] }[]
  failNext: { match: RegExp; status: number; body?: unknown }[]
  networkDown: boolean
}

export function newState(files: Record<string, string> = {}): FakeState {
  return {
    token: 'good-token',
    canWrite: true,
    defaultBranch: 'main',
    branches: new Map([['main', new Map(Object.entries(files))]]),
    requests: [],
    pulls: [],
    commits: [],
    failNext: [],
    networkDown: false
  }
}

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  text: async () => (body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body))
})

export function fakeGithub(st: FakeState, repo = 'acme/icons'): FetchFn {
  const trees = new Map<string, Map<string, string>>()
  const commits = new Map<string, { tree: string; branchFiles: Map<string, string> }>()
  let n = 0
  const base = `https://api.github.com/repos/${repo}`
  return async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    st.requests.push({ method, url, body })
    if (st.networkDown) throw new Error('offline')
    if (!url.startsWith('https://api.github.com/')) return reply(500, 'wrong host')
    const auth = init.headers?.Authorization
    if (auth !== `Bearer ${st.token}`) return reply(401, { message: 'Bad credentials' })
    const fail = st.failNext.findIndex((f) => f.match.test(`${method} ${url}`))
    if (fail >= 0) {
      const f = st.failNext.splice(fail, 1)[0]
      return reply(f.status, f.body ?? { message: 'failed' })
    }
    if (!url.startsWith(base)) return reply(404, { message: 'Not Found' })
    const path = url.slice(base.length)
    if (method === 'GET' && path === '') return reply(200, { default_branch: st.defaultBranch, html_url: `https://github.com/${repo}`, permissions: { push: st.canWrite } })
    let m = /^\/git\/trees\/([^?]+)\?recursive=1$/.exec(path)
    if (method === 'GET' && m) {
      const [ref, dir] = decodeURIComponent(m[1]).split(':')
      const files = st.branches.get(ref)
      const entries: { path: string; type: string; sha: string }[] = []
      for (const [p, c] of files ?? []) if (p.startsWith(dir + '/')) entries.push({ path: p.slice(dir.length + 1), type: 'blob', sha: await gitBlobSha(c) })
      return entries.length ? reply(200, { tree: entries, truncated: false }) : reply(404, { message: 'Not Found' })
    }
    m = /^\/contents\/([^?]+)\?ref=(.+)$/.exec(path)
    if (method === 'GET' && m) {
      const c = st.branches.get(decodeURIComponent(m[2]))?.get(decodeURIComponent(m[1]))
      return c === undefined ? reply(404, { message: 'Not Found' }) : reply(200, { encoding: 'base64', content: btoa(String.fromCharCode(...new TextEncoder().encode(c))) })
    }
    m = /^\/git\/ref\/heads\/(.+)$/.exec(path)
    if (method === 'GET' && m) {
      const b = decodeURIComponent(m[1])
      if (!st.branches.has(b)) return reply(404, { message: 'Not Found' })
      const sha = `c${++n}`
      commits.set(sha, { tree: `t-${sha}`, branchFiles: st.branches.get(b)! })
      trees.set(`t-${sha}`, new Map(st.branches.get(b)!))
      return reply(200, { object: { sha } })
    }
    m = /^\/git\/commits\/(.+)$/.exec(path)
    if (method === 'GET' && m) return reply(200, { tree: { sha: commits.get(m[1])!.tree } })
    if (method === 'POST' && path === '/git/trees') {
      const next = new Map(trees.get(body.base_tree)!)
      for (const e of body.tree as { path: string; sha?: null; content?: string }[]) {
        if (e.sha === null) next.delete(e.path)
        else next.set(e.path, e.content!)
      }
      const sha = `t${++n}`
      trees.set(sha, next)
      return reply(201, { sha })
    }
    if (method === 'POST' && path === '/git/commits') {
      const sha = `c${++n}`
      commits.set(sha, { tree: body.tree, branchFiles: trees.get(body.tree)! })
      st.commits.push({ branch: '(pending)', message: body.message, paths: [...trees.get(body.tree)!.keys()] })
      return reply(201, { sha })
    }
    if (method === 'POST' && path === '/git/refs') {
      const branch = (body.ref as string).replace('refs/heads/', '')
      if (st.branches.has(branch)) return reply(422, { message: 'Reference already exists' })
      st.branches.set(branch, commits.get(body.sha)!.branchFiles)
      st.commits[st.commits.length - 1].branch = branch
      return reply(201, {})
    }
    if (method === 'POST' && path === '/pulls') {
      st.pulls.push({ title: body.title, head: body.head, base: body.base, body: body.body })
      return reply(201, { html_url: `https://github.com/${repo}/pull/${st.pulls.length}`, number: st.pulls.length })
    }
    return reply(404, { message: 'Not Found' })
  }
}

export function fakeGitlab(st: FakeState, repo = 'group/sub/icons'): FetchFn {
  const api = `https://gitlab.com/api/v4/projects/${encodeURIComponent(repo)}`
  return async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(init.body) : undefined
    st.requests.push({ method, url, body })
    if (st.networkDown) throw new Error('offline')
    if (!url.startsWith('https://gitlab.com/api/v4/')) return reply(500, 'wrong host')
    if (init.headers?.Authorization !== `Bearer ${st.token}`) return reply(401, { message: '401 Unauthorized' })
    const fail = st.failNext.findIndex((f) => f.match.test(`${method} ${url}`))
    if (fail >= 0) {
      const f = st.failNext.splice(fail, 1)[0]
      return reply(f.status, f.body ?? { message: 'failed' })
    }
    if (!url.startsWith(api)) return reply(404, { message: '404 Project Not Found' })
    const path = url.slice(api.length)
    if (method === 'GET' && path === '') return reply(200, { default_branch: st.defaultBranch, web_url: `https://gitlab.com/${repo}`, permissions: { project_access: { access_level: st.canWrite ? 30 : 20 }, group_access: null } })
    let m = /^\/repository\/tree\?path=([^&]+)&recursive=true&ref=([^&]+)&per_page=100&page=(\d+)$/.exec(path)
    if (method === 'GET' && m) {
      const dir = decodeURIComponent(m[1])
      const files = st.branches.get(decodeURIComponent(m[2]))
      const all: { type: string; path: string; id: string }[] = []
      for (const [p, c] of files ?? []) if (p.startsWith(dir + '/')) all.push({ type: 'blob', path: p, id: await gitBlobSha(c) })
      const page = Number(m[3])
      const slice = all.slice((page - 1) * 100, page * 100)
      if (!files) return reply(404, { message: '404 Tree Not Found' })
      return reply(200, slice, page * 100 < all.length ? { 'x-next-page': String(page + 1) } : {})
    }
    m = /^\/repository\/files\/([^/]+)\/raw\?ref=(.+)$/.exec(path)
    if (method === 'GET' && m) {
      const c = st.branches.get(decodeURIComponent(m[2]))?.get(decodeURIComponent(m[1]))
      return c === undefined ? reply(404, { message: '404 File Not Found' }) : reply(200, c)
    }
    m = /^\/repository\/branches\/(.+)$/.exec(path)
    if (method === 'GET' && m) return st.branches.has(decodeURIComponent(m[1])) ? reply(200, { name: m[1] }) : reply(404, { message: '404 Branch Not Found' })
    if (method === 'POST' && path === '/repository/commits') {
      let files = st.branches.get(body.branch)
      if (!files) {
        const from = st.branches.get(body.start_branch)
        if (!from) return reply(400, { message: 'start_branch is invalid' })
        files = new Map(from)
        st.branches.set(body.branch, files)
      }
      for (const a of body.actions as { action: string; file_path: string; content?: string }[]) {
        if (a.action === 'create' && files.has(a.file_path)) return reply(400, { message: `A file with this name already exists: ${a.file_path}` })
        if ((a.action === 'update' || a.action === 'delete') && !files.has(a.file_path)) return reply(400, { message: `A file with this name doesn't exist: ${a.file_path}` })
      }
      for (const a of body.actions as { action: string; file_path: string; content?: string }[]) {
        if (a.action === 'delete') files.delete(a.file_path)
        else files.set(a.file_path, a.content ?? '')
      }
      st.commits.push({ branch: body.branch, message: body.commit_message, paths: body.actions.map((a: { file_path: string }) => a.file_path) })
      return reply(201, { id: `g${st.commits.length}` })
    }
    if (method === 'POST' && path === '/merge_requests') {
      st.pulls.push({ title: body.title, head: body.source_branch, base: body.target_branch, body: body.description })
      return reply(201, { web_url: `https://gitlab.com/${repo}/-/merge_requests/${st.pulls.length}`, iid: st.pulls.length })
    }
    return reply(404, { message: '404 Not Found' })
  }
}
