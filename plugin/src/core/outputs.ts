import { OutputSettings, Settings } from '../types'
import { safeSubdir } from './gitHost/paths'
import { PublishPlan } from './gitHost/publish'

type Formats = Settings['formats']
export type PackageKey = keyof Formats

/** the packages an output receives: its own list, or everything that is switched on, never one that is switched off */
export function packagesOf(o: OutputSettings, formats: Formats): PackageKey[] {
  const on = (Object.keys(formats) as PackageKey[]).filter((k) => formats[k])
  return o.packages ? on.filter((k) => o.packages!.includes(k)) : on
}

/** settings with only this output's packages switched on, so one build produces exactly its files (README and manifest included) */
export function settingsFor(settings: Settings, o: OutputSettings): Settings {
  const keep = new Set(packagesOf(o, settings.formats))
  const formats = Object.fromEntries((Object.keys(settings.formats) as PackageKey[]).map((k) => [k, keep.has(k)])) as Formats
  return { ...settings, formats }
}

export const repoKey = (o: Pick<OutputSettings, 'provider' | 'repo'>) => `${o.provider}:${o.repo.trim().toLowerCase()}`
const repoShape = (r: string) => /^[\w.-]+(\/[\w.-]+)+$/.test(r.trim())

/** ready to publish: a valid repository and a token for its host */
export const outputReady = (o: OutputSettings, tokens: Settings['tokens']): boolean => repoShape(o.repo) && tokens[o.provider].trim().length > 0

/** the output whose icons.json is the "changed since" baseline: the chosen one if it is ready, else the first that is */
export function baselineOutputOf(settings: Pick<Settings, 'outputs' | 'tokens' | 'baselineOutput'>): OutputSettings | undefined {
  const ready = settings.outputs.filter((o) => outputReady(o, settings.tokens))
  return ready.find((o) => o.id === settings.baselineOutput) ?? ready[0]
}

export function newOutput(existing: OutputSettings[], over: Partial<OutputSettings> = {}): OutputSettings {
  let n = existing.length + 1
  while (existing.some((o) => o.id === `output-${n}`)) n++
  const last = existing[existing.length - 1]
  return { id: `output-${n}`, name: '', provider: last?.provider ?? 'github', repo: last?.repo ?? '', subdir: last ? '' : 'icons', branch: last?.branch ?? '', packages: null, ...over }
}

const norm = (s: string) => (safeSubdir(s) ?? s.trim().replace(/^\/+|\/+$/g, '')).toLowerCase()

/** problems that stop an output from being published, per output id */
export function validateOutputs(outputs: OutputSettings[], tokens: Settings['tokens'], formats: Formats): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const add = (id: string, m: string) => (out[id] = [...(out[id] ?? []), m])
  for (const o of outputs) {
    if (!repoShape(o.repo)) add(o.id, 'Enter the repository as owner/name (or group/project).')
    if (!safeSubdir(o.subdir)) add(o.id, 'Use a plain folder such as "icons" or "packages/icons-react": not the repository root, not a hidden folder.')
    if (!tokens[o.provider].trim()) add(o.id, `Add a ${o.provider === 'github' ? 'GitHub' : 'GitLab'} access token below.`)
    if (!packagesOf(o, formats).length) add(o.id, 'No package is selected for this output (or the ones selected are switched off in Packages).')
  }
  // two folders of one repository must not be the same or nested: the files and the managed-files list would collide
  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      const a = outputs[i]
      const b = outputs[j]
      if (repoKey(a) !== repoKey(b) || !a.subdir.trim() || !b.subdir.trim()) continue
      const x = norm(a.subdir)
      const y = norm(b.subdir)
      if (x === y || x.startsWith(y + '/') || y.startsWith(x + '/')) {
        const m = (other: OutputSettings) => `Folder overlaps with “${other.name || other.subdir}” in the same repository: give each output its own folder.`
        add(a.id, m(b))
        add(b.id, m(a))
      }
    }
  }
  return out
}

export interface OutputGroup {
  key: string
  provider: OutputSettings['provider']
  repo: string
  outputs: OutputSettings[]
  /** the branch to create: the first one named by an output, else generated */
  branch: string
  /** every package any of the outputs receives */
  packages: PackageKey[]
}

/** outputs that share a repository are published together: one branch, one commit, one pull / merge request */
export function groupOutputs(outputs: OutputSettings[], formats: Formats): OutputGroup[] {
  const groups = new Map<string, OutputGroup>()
  for (const o of outputs) {
    const key = repoKey(o)
    const g = groups.get(key) ?? { key, provider: o.provider, repo: o.repo.trim(), outputs: [], branch: '', packages: [] }
    g.outputs.push(o)
    if (!g.branch && o.branch.trim()) g.branch = o.branch.trim()
    for (const k of packagesOf(o, formats)) if (!g.packages.includes(k)) g.packages.push(k)
    groups.set(key, g)
  }
  return [...groups.values()]
}

/** the plans of the outputs of one repository as a single plan (folders are disjoint, so the changes simply add up) */
export function mergePlans(plans: PublishPlan[]): PublishPlan {
  const first = plans[0]
  return {
    ...first,
    subdir: plans.map((p) => p.subdir).join(', '),
    added: plans.flatMap((p) => p.added),
    changed: plans.flatMap((p) => p.changed),
    removed: plans.flatMap((p) => p.removed),
    unchanged: plans.reduce((n, p) => n + p.unchanged, 0),
    changes: plans.flatMap((p) => p.changes),
    existing: new Set(plans.flatMap((p) => [...p.existing]))
  }
}
