import { Finding, Icon } from '../../types'
import { TIER_LABEL } from '../library'
import { summariseCategories } from '../categories'
import { OVERRIDES } from '../overrides'
import { RULES, STEPS } from '../rules'
import { changelogMarkdown } from '../changelog'
import { BuildInput, componentName, Files, ns, strokeSteps, symbolId, policyOf } from './common'

export function manifestFile(b: BuildInput): string {
  const n = ns(b)
  const data = {
    namespace: n,
    version: 1,
    libraryVersion: b.release?.version ?? '1.0.0',
    generatedAt: b.generatedAt,
    deprecated: b.release?.deprecated ?? [],
    stroke: { policy: policyOf(b), table: strokeSteps(b), note: policyOf(b) === 'scale' ? 'strokes scale with the icon' : 'strokes use vector-effect: non-scaling-stroke (screen px)' },
    tier: { id: b.tier, label: TIER_LABEL[b.tier] },
    grid: { width: b.grid.width, height: b.grid.height, padding: b.grid.padding, detected: b.grid.detected },
    cssVariables: {
      size: `--${n}-icon-size`,
      color: `--${n}-icon-color`,
      colorN: `--${n}-icon-color-N`,
      strokeWidth: `--${n}-icon-stroke-width`
    },
    categories: summariseCategories(b.icons),
    icons: b.icons.map((i) => ({
      id: `${n}:${i.name}`,
      name: i.name,
      ...(i.aliasOf ? { aliasOf: i.aliasOf } : {}),
      hash: i.hash,
      colorHash: i.colorHash,
      identity: i.componentKey ? { by: 'componentKey', key: i.componentKey } : { by: 'name', key: i.name },
      outlinedStrokes: i.outlined,
      category: i.category,
      categoryLabel: i.categoryLabel,
      kind: i.kind,
      viewBox: i.viewBox,
      colorSlots: i.slots.map((s) => ({
        cssVar: s.cssVar,
        default: s.index === 1 ? 'currentColor' : s.hex,
        drawnAs: s.hex,
        designToken: s.token ?? null,
        figmaVariable: s.variable ?? null
      })),
      strokeWidth: i.strokeWidth,
      tags: i.tags,
      figma: {
        sourceKind: i.sourceKind,
        componentKey: i.componentKey ?? null,
        nodeId: i.nodeId,
        page: i.pageName,
        layerName: i.layerName,
        variantProps: i.variantProps,
        set: i.setName ?? null
      },
      inUse: i.usage
        ? {
            instances: i.usage.instances,
            fromLinkedLibrary: i.usage.remote,
            pages: i.usage.pages,
            sizes: i.usage.sizes,
            overrides: i.usage.overrides,
            overrideColors: i.usage.colors,
            exportedFrom: i.usage.exportedFrom
          }
        : null,
      usage: {
        sprite: `<svg class="${n}-icon" aria-hidden="true" focusable="false"><use href="${n}-sprite.svg#${symbolId(b, i)}"/></svg>`,
        mask: i.maskSvg ? `<i class="${n}-icon ${n}-icon--${i.name}" aria-hidden="true"></i>` : null,
        angular: `<${n}-icon name="${i.name}" />`
      },
      audit: {
        errors: i.findings.filter((f) => f.severity === 'error').length,
        warnings: i.findings.filter((f) => f.severity === 'warn').length,
        findings: i.findings.map((f) => f.ruleId)
      }
    }))
  }
  return JSON.stringify(data, null, 2) + '\n'
}

export function agentsFile(b: BuildInput): string {
  const n = ns(b)
  const C = componentName(b)
  return `# ${n} icon library — guide for developers and AI agents

Generated ${b.generatedAt} from Figma. ${b.icons.length} icons. Machine-readable catalogue: \`icons.json\`.

## Naming grammar
- Canonical id: \`${n}:<name>\`; \`<name>\` is lowercase kebab-case \`[a-z0-9-]\`, ASCII only.
- SVG file: \`svg/${n}-<name>.svg\` · sprite symbol: \`#${n}-<name>\` · Angular: \`<${n}-icon name="<name>" />\` (class \`${C}\`)
- Mask class (optional file): \`${n}-icon ${n}-icon--<name>\`
- Variants are separate icons named \`<set>-<variant values>\` (e.g. \`home-filled\`).

## Styling (CSS custom properties)
| Figma instance override | CSS | Notes |
|---|---|---|
| Size (width/height) | \`--${n}-icon-size\` | default \`1em\`; library grid is ${b.grid.width}×${b.grid.height} |
| Fill / primary colour | \`--${n}-icon-color\` | default \`currentColor\` |
| Secondary colours | \`--${n}-icon-color-2\`, \`-3\`… | see \`colorSlots\` per icon; default = colour as drawn |
| Stroke colour | same slot variables as fills | |
| Stroke weight | \`--${n}-icon-stroke-width\` | stroked icons only (\`strokeWidth\` in manifest) |

Each colour also falls back to a design-token variable when the Figma paint was bound to a variable
(\`colorSlots[].designToken\`, e.g. \`--color-icon-primary\`). Chain: slot var → token → default.

## Categories
Each icon has \`category\` (slug path) and \`categoryLabel\` in \`icons.json\`; \`categories\` lists them with counts.
Categories come from the Figma organisation (layer-name path, section, parent frame or page). ${b.settings.splitByCategory ? `Files are split by category: \`svg/<category>/…\` and \`sprite/${n}-<category>-sprite.svg\`.` : 'Files are not split by category (enable "Split output by category" to get per-category folders and sprites).'}

## Identity, renames and versions
An icon's **identity is its Figma component key** (\`icons[].identity\`), its name is only a label. When a designer renames an icon the key stays the same,
so the next export lists the old name under \`deprecated\` with \`replacedBy\`. Code using a deprecated name keeps working for one major version
(\`<${n}-icon name="old-name">\` resolves to the new icon). \`libraryVersion\` follows semver: removal or rename = major, new icons = minor, artwork change = patch.
${b.release?.deprecated.length ? 'Deprecated now: ' + b.release.deprecated.map((d) => `\`${d.name}\` → \`${d.replacedBy}\``).join(', ') + '.' : 'No deprecated names.'}

${b.icons.some((i) => i.aliasOf) ? `## Aliases (intentional duplicates)
These icons have identical artwork to another icon on purpose (the design team marked them as intentional). \`icons[].aliasOf\` names the icon that owns the drawing; the markup is shared in the sprite, the Angular/React data and the Web Component. Prefer the owner's name in new code only if the meaning is the same; keep the alias name when the meaning differs.
Aliases: ${b.icons.filter((i) => i.aliasOf).slice(0, 12).map((i) => `\`${i.name}\` → \`${i.aliasOf}\``).join(', ')}${b.icons.filter((i) => i.aliasOf).length > 12 ? ', …' : ''}.

` : ''}## Stroke weight
Policy: **${policyOf(b)}**. ${policyOf(b) === 'constant' ? 'Stroke weight is constant in screen px at every icon size.' : policyOf(b) === 'table' ? 'Weight by size: ' + strokeSteps(b).map((s) => `${s.size}px→${s.weight}px`).join(', ') + '. Use the size classes or the component\'s size input.' : 'Strokes scale with the icon.'}

## Usage and overrides (when scanned from designs)
\`inUse\` (when present) says how often the icon is placed, from a linked library or locally, which sizes are used and which
instance overrides exist (colour, stroke weight, size…). Overrides that no export format can reproduce are listed in FIX-PLAN.md
as "Overrides lost in code": ${Object.keys(OVERRIDES).filter((k) => OVERRIDES[k as keyof typeof OVERRIDES].support.sprite === 'no').join(', ')}.

## Replacing a Figma icon instance with code
1. Find the instance's main component; match its key to \`icons[].figma.componentKey\` (null means the source was not a component: match by \`layerName\`/\`nodeId\` instead).
2. Emit \`icons[].usage.sprite\` (HTML) or \`usage.angular\`.
3. Map instance overrides: width/height → \`--${n}-icon-size\`; fill → \`--${n}-icon-color\`; secondary fills → \`--${n}-icon-color-N\`; stroke weight → \`--${n}-icon-stroke-width\`.
4. Decorative icons use \`aria-hidden="true"\`; meaningful icons need a label (\`label\` input / \`aria-label\`).

## Library health
Structure tier: **${b.tier} ${TIER_LABEL[b.tier]}**. Icons with unresolved errors were not exported (see FIX-PLAN.md if present).
`
}

export function fixPlanMarkdown(icons: Icon[], generatedAt: string): string {
  const lines: string[] = [`# Fix plan`, ``, `Generated ${generatedAt}. Read-only report: nothing was changed in Figma.`, ``]
  let any = false
  for (const s of STEPS) {
    const rows: { icon: Icon; f: Finding }[] = []
    for (const icon of icons) for (const f of icon.findings) if (RULES[f.ruleId]?.step === s.step) rows.push({ icon, f })
    if (!rows.length) continue
    any = true
    lines.push(`## Step ${s.step} — ${s.title} (${rows.length})`, ``, `| Severity | Rule | Icon | Page | Node | Message | Hint |`, `|---|---|---|---|---|---|---|`)
    for (const { icon, f } of rows) {
      lines.push(`| ${f.severity} | ${f.ruleId} | ${icon.layerName.replace(/\|/g, '/')} | ${icon.pageName} | ${icon.nodeId} | ${f.message.replace(/\|/g, '/')} | ${(f.fixHint ?? '').replace(/\|/g, '/')} |`)
    }
    lines.push(``)
  }
  if (!any) lines.push('No findings. 🎉')
  return lines.join('\n') + '\n'
}

export function auditFiles(b: BuildInput): Files {
  const hasFindings = b.allIcons.some((i) => i.findings.length)
  return hasFindings ? { 'FIX-PLAN.md': fixPlanMarkdown(b.allIcons, b.generatedAt) } : {}
}

export function changelogFile(b: BuildInput): Files {
  if (!b.release?.diff) return {}
  return { 'CHANGELOG.md': `# Changelog\n\n${changelogMarkdown(b.release.diff, b.release.version, b.generatedAt)}\n_Prepend this entry to your existing changelog._\n` }
}

import { FIX_INFO } from '../fixes'
import { FixCandidate } from '../../types'

/** dry-run report: everything the health scan would change, without changing anything */
export function fixesReportMarkdown(fixes: FixCandidate[], date: string): string {
  const lines = ['# Health scan: proposed fixes (dry run)', '', `Generated ${date}. Nothing was changed in Figma.`, '', '| Confidence | Problem | Layer | Page | Node | Proposed fix | Details |', '|---|---|---|---|---|---|---|']
  for (const f of fixes) {
    const info = FIX_INFO[f.kind]
    const fix = f.actions[0] ? info.actionLabels[f.actions[0]] ?? f.actions[0] : 'manual (no automatic fix)'
    lines.push(`| ${f.confidence} | ${info.title} | ${f.name.replace(/\|/g, '/')} | ${f.pageName} | ${f.nodeId} | ${fix}${f.target ? ' → ' + f.target.name : ''} | ${f.diffs.join('; ').replace(/\|/g, '/')} |`)
  }
  if (!fixes.length) lines.push('| | No problems found | | | | | |')
  return lines.join('\n') + '\n'
}
