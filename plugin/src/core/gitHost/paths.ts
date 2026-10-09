import { Provider } from './types'

/** a folder inside the repo that tools do not treat as code: no dot-segments (.git, .github…), no node_modules, not the root */
export function safeSubdir(input: string): string | null {
  const p = input.trim().replace(/^\/+|\/+$/g, '')
  if (!p || p.length > 200 || !/^[A-Za-z0-9._/-]+$/.test(p)) return null
  const parts = p.split('/')
  if (parts.some((x) => !x || x === '.' || x === '..' || x.startsWith('.') || x === 'node_modules')) return null
  return p
}

/** generated files are plain text assets: no dot-files, no executables, no package manifests */
const ALLOWED_EXT = new Set(['.svg', '.ts', '.js', '.css', '.html', '.json', '.md'])
export function safeGeneratedPath(rel: string): boolean {
  if (!rel || rel.length > 300 || rel.startsWith('/') || rel.includes('\\') || rel.includes('\0')) return false
  const parts = rel.split('/')
  if (parts.some((x) => !x || x === '.' || x === '..' || x.startsWith('.'))) return false
  const base = parts[parts.length - 1]
  if (['package.json', 'package-lock.json', 'tsconfig.json'].includes(base)) return false
  const dot = base.lastIndexOf('.')
  return dot > 0 && ALLOWED_EXT.has(base.slice(dot).toLowerCase())
}

/** a new branch name: plain characters, no `..`, no leading dash or slash */
export function validBranch(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(name) && !name.includes('..') && !name.endsWith('/') && !name.endsWith('.lock') && !name.includes('//')
}

export const MANAGED_FILE = '.icon-toolkit.json'

/** "owner/name", "https://github.com/owner/name(.git)", "git@github.com:owner/name.git"; the provider when the text says which host */
export function parseRepoInput(input: string): { provider: Provider | null; repo: string; unsupportedHost?: string } | null {
  const t = input.trim()
  if (!t) return null
  let host = ''
  let path = t
  const web = /^https?:\/\/(?:[^@/\s]+@)?([^/\s:]+)(?::\d+)?\/(.+)$/.exec(t)
  const ssh = /^(?:ssh:\/\/)?[^@/\s]+@([^:/\s]+)(?::\d+)?[:/](.+)$/.exec(t)
  const m = web ?? ssh
  if (m) {
    host = m[1].toLowerCase()
    path = m[2]
  }
  path = path.replace(/[?#].*$/, '').replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
  // web URLs of a project page: .../owner/repo/tree/main, .../group/project/-/issues
  if (host === 'github.com') path = path.split('/').slice(0, 2).join('/')
  else if (host) path = path.split('/-/')[0]
  if (!/^[\w.-]+(\/[\w.-]+)+$/.test(path)) return null
  if (!host) return { provider: null, repo: path }
  if (host === 'github.com') return path.split('/').length === 2 ? { provider: 'github', repo: path } : null
  if (host === 'gitlab.com') return { provider: 'gitlab', repo: path }
  return { provider: null, repo: path, unsupportedHost: host }
}
