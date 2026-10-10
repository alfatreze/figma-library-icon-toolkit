import { GridInfo, Icon, Profile, Severity } from '../types'
import { Diff } from './changelog'
import { Tier, TIER_LABEL } from './library'
import { RULES, STEPS } from './rules'

/**
 * The library health report: one file a system manager can share without opening Figma. Pure: it reads the scanned icons (with their
 * findings and available fixes) and the comparison with the baseline, and renders Markdown or a self-contained HTML page.
 */

export interface HealthInput {
  /** the library name shown in the title (the namespace) */
  title: string
  generatedAt: string
  icons: Icon[]
  tier: Tier
  grid: GridInfo
  profile: Profile
  diff: Diff | null
  /** where the diff comes from, e.g. "This computer" */
  baseline: string | null
  /** icons the scan looked at but did not treat as icons */
  skipped: number
}

export interface AreaRow { step: number; title: string; icons: number; errors: number; warnings: number; notes: number; status: 'ok' | 'notes' | 'attention' | 'blocked' }
export interface RuleRow { ruleId: string; title: string; severity: Severity; icons: number; autoFixable: number }
export interface Blocker { name: string; page: string; nodeId: string; messages: string[] }

export interface HealthReport {
  title: string
  generatedAt: string
  verdict: 'good' | 'fair' | 'needs work'
  tierLabel: string
  profile: Profile
  grid: string
  skipped: number
  totals: { icons: number; ready: number; readyPct: number; blocked: number; warned: number; noted: number }
  coverage: { components: number; descriptions: number; boundColours: number }
  areas: AreaRow[]
  rules: RuleRow[]
  blockers: Blocker[]
  autoFixable: number
  /** components that no instance in the scanned pages uses (other files are not visible to a plugin) */
  unused: { count: number; of: number; names: string[] }
  changes: { baseline: string; added: number; removed: number; renamed: number; changed: number; recoloured: number; moved: number; unchanged: number; bump: Diff['bump']; breaking: boolean } | null
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 100)
const sevOf = (i: Icon, s: Severity) => i.findings.some((f) => f.severity === s)
const fixKind = (ruleId: string) => (ruleId === 'not-component' ? 'convert-frame' : ruleId)
export const MAX_BLOCKERS = 60
export const MAX_RULES = 15
export const MAX_UNUSED = 60
export const UNUSED_NOTE = 'Only the pages that were scanned are counted. Files that use this library are not visible to a plugin, so check the library analytics in Figma before removing an icon.'

export function buildHealth(input: HealthInput): HealthReport {
  const { icons } = input
  const n = icons.length
  const blocked = icons.filter((i) => sevOf(i, 'error'))
  const warned = icons.filter((i) => !sevOf(i, 'error') && sevOf(i, 'warn'))
  const noted = icons.filter((i) => !sevOf(i, 'error') && !sevOf(i, 'warn') && i.findings.length > 0)
  const ready = n - blocked.length - warned.length

  const areas: AreaRow[] = STEPS.map((s) => {
    const inArea = icons.map((i) => ({ i, f: i.findings.filter((f) => RULES[f.ruleId]?.step === s.step) })).filter((x) => x.f.length)
    const count = (sev: Severity) => inArea.filter((x) => x.f.some((f) => f.severity === sev)).length
    const errors = count('error')
    const warnings = inArea.filter((x) => !x.f.some((f) => f.severity === 'error') && x.f.some((f) => f.severity === 'warn')).length
    return {
      step: s.step,
      title: s.title,
      icons: inArea.length,
      errors,
      warnings,
      notes: inArea.length - errors - warnings,
      status: errors ? 'blocked' : warnings ? 'attention' : inArea.length ? 'notes' : 'ok'
    } as AreaRow
  })

  const byRule = new Map<string, { sev: Severity; set: Set<Icon> }>()
  for (const i of icons) {
    for (const f of i.findings) {
      const e = byRule.get(f.ruleId) ?? { sev: f.severity, set: new Set<Icon>() }
      if (f.severity === 'error' || (f.severity === 'warn' && e.sev === 'info')) e.sev = f.severity
      e.set.add(i)
      byRule.set(f.ruleId, e)
    }
  }
  const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 }
  const rules: RuleRow[] = [...byRule.entries()]
    .map(([ruleId, e]) => ({
      ruleId,
      title: RULES[ruleId]?.title ?? ruleId,
      severity: e.sev,
      icons: e.set.size,
      autoFixable: [...e.set].filter((i) => (i.fixes ?? []).some((f) => f.kind === fixKind(ruleId) && f.actions.length > 0)).length
    }))
    .sort((a, b) => order[a.severity] - order[b.severity] || b.icons - a.icons)
    .slice(0, MAX_RULES)

  const comps = icons.filter((i) => i.sourceKind === 'component' || i.sourceKind === 'component-set')
  const d = input.diff
  const verdict = input.tier === 'T5' || input.tier === 'T4' ? 'good' : input.tier === 'T3' ? 'fair' : 'needs work'
  return {
    title: input.title,
    generatedAt: input.generatedAt,
    verdict,
    tierLabel: TIER_LABEL[input.tier],
    profile: input.profile,
    grid: input.grid.width && input.grid.height ? `${input.grid.width}×${input.grid.height}${input.grid.detected ? ' (detected)' : ''}` : 'not detected',
    skipped: input.skipped,
    totals: { icons: n, ready, readyPct: pct(ready, n), blocked: blocked.length, warned: warned.length, noted: noted.length },
    coverage: {
      components: pct(comps.length, n),
      descriptions: pct(comps.filter((i) => i.description.trim()).length, comps.length),
      boundColours: pct(icons.filter((i) => !i.findings.some((f) => f.ruleId === 'unbound-color')).length, n)
    },
    areas,
    rules,
    unused: (() => {
      const placed = icons.filter((i) => i.placements !== undefined)
      const none = placed.filter((i) => i.placements === 0)
      return { count: none.length, of: placed.length, names: none.slice(0, MAX_UNUSED).map((i) => i.layerName) }
    })(),
    blockers: blocked.slice(0, MAX_BLOCKERS).map((i) => ({ name: i.layerName, page: i.pageName, nodeId: i.nodeId, messages: i.findings.filter((f) => f.severity === 'error').map((f) => f.message) })),
    autoFixable: icons.filter((i) => (i.fixes ?? []).some((f) => f.actions.length > 0 && f.confidence !== 'low')).length,
    changes: d && input.baseline
      ? { baseline: input.baseline, added: d.added.length, removed: d.removed.length, renamed: d.renamed.length, changed: d.changed.length, recoloured: d.recoloured.length, moved: d.moved.length, unchanged: d.unchanged, bump: d.bump, breaking: d.removed.length + d.renamed.length > 0 }
      : null
  }
}

// ---- renderers -----------------------------------------------------------------------------------------------------------------

/** a cell of a Markdown table: no pipes or line breaks, and no raw HTML for the viewers that render it */
const md = (v: string) => v.replace(/\|/g, '/').replace(/[\r\n]+/g, ' ').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const sevWord: Record<Severity, string> = { error: 'blocks export', warn: 'warning', info: 'note' }
const areaWord: Record<AreaRow['status'], string> = { ok: 'ok', notes: 'notes only', attention: 'needs attention', blocked: 'blocks export' }

export function healthMarkdown(r: HealthReport): string {
  const t = r.totals
  const out: string[] = [
    `# ${md(r.title)} icon library: health report`,
    '',
    `Generated ${r.generatedAt} by Icon Library Toolkit. Read-only: nothing was changed in Figma.`,
    '',
    `**Library health: ${r.verdict}** (${r.tierLabel}) · audit level ${r.profile} · grid ${r.grid}`,
    '',
    `- **${t.icons}** icons scanned${r.skipped ? ` (${r.skipped} other layers skipped)` : ''}`,
    `- **${t.ready}** ready (${t.readyPct}%): no errors or warnings`,
    `- **${t.blocked}** blocked (not exported until fixed), **${t.warned}** with warnings, **${t.noted}** with notes only`,
    `- **${r.autoFixable}** have an automatic fix available (applied in Figma, Labs)`,
    '',
    '## Coverage',
    '',
    `- Components (stable key for design ↔ code): ${r.coverage.components}%`,
    `- Components with a description (search tags): ${r.coverage.descriptions}%`,
    `- Colours bound to variables: ${r.coverage.boundColours}%`,
    '',
    '## By area',
    '',
    '| Area | Icons affected | Blocking | Warnings | Notes | Status |',
    '|---|---|---|---|---|---|',
    ...r.areas.map((a) => `| ${a.step}. ${md(a.title)} | ${a.icons} | ${a.errors} | ${a.warnings} | ${a.notes} | ${areaWord[a.status]} |`),
    ''
  ]
  if (r.changes) {
    const c = r.changes
    out.push(
      `## Changes since the baseline (${md(c.baseline)})`,
      '',
      `${c.added} added · ${c.removed} removed · ${c.renamed} renamed · ${c.changed} drawing changed · ${c.recoloured} recoloured · ${c.moved} moved category · ${c.unchanged} unchanged`,
      '',
      c.breaking ? `**Breaking:** removed or renamed icons need a major version (suggested bump: ${c.bump}).` : `Suggested version bump: ${c.bump}.`,
      ''
    )
  } else out.push('## Changes', '', 'No baseline was selected, so changes are not shown.', '')
  if (r.unused.of > 0) {
    out.push(`## Not placed in the scanned pages (${r.unused.count} of ${r.unused.of} components)`, '', UNUSED_NOTE, '')
    for (const n of r.unused.names) out.push(`- ${md(n)}`)
    if (r.unused.count > r.unused.names.length) out.push(`- …and ${r.unused.count - r.unused.names.length} more.`)
    out.push('')
  }
  out.push('## Most common issues', '', '| Issue | Severity | Icons | Auto-fix |', '|---|---|---|---|')
  for (const x of r.rules) out.push(`| ${md(x.title)} | ${sevWord[x.severity]} | ${x.icons} | ${x.autoFixable || '–'} |`)
  if (!r.rules.length) out.push('| No findings | | | |')
  out.push('')
  if (r.blockers.length) {
    out.push(`## Blocked icons (${t.blocked})`, '', 'These are not exported until fixed or excluded.', '', '| Icon | Page | Node | Why |', '|---|---|---|---|')
    for (const b of r.blockers) out.push(`| ${md(b.name)} | ${md(b.page)} | ${md(b.nodeId)} | ${md(b.messages.join(' '))} |`)
    if (t.blocked > r.blockers.length) out.push('', `…and ${t.blocked - r.blockers.length} more.`)
    out.push('')
  }
  return out.join('\n')
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function healthHtml(r: HealthReport): string {
  const t = r.totals
  const bar = (p: number) => `<span class="bar"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></span>`
  const stat = (value: string | number, label: string, cls = '') => `<div class="stat ${cls}"><b>${esc(String(value))}</b><span>${esc(label)}</span></div>`
  const areaRows = r.areas
    .map((a) => `<tr class="${a.status}"><td>${a.step}. ${esc(a.title)}</td><td>${a.icons}</td><td>${a.errors}</td><td>${a.warnings}</td><td>${a.notes}</td><td>${esc(areaWord[a.status])}</td></tr>`)
    .join('')
  const ruleRows = r.rules.map((x) => `<tr class="${x.severity}"><td>${esc(x.title)}</td><td>${esc(sevWord[x.severity])}</td><td>${x.icons}</td><td>${x.autoFixable || '–'}</td></tr>`).join('') || '<tr><td colspan="4">No findings</td></tr>'
  const blockerRows = r.blockers.map((b) => `<tr><td>${esc(b.name)}</td><td>${esc(b.page)}</td><td><code>${esc(b.nodeId)}</code></td><td>${esc(b.messages.join(' '))}</td></tr>`).join('')
  const c = r.changes
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.title)} icon library: health report</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1e1e1e;--muted:#6b6b6b;--line:#e3e3e3;--card:#f7f7f7;--ok:#0a7d3b;--warn:#b86200;--err:#c4301d;--accent:#0d7ae6}
@media (prefers-color-scheme:dark){:root{--bg:#1e1e1e;--fg:#f2f2f2;--muted:#a8a8a8;--line:#3a3a3a;--card:#2a2a2a;--ok:#4cc38a;--warn:#f0b64a;--err:#ff8a7a;--accent:#5eb2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 20px 64px}h1{font-size:24px;margin:0 0 4px}h2{font-size:16px;margin:32px 0 8px}
.muted{color:var(--muted)}.verdict{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:600;background:var(--card);border:1px solid var(--line)}
.verdict.good{color:var(--ok)}.verdict.fair{color:var(--warn)}.verdict.needs{color:var(--err)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:16px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}.stat b{display:block;font-size:24px}.stat span{color:var(--muted);font-size:12px}
.stat.err b{color:var(--err)}.stat.warn b{color:var(--warn)}.stat.ok b{color:var(--ok)}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600;font-size:12px}
tr.blocked td:last-child,tr.error td:nth-child(2){color:var(--err);font-weight:600}tr.attention td:last-child,tr.warn td:nth-child(2){color:var(--warn);font-weight:600}tr.ok td:last-child{color:var(--ok)}tr.notes td:last-child{color:var(--muted)}
.bar{display:inline-block;width:160px;height:8px;border-radius:4px;background:var(--line);vertical-align:middle;margin-left:8px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
code{font:12px ui-monospace,Menlo,monospace}.note{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
@media print{body{background:#fff;color:#000}.bar{border:1px solid #999}}
</style></head><body><main>
<h1>${esc(r.title)} icon library</h1>
<div class="muted">Health report · generated ${esc(r.generatedAt)} by Icon Library Toolkit · read-only, nothing was changed in Figma</div>
<p><span class="verdict ${r.verdict === 'needs work' ? 'needs' : r.verdict}">Library health: ${esc(r.verdict)}</span> <span class="muted">${esc(r.tierLabel)} · audit level ${esc(r.profile)} · grid ${esc(r.grid)}</span></p>
<div class="stats">
${stat(t.icons, 'icons scanned' + (r.skipped ? ` (${r.skipped} layers skipped)` : ''))}${stat(`${t.readyPct}%`, `ready (${t.ready}): no errors or warnings`, t.readyPct >= 90 ? 'ok' : 'warn')}${stat(t.blocked, 'blocked, not exported until fixed', t.blocked ? 'err' : 'ok')}${stat(t.warned, 'with warnings', t.warned ? 'warn' : 'ok')}${stat(r.autoFixable, 'have an automatic fix')}
</div>
<h2>Coverage</h2>
<table><tr><td>Components (stable key for design ↔ code)</td><td>${r.coverage.components}%${bar(r.coverage.components)}</td></tr>
<tr><td>Components with a description (search tags)</td><td>${r.coverage.descriptions}%${bar(r.coverage.descriptions)}</td></tr>
<tr><td>Colours bound to variables</td><td>${r.coverage.boundColours}%${bar(r.coverage.boundColours)}</td></tr></table>
<h2>By area</h2>
<table><tr><th>Area</th><th>Icons affected</th><th>Blocking</th><th>Warnings</th><th>Notes</th><th>Status</th></tr>${areaRows}</table>
<h2>${c ? `Changes since the baseline (${esc(c.baseline)})` : 'Changes'}</h2>
${c ? `<p>${c.added} added · ${c.removed} removed · ${c.renamed} renamed · ${c.changed} drawing changed · ${c.recoloured} recoloured · ${c.moved} moved category · ${c.unchanged} unchanged</p><p class="note">${c.breaking ? `<b>Breaking:</b> removed or renamed icons need a major version (suggested bump: ${esc(c.bump)}).` : `Suggested version bump: ${esc(c.bump)}.`}</p>` : '<p class="muted">No baseline was selected, so changes are not shown.</p>'}
<h2>Most common issues</h2>
<table><tr><th>Issue</th><th>Severity</th><th>Icons</th><th>Auto-fix</th></tr>${ruleRows}</table>
${r.unused.of > 0 ? `<h2>Not placed in the scanned pages (${r.unused.count} of ${r.unused.of} components)</h2><p class="muted">${esc(UNUSED_NOTE)}</p>${r.unused.names.length ? `<p>${r.unused.names.map((n) => `<code>${esc(n)}</code>`).join(' · ')}${r.unused.count > r.unused.names.length ? ` · …and ${r.unused.count - r.unused.names.length} more` : ''}</p>` : ''}` : ''}
${r.blockers.length ? `<h2>Blocked icons (${t.blocked})</h2><p class="muted">Not exported until fixed or excluded.</p><table><tr><th>Icon</th><th>Page</th><th>Node</th><th>Why</th></tr>${blockerRows}</table>${t.blocked > r.blockers.length ? `<p class="muted">…and ${t.blocked - r.blockers.length} more.</p>` : ''}` : ''}
</main></body></html>
`
}
