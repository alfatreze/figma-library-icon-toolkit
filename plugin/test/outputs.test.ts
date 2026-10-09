import { describe, expect, it } from 'vitest'
import { buildFiles } from '../src/core/generators'
import { createClient, planPublish, publishPlan } from '../src/core/gitHost'
import { baselineOutputOf, groupOutputs, mergePlans, newOutput, outputReady, packagesOf, settingsFor, validateOutputs } from '../src/core/outputs'
import { migrateSettings, SCHEMA, SHARED_KEYS } from '../src/core/settingsSchema'
import { DEFAULT_SETTINGS, OutputSettings, Settings } from '../src/types'
import { fakeGithub, newState } from './helpers/fakeHost'

const out = (over: Partial<OutputSettings> = {}): OutputSettings => ({ id: 'a', name: 'A', provider: 'github', repo: 'acme/icons', subdir: 'icons', branch: '', packages: null, ...over })
const tokens = { github: 'tok', gitlab: '' }
const formats = { ...DEFAULT_SETTINGS.formats, svg: true, sprite: false, html: false, mask: false, angularModern: true, angularClassic: false, react: true, webComponent: false, codeConnect: false }

describe('packages per output', () => {
  it('null means every package that is switched on; a list never adds one that is off', () => {
    expect(packagesOf(out(), formats).sort()).toEqual(['angularModern', 'react', 'svg'])
    expect(packagesOf(out({ packages: ['react', 'sprite'] }), formats)).toEqual(['react'])
  })
  it('settingsFor limits what one build produces, README included', () => {
    const s = settingsFor({ ...DEFAULT_SETTINGS, formats }, out({ packages: ['react'] }))
    expect(Object.entries(s.formats).filter(([, on]) => on).map(([k]) => k)).toEqual(['react'])
    const files = buildFiles({ allIcons: [], settings: s, grid: { width: 24, height: 24, count: 0, total: 0, padding: 0, detected: false } as never, tier: 'A' as never, generatedAt: '2026-01-01' })
    expect(Object.keys(files).some((p) => p.startsWith('react/'))).toBe(true)
    expect(Object.keys(files).some((p) => p.startsWith('svg/') || p.startsWith('angular/'))).toBe(false)
    expect(files['icons.json']).toBeTruthy() // shared files go to every output
  })
})

describe('validation', () => {
  it('needs a repository, a plain folder, a token for the host and at least one package', () => {
    const p = validateOutputs([out({ repo: 'nope', subdir: '', provider: 'gitlab', packages: ['sprite'] })], tokens, formats)
    expect(p.a).toHaveLength(4)
    expect(validateOutputs([out()], tokens, formats)).toEqual({})
  })
  it('rejects folders of one repository that are equal or nested, but allows siblings and other repositories', () => {
    const a = out({ id: 'a', subdir: 'packages/icons' })
    expect(validateOutputs([a, out({ id: 'b', subdir: 'packages/icons/' })], tokens, formats).b?.[0]).toMatch(/overlaps/)
    expect(validateOutputs([a, out({ id: 'b', subdir: 'packages/icons/angular' })], tokens, formats).a?.[0]).toMatch(/overlaps/)
    expect(validateOutputs([a, out({ id: 'b', subdir: 'packages/icons-react' })], tokens, formats)).toEqual({})
    expect(validateOutputs([a, out({ id: 'b', subdir: 'packages/icons', repo: 'acme/other' })], tokens, formats)).toEqual({})
  })
  it('knows when an output is ready', () => {
    expect(outputReady(out(), tokens)).toBe(true)
    expect(outputReady(out({ provider: 'gitlab' }), tokens)).toBe(false)
  })
  it('adds a new output that continues the previous one', () => {
    const n = newOutput([out({ repo: 'acme/mono', branch: 'icons/x' })])
    expect(n).toMatchObject({ id: 'output-2', repo: 'acme/mono', branch: 'icons/x', subdir: '', packages: null })
    expect(newOutput([]).subdir).toBe('icons') // the first output starts with the usual folder; later ones need their own
  })
})

describe('grouping', () => {
  it('outputs of one repository form one group with the first branch name and all packages', () => {
    const g = groupOutputs([out({ id: 'a', packages: ['svg'] }), out({ id: 'b', repo: 'ACME/icons', subdir: 'x', branch: 'icons/one', packages: ['react'] }), out({ id: 'c', repo: 'acme/app' })], formats)
    expect(g).toHaveLength(2)
    expect(g[0]).toMatchObject({ branch: 'icons/one', packages: ['svg', 'react'] })
    expect(g[0].outputs.map((o) => o.id)).toEqual(['a', 'b'])
  })
})

describe('publishing a monorepo as one branch', () => {
  it('plans every folder, merges them and creates one commit and one request', async () => {
    const st = newState({ 'README.md': 'repo' })
    const client = createClient('github', 'acme/icons', st.token, fakeGithub(st))
    const now = new Date('2026-10-09T12:04:00')
    const plans = [
      await planPublish({ client, files: { 'svg/a.svg': '<svg>a</svg>', 'icons.json': '{}' }, subdir: 'packages/icons-svg', now }),
      await planPublish({ client, files: { 'react/a.ts': 'export {}', 'icons.json': '{}' }, subdir: 'packages/icons-react', now })
    ]
    const plan = mergePlans(plans)
    expect(plan.branch).toBe(plans[0].branch)
    expect(plan.added).toHaveLength(4)
    await publishPlan(client, plan, { message: 'm', title: 't', body: 'b' })
    expect(st.pulls).toHaveLength(1)
    const branch = st.branches.get(plan.branch)!
    expect(branch.get('packages/icons-svg/svg/a.svg')).toBe('<svg>a</svg>')
    expect(branch.get('packages/icons-react/react/a.ts')).toBe('export {}')
    expect(branch.has('packages/icons-svg/.icon-toolkit.json') && branch.has('packages/icons-react/.icon-toolkit.json')).toBe(true) // each folder keeps its own managed list
  })
})

describe('settings migration', () => {
  it('turns the single repository of v2 into one output and a token for its host', () => {
    const s = migrateSettings({ repo: { provider: 'gitlab', repo: 'g/p', subdir: 'src/icons', branch: 'b', token: 'secret' } })
    expect(s.outputs).toEqual([{ id: 'default', name: 'Icon library', provider: 'gitlab', repo: 'g/p', subdir: 'src/icons', branch: 'b', packages: null }])
    expect(s.tokens).toEqual({ github: '', gitlab: 'secret' })
    expect('repo' in s).toBe(false)
  })
  it('an unconfigured v2 repository leaves no output behind', () => {
    expect(migrateSettings({ repo: { provider: 'github', repo: '', subdir: 'icons', branch: '', token: '' } }).outputs).toEqual([])
  })
  it('validates outputs: unknown packages and malformed entries are dropped, duplicate ids made unique', () => {
    const s = migrateSettings({ outputs: [out({ id: 'x' }), out({ id: 'x', packages: ['react'] }), { nope: 1 }, out({ id: 'y', packages: ['bogus'] as never })], tokens: { github: 5 } })
    expect(s.outputs.map((o) => o.id)).toEqual(['x', 'x-2', 'y'])
    expect(s.outputs[2].packages).toBeNull()
    expect(s.tokens.github).toBe('')
  })
  it('outputs and tokens are local to this computer, never in the team config', () => {
    const shared: (keyof Settings)[] = SHARED_KEYS
    expect(shared).not.toContain('outputs')
    expect(shared).not.toContain('tokens')
    expect(SCHEMA.outputs.shared || SCHEMA.tokens.shared).toBe(false)
  })
})

describe('baseline output', () => {
  const settings = (baselineOutput: string, outputsList: OutputSettings[]) => ({ outputs: outputsList, tokens, baselineOutput })
  it('uses the chosen output when it is ready, else the first that is', () => {
    const list = [out({ id: 'a' }), out({ id: 'b', subdir: 'b' }), out({ id: 'c', provider: 'gitlab', subdir: 'c' })]
    expect(baselineOutputOf(settings('b', list))?.id).toBe('b')
    expect(baselineOutputOf(settings('c', list))?.id).toBe('a') // chosen one has no token for its host
    expect(baselineOutputOf(settings('gone', list))?.id).toBe('a')
    expect(baselineOutputOf(settings('', []))).toBeUndefined()
  })
})

describe('Angular without the sprite package in the same output', () => {
  const base = { allIcons: [], grid: { width: 24, height: 24, count: 0, total: 0, padding: 0, detected: false } as never, tier: 'A' as never, generatedAt: '2026-01-01' }
  const only = (o: OutputSettings) => settingsFor({ ...DEFAULT_SETTINGS, formats: { ...formats, sprite: true } }, o)
  it('keeps the sprite strategy when another output publishes the sprite file', () => {
    const o = out({ packages: ['angularModern'] })
    const without = Object.keys(buildFiles({ ...base, settings: only(o) }))
    expect(without.some((p) => p.includes('-sprite'))).toBe(false)
    const withStrategy = Object.keys(buildFiles({ ...base, settings: only(o), spriteStrategy: true }))
    expect(withStrategy.some((p) => p.startsWith('angular/') && p.endsWith('-sprite.ts'))).toBe(true)
    expect(withStrategy.some((p) => p.startsWith('sprite/'))).toBe(false) // the file itself stays in the other output
  })
})

import { exportConfig } from '../src/core/config'
describe('exported config', () => {
  it('stores the namespace the files really use, not what was typed', () => {
    expect(JSON.parse(exportConfig({ ...DEFAULT_SETTINGS, namespace: 'gitl:' })).namespace).toBe('gitl')
  })
})
