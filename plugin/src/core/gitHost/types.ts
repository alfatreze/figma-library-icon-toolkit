export type Provider = 'github' | 'gitlab'

export interface RepoInfo {
  defaultBranch: string
  /** the token may push a branch and open a pull / merge request */
  canWrite: boolean
  webUrl: string
}

export interface TreeEntry {
  /** full path from the repository root */
  path: string
  /** git blob id: comparable with `gitBlobSha(content)` */
  sha: string
}

/** content null = delete the file */
export interface Change {
  path: string
  content: string | null
}

export type HostErrorKind = 'auth' | 'permission' | 'notfound' | 'exists' | 'rate' | 'invalid' | 'network' | 'server'

export class HostError extends Error {
  constructor(public kind: HostErrorKind, message: string, public status = 0) {
    super(message)
    this.name = 'HostError'
  }
}

export interface CommitArgs {
  base: string
  branch: string
  message: string
  changes: Change[]
  /** paths that exist on the base branch (GitLab needs create vs update) */
  existing: Set<string>
  onProgress?: (done: number, total: number) => void
}

/** The few operations publishing needs, the same for every git host. */
export interface HostClient {
  provider: Provider
  info(): Promise<RepoInfo>
  /** every file under `dir` on `ref`, recursively; empty when the folder does not exist */
  listFiles(ref: string, dir: string): Promise<TreeEntry[]>
  readFile(ref: string, path: string): Promise<string | null>
  branchExists(branch: string): Promise<boolean>
  /** creates `branch` from `base` with one commit (large changes are uploaded in several requests, still one commit on GitHub) */
  commit(args: CommitArgs): Promise<{ sha: string; commits: number }>
  openRequest(args: { base: string; branch: string; title: string; body: string }): Promise<{ url: string; number: number }>
}

export type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number
  ok: boolean
  headers: { get(name: string): string | null }
  text(): Promise<string>
}>
