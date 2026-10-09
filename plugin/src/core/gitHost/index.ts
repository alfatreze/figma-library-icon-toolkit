import { githubClient } from './github'
import { gitlabClient } from './gitlab'
import { FetchFn, HostClient, HostError, Provider } from './types'

export * from './types'
export { gitBlobSha } from './sha'
export { MANAGED_FILE, parseRepoInput, safeGeneratedPath, safeSubdir, validBranch } from './paths'
export { planPublish, publishPlan } from './publish'
export type { PublishPlan } from './publish'

/** domains the manifest allows the plugin to talk to (see package.json networkAccess) */
export const HOSTS: Record<Provider, { label: string; domain: string; tokenHelp: string }> = {
  github: { label: 'GitHub', domain: 'api.github.com', tokenHelp: 'Fine-grained token for this repository only: Contents (read and write) and Pull requests (read and write).' },
  gitlab: { label: 'GitLab (gitlab.com)', domain: 'gitlab.com', tokenHelp: 'Personal or project access token with the api scope and at least the Developer role.' }
}

export function createClient(provider: Provider, repo: string, token: string, fetchFn: FetchFn): HostClient {
  if (!token.trim()) throw new HostError('auth', 'Paste an access token first (Settings → Output → Publish to a repository).')
  if (!/^[\w.-]+(\/[\w.-]+)+$/.test(repo)) throw new HostError('invalid', 'Enter the repository as owner/name.')
  return provider === 'github' ? githubClient(repo, token.trim(), fetchFn) : gitlabClient(repo, token.trim(), fetchFn)
}
