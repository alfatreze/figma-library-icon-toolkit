import { ALL_TARGETS_ON, buildFiles, TARGETS } from '../core/generators'
import { Tier } from '../core/library'
import { GridInfo, Icon, Settings } from '../types'

export interface OverviewRow {
  id: keyof Settings['formats'] | 'meta'
  label: string
  detail: string
  files: number
  bytes: number
}

const META_ROW = { id: 'meta' as const, label: 'Manifest & guide', detail: 'README.md (how to use it), icons.json (catalogue), toolkit.config.json, AGENTS.md (for AI agents), CHANGELOG.md / FIX-PLAN.md when applicable. Always included.' }
const ROWS: { id: OverviewRow['id']; label: string; detail: string }[] = [...TARGETS.map((t) => ({ id: t.key, label: t.label, detail: t.detail })), META_ROW]

const bytes = (s: string) => new TextEncoder().encode(s).length

/** Builds every format once (all enabled) so each row can show its real file count and size. */
export function computeOverview(icons: Icon[], settings: Settings, grid: GridInfo, tier: Tier): OverviewRow[] {
  const files = buildFiles({ allIcons: icons, settings: { ...settings, formats: ALL_TARGETS_ON }, grid, tier, generatedAt: 'preview' })
  const rows = new Map<OverviewRow['id'], OverviewRow>(ROWS.map((r) => [r.id, { ...r, files: 0, bytes: 0 }]))
  for (const [path, content] of Object.entries(files)) {
    const id: OverviewRow['id'] = TARGETS.find((t) => t.owns(path))?.key ?? 'meta'
    const r = rows.get(id)!
    r.files++
    r.bytes += bytes(content)
  }
  return [...rows.values()]
}

export const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`)
