import { describe, expect, it } from 'vitest'
import { parseCatalog } from '../src/core/changelog'
import { FetchFn } from '../src/core/gitHost'
import { parseCatalogLink, readPublicCatalog, repoStatus } from '../src/core/repoCatalog'

const catalogText = JSON.stringify({
  namespace: 'cmn',
  icons: [
    { name: 'home', figma: { componentKey: 'k1' } },
    { name: 'search-new', figma: { componentKey: 'k2' } },
    { name: 'plain' }
  ]
})

const reply = (status: number, body: string, headers: Record<string, string> = {}): ReturnType<FetchFn> =>
  Promise.resolve({ status, ok: status >= 200 && status < 300, headers: { get: (n: string) => headers[n.toLowerCase()] ?? null }, text: () => Promise.resolve(body) })

describe('the link to icons.json', () => {
  it('reads GitHub blob, tree and raw links', () => {
    expect(parseCatalogLink('https://github.com/acme/icons/blob/main/src/icons/icons.json')).toEqual({ provider: 'github', repo: 'acme/icons', ref: 'main', path: 'src/icons/icons.json' })
    expect(parseCatalogLink('https://github.com/acme/icons/tree/v1.2.0/packages/icons')).toEqual({ provider: 'github', repo: 'acme/icons', ref: 'v1.2.0', path: 'packages/icons/icons.json' })
    expect(parseCatalogLink('https://raw.githubusercontent.com/acme/icons/main/icons.json')).toEqual({ provider: 'github', repo: 'acme/icons', ref: 'main', path: 'icons.json' })
  })
  it('reads GitLab blob, tree and raw links, including subgroups', () => {
    expect(parseCatalogLink('https://gitlab.com/acme/ds/icons/-/blob/main/icons.json')).toEqual({ provider: 'gitlab', repo: 'acme/ds/icons', ref: 'main', path: 'icons.json' })
    expect(parseCatalogLink('https://gitlab.com/acme/icons/-/tree/main/lib')).toEqual({ provider: 'gitlab', repo: 'acme/icons', ref: 'main', path: 'lib/icons.json' })
    expect(parseCatalogLink('https://gitlab.com/acme/icons/-/raw/main/icons.json')).toEqual({ provider: 'gitlab', repo: 'acme/icons', ref: 'main', path: 'icons.json' })
  })
  it('refuses anything else: other hosts, other files, plain http, credentials, odd characters, traversal', () => {
    for (const bad of [
      '', 'not a url', 'http://github.com/acme/icons/blob/main/icons.json', 'https://evil.example/acme/icons/blob/main/icons.json',
      'https://github.com/acme/icons', 'https://github.com/acme/icons/blob/main/package.json', 'https://user:pw@github.com/acme/icons/blob/main/icons.json',
      'https://github.com:8443/acme/icons/blob/main/icons.json', 'https://github.com/acme/icons/blob/main/%2e%2e/icons.json', 'https://github.com/acme/icons/blob/ma in/icons.json',
      'https://github.com/acme/icons/blob/main/a;b/icons.json', 'https://gitlab.com/acme/icons/blob/main/icons.json', 'https://github.com.evil.example/a/b/blob/main/icons.json'
    ]) expect(parseCatalogLink(bad), bad).toBeNull()
  })
})

describe('reading the catalog from a public repository', () => {
  const gh = { provider: 'github' as const, repo: 'acme/icons', ref: 'main', path: 'src/icons.json' }
  const gl = { provider: 'gitlab' as const, repo: 'acme/ds/icons', ref: 'main', path: 'lib/icons.json' }

  it('asks GitHub for the raw file with no token, and GitLab for its raw endpoint', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = []
    const fetchFn: FetchFn = (url, init) => {
      calls.push({ url, headers: init?.headers ?? {} })
      return reply(200, catalogText)
    }
    expect((await readPublicCatalog(gh, fetchFn)).icons).toHaveLength(3)
    expect((await readPublicCatalog(gl, fetchFn)).icons).toHaveLength(3)
    expect(calls[0].url).toBe('https://api.github.com/repos/acme/icons/contents/src/icons.json?ref=main')
    expect(calls[0].headers.Accept).toBe('application/vnd.github.raw+json')
    expect(calls[1].url).toBe('https://gitlab.com/api/v4/projects/acme%2Fds%2Ficons/repository/files/lib%2Ficons.json/raw?ref=main')
    for (const c of calls) expect(Object.keys(c.headers).some((h) => /authorization|token/i.test(h))).toBe(false)
  })

  it('says a private or missing repository could not be read', async () => {
    await expect(readPublicCatalog(gh, () => reply(404, '{"message":"Not Found"}'))).rejects.toThrow(/private repository cannot be read/)
  })

  it('reports rate limits and server errors in words', async () => {
    await expect(readPublicCatalog(gh, () => reply(403, '{"message":"API rate limit exceeded"}'))).rejects.toThrow(/limiting requests/)
    await expect(readPublicCatalog(gh, () => reply(502, 'bad gateway'))).rejects.toThrow(/problem \(502\)/)
  })

  it('validates what it reads: not a catalog, a Dev Mode selection, garbage', async () => {
    await expect(readPublicCatalog(gh, () => reply(200, '{"hello":1}'))).rejects.toThrow(/does not look like an icons.json/)
    await expect(readPublicCatalog(gh, () => reply(200, JSON.stringify({ partial: true, icons: [{ name: 'a' }] })))).rejects.toThrow(/Dev Mode selection/)
    await expect(readPublicCatalog(gh, () => reply(200, '<html>login</html>'))).rejects.toThrow()
  })
})

describe('is the icon in the repository', () => {
  const catalog = parseCatalog(catalogText)
  it('matches by component key first, so a renamed icon is found under its repository name', () => {
    expect(repoStatus({ name: 'home', componentKey: 'k1' }, catalog)).toEqual({ kind: 'in-repo' })
    expect(repoStatus({ name: 'search', componentKey: 'k2' }, catalog)).toEqual({ kind: 'renamed', repoName: 'search-new' })
  })
  it('falls back to the name, and reports an icon that is not there', () => {
    expect(repoStatus({ name: 'plain' }, catalog)).toEqual({ kind: 'in-repo' })
    expect(repoStatus({ name: 'plain', componentKey: 'unknown' }, catalog)).toEqual({ kind: 'in-repo' })
    expect(repoStatus({ name: 'brand-new', componentKey: 'k9' }, catalog)).toEqual({ kind: 'missing' })
    expect(repoStatus({ name: 'brand-new' }, catalog)).toEqual({ kind: 'missing' })
  })
})
