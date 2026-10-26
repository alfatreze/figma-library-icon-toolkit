import { parseCatalog, PreviousCatalog } from './changelog'
import { FetchFn, HostError, Provider } from './gitHost'
import { call, commonError } from './gitHost/http'

/**
 * "Is this icon in your repo?" for the Dev Mode panel. The link to icons.json in the repository is the one the design team already set as
 * the link base for Dev Mode resources (Settings → Labs): nothing new to configure. The file is read from a public repository with a plain
 * GET (no token, no data sent); a private repository answers "not found" and the panel says so. Everything read is validated like any
 * icons.json (`parseCatalog`).
 */

export interface CatalogLink {
  provider: Provider
  /** owner/name (GitHub) or group/subgroup/project (gitlab.com) */
  repo: string
  ref: string
  /** the icons.json path inside the repository */
  path: string
}

const SEG = /^[\w.@+~-]+$/
const REPO = /^[\w.-]+(\/[\w.-]+)+$/

/** the folder of a "tree" link, or the file of a "blob"/"raw" link, always ending in icons.json */
const filePath = (rest: string[]): string | null => {
  if (!rest.length || !rest.every((s) => SEG.test(s) && s !== '.' && s !== '..')) return null
  const last = rest[rest.length - 1]
  return /\.json$/i.test(last) ? (last.toLowerCase() === 'icons.json' ? rest.join('/') : null) : [...rest, 'icons.json'].join('/')
}

/** github.com/o/r/blob|tree/<ref>/<path>, raw.githubusercontent.com/o/r/<ref>/<path>, gitlab.com/g/p/-/blob|tree|raw/<ref>/<path>; anything else is not a link we read */
export function parseCatalogLink(input: string): CatalogLink | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p))
  if (url.hostname === 'github.com' && parts.length >= 5 && (parts[2] === 'blob' || parts[2] === 'tree')) {
    const repo = `${parts[0]}/${parts[1]}`
    const path = filePath(parts.slice(4))
    return REPO.test(repo) && SEG.test(parts[3]) && path ? { provider: 'github', repo, ref: parts[3], path } : null
  }
  if (url.hostname === 'raw.githubusercontent.com' && parts.length >= 4) {
    const repo = `${parts[0]}/${parts[1]}`
    const path = filePath(parts.slice(3))
    return REPO.test(repo) && SEG.test(parts[2]) && path ? { provider: 'github', repo, ref: parts[2], path } : null
  }
  const dash = parts.indexOf('-')
  if (url.hostname === 'gitlab.com' && dash >= 2 && parts.length >= dash + 4 && ['blob', 'tree', 'raw'].includes(parts[dash + 1])) {
    const repo = parts.slice(0, dash).join('/')
    const path = filePath(parts.slice(dash + 3))
    return REPO.test(repo) && SEG.test(parts[dash + 2]) && path ? { provider: 'gitlab', repo, ref: parts[dash + 2], path } : null
  }
  return null
}

/** reads and validates the catalog; a repository that is private, missing or has no icons.json is reported, never guessed at */
export async function readPublicCatalog(link: CatalogLink, fetchFn: FetchFn): Promise<PreviousCatalog> {
  const github = link.provider === 'github'
  const url = github
    ? `https://api.github.com/repos/${link.repo}/contents/${link.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(link.ref)}`
    : `https://gitlab.com/api/v4/projects/${encodeURIComponent(link.repo)}/repository/files/${encodeURIComponent(link.path)}/raw?ref=${encodeURIComponent(link.ref)}`
  const headers: Record<string, string> = github ? { Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' } : {}
  const reply = await call<unknown>(fetchFn, url, { headers }, (status, data) => (status === 404 ? new HostError('notfound', `Could not read ${link.path} in ${link.repo}. A private repository cannot be read from here, or the link is not right.`, 404) : commonError(status, data, github ? 'GitHub' : 'GitLab')))
  // the raw media type returns the file text; parseCatalog validates the shape and the size
  const text = typeof reply.data === 'string' ? reply.data : JSON.stringify(reply.data)
  const catalog = parseCatalog(text)
  if (catalog.partial) throw new Error('The icons.json at that link is a Dev Mode selection, not the whole library.')
  return catalog
}

export type RepoStatus = { kind: 'in-repo' } | { kind: 'renamed'; repoName: string } | { kind: 'missing' }

/** by component key first (a rename keeps it), then by name */
export function repoStatus(icon: { name: string; componentKey?: string }, catalog: PreviousCatalog): RepoStatus {
  if (icon.componentKey) {
    const byKey = catalog.icons.find((c) => c.figma?.componentKey === icon.componentKey)
    if (byKey) return byKey.name === icon.name ? { kind: 'in-repo' } : { kind: 'renamed', repoName: byKey.name }
  }
  return catalog.icons.some((c) => c.name === icon.name) ? { kind: 'in-repo' } : { kind: 'missing' }
}
