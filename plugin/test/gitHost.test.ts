import { beforeEach, describe, expect, it } from 'vitest'
import { chunkChanges } from '../src/core/gitHost/github'
import { chunkActions } from '../src/core/gitHost/gitlab'
import { createClient, gitBlobSha, HostError, MANAGED_FILE, parseRepoInput, planPublish, publishPlan, safeGeneratedPath, safeSubdir, validBranch } from '../src/core/gitHost'
import { FakeState, fakeGithub, fakeGitlab, newState } from './helpers/fakeHost'

const NOW = new Date('2026-10-09T12:04:00')

describe('input checks', () => {
  it('git blob ids match git', async () => {
    expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391') // git hash-object of an empty file
    expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
  })
  it('folder and file names', () => {
    for (const bad of ['', '.', '..', '.github', 'a/.git/x', 'node_modules/x', '../x', 'a b', 'icons;rm']) expect(safeSubdir(bad), bad).toBeNull()
    expect(safeSubdir('/src/icons/')).toBe('src/icons')
    for (const bad of ['.env', 'a/.git/hooks/pre-commit', 'package.json', 'x/tsconfig.json', 'run.sh', 'a.mjs', '../x.svg', '/abs.svg', 'a\\b.svg']) expect(safeGeneratedPath(bad), bad).toBe(false)
    for (const good of ['svg/a.svg', 'angular/icons/home.ts', 'html/index.html', 'icons.json', 'README.md']) expect(safeGeneratedPath(good), good).toBe(true)
    for (const bad of ['', '-x', 'a..b', 'a//b', 'x.lock', 'a b', 'a/']) expect(validBranch(bad), bad).toBe(false)
    expect(validBranch('icons/update-2026-10-09')).toBe(true)
  })
  it('repository input from names and URLs', () => {
    expect(parseRepoInput('acme/icons')).toEqual({ provider: null, repo: 'acme/icons' })
    expect(parseRepoInput('https://github.com/acme/icons.git')).toEqual({ provider: 'github', repo: 'acme/icons' })
    expect(parseRepoInput('https://github.com/acme/icons/tree/main/src')).toEqual({ provider: 'github', repo: 'acme/icons' })
    expect(parseRepoInput('git@github.com:acme/icons.git')).toEqual({ provider: 'github', repo: 'acme/icons' })
    expect(parseRepoInput('https://gitlab.com/group/sub/proj/-/merge_requests')).toEqual({ provider: 'gitlab', repo: 'group/sub/proj' })
    expect(parseRepoInput('https://git.example.org/team/app')).toEqual({ provider: null, repo: 'team/app', unsupportedHost: 'git.example.org' })
    expect(parseRepoInput('nonsense')).toBeNull()
    expect(parseRepoInput('')).toBeNull()
  })
  it('requests are split into bounded chunks', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ path: `p${i}`, content: 'x' }))
    expect(chunkChanges(many).map((c) => c.length)).toEqual([250, 250, 100])
    const big = [{ path: 'a', content: 'x'.repeat(1_000_000) }, { path: 'b', content: 'x'.repeat(1_000_000) }]
    expect(chunkChanges(big)).toHaveLength(2)
    expect(chunkActions(many.map((m) => ({ ...m, action: 'create' }))).map((c) => c.length)).toEqual([200, 200, 200])
  })
})

for (const provider of ['github', 'gitlab'] as const) {
  describe(`publishing to ${provider}`, () => {
    let st: FakeState
    const client = () => createClient(provider, provider === 'github' ? 'acme/icons' : 'group/sub/icons', st.token, provider === 'github' ? fakeGithub(st) : fakeGitlab(st))
    const files = { 'svg/a.svg': '<svg>a</svg>', 'svg/b.svg': '<svg>b</svg>', 'icons.json': '{}' }
    beforeEach(() => {
      st = newState({ 'README.md': 'my repo', 'package.json': '{}' })
    })

    it('first publish: everything is new, the branch gets one reviewable change and a pull / merge request', async () => {
      const plan = await planPublish({ client: client(), files, subdir: 'icons', now: NOW })
      expect(plan.base).toBe('main')
      expect(plan.branch).toBe('icons/update-2026-10-09-1204')
      expect(plan.added.sort()).toEqual(['icons.json', 'svg/a.svg', 'svg/b.svg'])
      expect(plan.changed).toEqual([])
      const done = await publishPlan(client(), plan, { message: 'Update icons', title: 'Update icons to 1.0.0', body: 'Body' })
      expect(done.url).toMatch(provider === 'github' ? /github\.com\/acme\/icons\/pull\/1$/ : /gitlab\.com\/group\/sub\/icons\/-\/merge_requests\/1$/)
      expect(st.pulls).toEqual([{ title: 'Update icons to 1.0.0', head: plan.branch, base: 'main', body: 'Body' }])
      const branch = st.branches.get(plan.branch)!
      expect(branch.get('icons/svg/a.svg')).toBe('<svg>a</svg>')
      expect(branch.get('README.md')).toBe('my repo') // the rest of the repo is untouched
      expect(st.branches.get('main')!.has('icons/svg/a.svg')).toBe(false) // the default branch never changes
      expect(JSON.parse(branch.get(`icons/${MANAGED_FILE}`)!).files.sort()).toEqual(['icons.json', 'svg/a.svg', 'svg/b.svg'])
    })

    it('second publish sends only what changed and removes only files the tool created', async () => {
      const first = await planPublish({ client: client(), files, subdir: 'icons', now: NOW })
      await publishPlan(client(), first, { message: 'm', title: 't', body: 'b' })
      // "merge": main now equals the first branch, plus a file somebody added by hand in the same folder
      const merged = new Map(st.branches.get(first.branch)!)
      merged.set('icons/mine.txt', 'hand written')
      st.branches.set('main', merged)
      const next = { 'svg/a.svg': '<svg>a2</svg>', 'svg/c.svg': '<svg>c</svg>', 'icons.json': '{}' }
      const plan = await planPublish({ client: client(), files: next, subdir: 'icons', now: new Date('2026-10-10T08:00:00') })
      expect(plan.changed).toEqual(['svg/a.svg'])
      expect(plan.added).toEqual(['svg/c.svg'])
      expect(plan.removed).toEqual(['svg/b.svg'])
      expect(plan.unchanged).toBe(1)
      await publishPlan(client(), plan, { message: 'm', title: 't', body: 'b' })
      const branch = st.branches.get(plan.branch)!
      expect(branch.has('icons/svg/b.svg')).toBe(false)
      expect(branch.get('icons/mine.txt')).toBe('hand written')
      expect(branch.get('icons/svg/a.svg')).toBe('<svg>a2</svg>')
    })

    it('an unchanged export has nothing to publish', async () => {
      const plan = await planPublish({ client: client(), files, subdir: 'icons', now: NOW })
      await publishPlan(client(), plan, { message: 'm', title: 't', body: 'b' })
      st.branches.set('main', new Map(st.branches.get(plan.branch)!))
      const again = await planPublish({ client: client(), files, subdir: 'icons', now: new Date('2026-10-10T08:00:00') })
      expect(again.changes).toEqual([])
      await expect(publishPlan(client(), again, { message: 'm', title: 't', body: 'b' })).rejects.toThrow(/Nothing to publish/)
    })

    it('large exports are uploaded in several requests', async () => {
      const bulk: Record<string, string> = {}
      for (let i = 0; i < 620; i++) bulk[`svg/i${i}.svg`] = `<svg>${i}</svg>`
      const plan = await planPublish({ client: client(), files: bulk, subdir: 'icons', now: NOW })
      const progress: number[] = []
      const done = await publishPlan(client(), plan, { message: 'm', title: 't', body: 'b', onProgress: (d) => progress.push(d) })
      expect(st.branches.get(plan.branch)!.size).toBe(2 + 620 + 1)
      expect(progress.length).toBeGreaterThan(1)
      expect(progress[progress.length - 1]).toBe(plan.changes.length)
      if (provider === 'github') expect(done.commits).toBe(1)
      else expect(done.commits).toBeGreaterThan(1)
    })

    it('refuses what must not happen', async () => {
      const c = client()
      await expect(planPublish({ client: c, files, subdir: '.github', now: NOW })).rejects.toThrow(/plain folder/)
      await expect(planPublish({ client: c, files, subdir: '' as string, now: NOW })).rejects.toThrow(/plain folder/)
      await expect(planPublish({ client: c, files: { 'run.sh': 'x' }, subdir: 'icons', now: NOW })).rejects.toThrow(/Refusing to publish/)
      await expect(planPublish({ client: c, files, subdir: 'icons', branch: 'main', now: NOW })).rejects.toThrow(/Not publishing to "main"/)
      await expect(planPublish({ client: c, files, subdir: 'icons', branch: 'bad..name', now: NOW })).rejects.toThrow(/usable branch/)
      st.branches.set('icons/taken', new Map())
      await expect(planPublish({ client: c, files, subdir: 'icons', branch: 'icons/taken', now: NOW })).rejects.toMatchObject({ kind: 'exists' })
      st.canWrite = false
      await expect(planPublish({ client: client(), files, subdir: 'icons', now: NOW })).rejects.toMatchObject({ kind: 'permission' })
    })

    it('explains failures in plain words', async () => {
      st.token = 'something-else'
      await expect(planPublish({ client: createClient(provider, provider === 'github' ? 'acme/icons' : 'group/sub/icons', 'wrong', provider === 'github' ? fakeGithub(st) : fakeGitlab(st)), files, subdir: 'icons', now: NOW })).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('did not accept the token') })
      st.token = 'good-token'
      const other = createClient(provider, provider === 'github' ? 'nobody/none' : 'nobody/none', st.token, provider === 'github' ? fakeGithub(st) : fakeGitlab(st))
      await expect(planPublish({ client: other, files, subdir: 'icons', now: NOW })).rejects.toMatchObject({ kind: 'notfound' })
      st.networkDown = true
      await expect(planPublish({ client: client(), files, subdir: 'icons', now: NOW })).rejects.toMatchObject({ kind: 'network' })
      st.networkDown = false
      st.failNext.push({ match: /GET .*(\/repos\/acme\/icons|projects\/[^/]+)$/, status: 403, body: { message: 'API rate limit exceeded' } })
      await expect(planPublish({ client: client(), files, subdir: 'icons', now: NOW })).rejects.toMatchObject({ kind: 'rate' })
    })

    it('if only the pull / merge request fails, the branch is kept and the user is told', async () => {
      const plan = await planPublish({ client: client(), files, subdir: 'icons', now: NOW })
      st.failNext.push({ match: provider === 'github' ? /POST .*\/pulls$/ : /POST .*merge_requests$/, status: 500 })
      const done = await publishPlan(client(), plan, { message: 'm', title: 't', body: 'b' })
      expect(done.url).toBeNull()
      expect(done.requestError).toMatch(/problem/)
      expect(st.branches.has(plan.branch)).toBe(true)
    })

    it('the token only ever goes to the provider, and never into a body or url', async () => {
      const plan = await planPublish({ client: client(), files, subdir: 'icons', now: NOW })
      await publishPlan(client(), plan, { message: 'm', title: 't', body: 'b' })
      for (const r of st.requests) {
        expect(r.url.startsWith(provider === 'github' ? 'https://api.github.com/' : 'https://gitlab.com/api/v4/')).toBe(true)
        expect(r.url).not.toContain('good-token')
        expect(JSON.stringify(r.body ?? '')).not.toContain('good-token')
      }
    })
  })
}

describe('createClient', () => {
  it('needs a token and a repository name', () => {
    const f = fakeGithub(newState())
    expect(() => createClient('github', 'acme/icons', '  ', f)).toThrow(HostError)
    expect(() => createClient('github', 'nonsense', 'tok', f)).toThrow(/owner\/name/)
  })
})
