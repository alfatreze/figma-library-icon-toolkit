import { Finding, Icon } from '../../types'
import { TIER_LABEL } from '../library'
import { summariseCategories } from '../categories'
import { OVERRIDES } from '../overrides'
import { RULES, STEPS } from '../rules'
import { changelogMarkdown } from '../changelog'
import { pascal } from '../naming'
import { BuildInput, componentName, constName, Files, ns, strokeSteps, symbolId, policyOf } from './common'

export function manifestFile(b: BuildInput): string {
  const n = ns(b)
  const data = {
    namespace: n,
    version: 1,
    libraryVersion: b.release?.version ?? '1.0.0',
    ...(b.partial ? { partial: true } : {}),
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


/** the part of AGENTS.md that depends on what was exported: where each package is and how to use it */
function agentsUsage(b: BuildInput): string {
  const n = ns(b)
  const C = componentName(b)
  const f = b.settings.formats
  const first = b.icons[0]
  const name = first?.name ?? 'name'
  const constant = first ? constName(b, first) : 'icon'
  const P = pascal(n)
  const rows: string[] = []
  if (f.angularModern) rows.push(`| Angular 17.1+ | \`angular/\` | \`<${n}-icon name="${name}" />\`: import \`${C}\` in the component's \`imports\`; icons by name load their category lazily, or \`provide${P}Icons(${constant})\` for tree-shaken ones |`)
  if (f.angularClassic) rows.push(`| Angular 14+ | \`angular-classic/\` | same tag, \`@Input\` based (\`${C}\` in a module or standalone \`imports\`) |`)
  if (f.react) rows.push(`| React 17+ | \`react/\` | \`<${C} name="${name}" size={24} />\` or \`<${C} icon={${constant}} />\` (imported from \`./icons\`: synchronous and tree-shakable) |`)
  if (f.vue) rows.push(`| Vue 3 | \`vue/\` | \`<${C} name="${name}" :size="24" />\` or \`<${C} :icon="${constant}" />\`; a plain TypeScript file, no \`.vue\` build step |`)
  if (f.svelte) rows.push(`| Svelte 4 and 5 | \`svelte/\` | \`<${C} name="${name}" size={24} />\` or \`<${C} icon={${constant}} />\` |`)
  if (f.webComponent) rows.push(`| Any framework | \`web-component/\` | \`<${n}-icon name="${name}" size="24"></${n}-icon>\` after loading \`${n}-icon.js\` once |`)
  if (f.sprite) rows.push(`| Plain HTML | \`sprite/${n}-sprite.svg\` | \`<svg class="${n}-icon"><use href="…/${n}-sprite.svg#${n}-${name}"/></svg>\` (load \`html/${n}-icons.css\` once for sizing) |`)
  if (f.svg) rows.push(`| Inline or <img> | \`svg/${n}-<name>.svg\` | one themeable file per icon |`)
  const shared = `All component packages take the same inputs: \`name\` (typed; a renamed icon's old name still works for one major version) or \`icon\` (the imported object), \`size\` (number = px, or any CSS length), \`color\`, \`strokeWidth\` (line icons) and \`label\` (accessible name; omit for a decorative icon).`
  return `## Which package to use
${rows.length ? `| Stack | Folder | Use |\n|---|---|---|\n${rows.join('\n')}\n\n${shared}` : 'No code package was exported (only the files listed in README.md).'}
${b.settings.importPath.trim() ? `\nComponents are imported from \`${b.settings.importPath.trim()}\` in the examples (copy the package folder there).` : ''}
${b.settings.npm.enabled ? '\nEach package folder has a `package.json` and can be published to npm as it is (see its README.md).' : ''}
`
}

/** step-by-step recipes for the jobs an assistant is most often asked to do with this library */
function agentsRecipes(b: BuildInput): string {
  const n = ns(b)
  const s = b.settings
  const dup = s.duplicateNames === 'block' ? 'the export stops until one is renamed' : s.duplicateNames === 'category' ? 'the category is put in front of the name (`<category>-<name>`)' : 'a number is added (`-2`, `-3`…)'
  const ignoredSegs = s.ignoreSegments.filter(Boolean)
  const ignoredVariants = s.ignoreVariantValues.filter(Boolean)
  return `## Recipes
### Use an icon that exists
1. Look it up in \`icons.json\` (\`icons[].name\`, \`tags\` (from the Figma description), \`category\`, \`categoryLabel\`). Search tags and category, not only the name.
2. Use the package of the stack you are in (table above) with exactly that \`name\`. Never invent a name: a name that is not in \`icons.json\` renders nothing.
3. Size and colour with the component inputs or the CSS variables below; do not edit the generated files.

### Add a new icon
Icons come from Figma, not from code. Do not hand-write SVG into the generated folders.
1. A designer adds the icon as a **component** to the Figma library, named \`<category>/<name>\`, on the grid (${b.grid.width}×${b.grid.height}), artwork as vector layers.
2. Re-run the Icon Library Toolkit plugin and export (or publish) again: this regenerates every file, \`icons.json\` and \`CHANGELOG.md\`.
3. Review the diff: only the new icon and the catalogue should change. Commit the regenerated folders.
If the icon is wanted before the design is done, use a temporary text label in the UI and open a request to the design team; do not copy an icon with a different meaning.

### Rename or remove an icon
Renaming in Figma keeps the icon's identity (its component key): the next export lists the old name as deprecated and old code keeps working for one major version. Removing an icon is a major version. Search the code base for the old name before accepting a removal, and migrate with \`deprecated[].replacedBy\`.

### Fix an icon that does not show
1. Is the name in \`icons.json\`? Check spelling and case (names are lowercase kebab-case). A renamed icon: look in \`deprecated\`.
2. Is it sized? The icon takes its size from \`--${n}-icon-size\` (default \`1em\`): a parent with \`font-size: 0\` or an explicit \`width: 0\` hides it.
3. Colour: the primary colour is \`--${n}-icon-color\` (default \`currentColor\`); an icon drawn with the same colour as its background is not missing.
4. Used by name from a lazy category: the first render may be empty until its chunk arrives; register the icons you use up front to make them synchronous.
5. Fewer colours than in Figma? Secondary colours need \`--${n}-icon-color-2\`… (see \`colorSlots\` for the icon).

## Rules this library was exported with
- Names: lowercase kebab-case, ASCII only; namespace \`${n}\`.
- Two icons with the same name: ${dup}.
- ${ignoredSegs.length ? `Category folders left out of names: ${ignoredSegs.map((x) => `\`${x}\``).join(', ')}.` : 'No category folders are left out of names.'}
- ${ignoredVariants.length ? `Variant values left out of names: ${ignoredVariants.map((x) => `\`${x}\``).join(', ')} (so \`home\` is the default variant, others add their value).` : 'Every variant value is part of the name.'}
- Categories come from ${s.categorySource === 'auto' ? 'the layer-name path, then the Figma section, frame or page' : `the Figma ${s.categorySource === 'path' ? 'layer-name path' : s.categorySource}`}.
- Colours are ${s.colorMode === 'themeable' ? 'themeable (CSS variables; a colour bound to a Figma variable also falls back to your design token)' : 'fixed as drawn in Figma (not themeable)'}.
`
}

export function agentsFile(b: BuildInput): string {
  const n = ns(b)
  const C = componentName(b)
  return `# ${n} icon library — guide for developers and AI agents

Generated ${b.generatedAt} from Figma. ${b.icons.length} icons. Machine-readable catalogue: \`icons.json\`.
**Generated files are overwritten by every export: never edit them by hand.** Change the design in Figma and export again.

${agentsUsage(b)}
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

${agentsRecipes(b)}
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
