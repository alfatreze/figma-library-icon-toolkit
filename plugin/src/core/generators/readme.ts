import { BuildInput, componentName, ns } from './common'
import { strokeSteps } from './common'

/** README.md shipped inside every export: how it works, the formats, and how to add it to a project. Only enabled formats are documented. */
export function readmeFile(b: BuildInput): string {
  const n = ns(b)
  const f = b.settings.formats
  const C = componentName(b)
  const sample = b.icons.find((i) => i.kind === 'filled') ?? b.icons[0]
  const name = sample?.name ?? 'icon-name'
  const stroked = b.icons.find((i) => i.kind === 'stroked' || i.kind === 'mixed')
  const multi = b.icons.find((i) => i.kind === 'multicolor')
  const policy = b.settings.strokePolicy
  const angular = f.angularModern || f.angularClassic
  const react = f.react
  const ver = b.release?.version ?? '1.0.0'

  const tree: string[] = []
  if (f.svg) tree.push(`svg/${b.settings.splitByCategory ? '<category>/' : ''}${n}-<name>.svg   one themeable SVG per icon`)
  if (f.sprite) tree.push(`sprite/${n}-sprite.svg   all icons as <symbol>${b.settings.splitByCategory ? ' (+ one sprite per category)' : ''}`)
  if (f.html) tree.push(`html/${n}-icons.css   base CSS (size, variables)`, 'html/index.html   searchable preview: open it in a browser')
  if (f.mask) tree.push(`html/${n}-icons-mask.css   optional CSS-mask classes`)
  if (f.angularModern) tree.push('angular/   Angular 17.1+ component (signals)')
  if (f.angularClassic) tree.push('angular-classic/   Angular 14+ component (@Input)')
  if (f.react) tree.push('react/   React component + typed icon data')
  tree.push('icons.json   catalogue for tools/AI', 'toolkit.config.json   settings used (re-export identically)', 'AGENTS.md   guide for AI agents')

  const parts: string[] = []
  parts.push(`# ${n} icons

${b.icons.length} icons · v${ver} · generated ${b.generatedAt} from Figma. Icons are **themeable SVG**: recolour and resize them from CSS. No dependencies.

\`\`\`
${tree.join('\n')}
\`\`\`

Browse every icon: open \`html/index.html\`.${f.html ? '' : ' (Enable the HTML format to get it.)'}`)

  parts.push(`## Use it

Pick **one** way. All examples use the icon \`${name}\`.`)

  if (f.sprite) {
    parts.push(`### SVG sprite (recommended for web)
\`\`\`html
<link rel="stylesheet" href="/icons/html/${n}-icons.css">

<svg class="${n}-icon" aria-hidden="true" focusable="false">
  <use href="/icons/sprite/${n}-sprite.svg#${n}-${name}"/>
</svg>
\`\`\`
- The sprite file must be served from the **same origin** (not \`file://\`). To avoid that, paste the contents of \`${n}-sprite.svg\` once after \`<body>\` inside \`<div hidden>…</div>\` and use \`href="#${n}-${name}"\`.
- Supports multi-colour icons and live stroke weight.${b.settings.splitByCategory ? '\n- Load only what a page needs: `sprite/' + n + '-<category>-sprite.svg`.' : ''}`)
  }
  if (f.svg) {
    parts.push(`### Inline SVG file
Copy the file's \`<svg>\` into your markup, or import it with your bundler. Colours/size follow the CSS variables below **only when inlined** (not as \`<img src>\`).
\`\`\`html
<!-- paste the contents of svg/${n}-${name}.svg, then add the class and variables to its <svg> tag -->
<svg class="${n}-icon" style="--${n}-icon-color: #0a7d3b" viewBox="0 0 24 24">…</svg>
\`\`\``)
  }
  if (f.mask) {
    parts.push(`### CSS mask (single colour only)
\`\`\`html
<link rel="stylesheet" href="/icons/html/${n}-icons.css">
<link rel="stylesheet" href="/icons/html/${n}-icons-mask.css">
<i class="${n}-icon ${n}-icon--${name}" aria-hidden="true"></i>
\`\`\`
No multi-colour, no stroke-weight control, and the file is large. Prefer the sprite.`)
  }
  if (angular) {
    const dir = f.angularModern ? 'angular' : 'angular-classic'
    parts.push(`### Angular${f.angularModern && f.angularClassic ? ' (two flavours: pick one folder)' : ''}
1. Copy \`${dir}/\` into your app, e.g. \`src/app/icons/\`.
2. Import the standalone component:
\`\`\`ts
import { ${C} } from './icons';          // path to the copied folder

@Component({
  standalone: true,
  imports: [${C}],
  template: \`<${n}-icon name="${name}" [size]="24" color="#0a7d3b" />\`
})
export class Demo {}
\`\`\`
| Input | Meaning |
|---|---|
| \`name\` | typed icon name (autocomplete from \`icons.ts\`) |
| \`size\` | number (px) or any CSS length |
| \`color\` | any CSS colour (primary colour) |
| \`strokeWidth\` | px, stroked icons only |
| \`label\` | accessible name; omit for decorative icons |

${f.angularModern ? '`angular/` needs Angular **17.1+**' : ''}${f.angularModern && f.angularClassic ? ', ' : ''}${f.angularClassic ? '`angular-classic/` needs Angular **14+**' : ''}. Icon data lives in \`icons.ts\`.`)
  }

  if (react) {
    parts.push(`### React
1. Copy \`react/\` into your app, e.g. \`src/icons/\`.
2. Use the typed component (React 17+, no dependencies):
\`\`\`tsx
import { ${C} } from './icons';

export const Demo = () => <${C} name="${name}" size={24} color="#0a7d3b" />;
\`\`\`
Props: \`name\` (typed), \`size\` (number = px, or CSS length), \`color\`, \`strokeWidth\` (line icons), \`label\` (accessible name; omit for decorative). Extra props go to the wrapping \`<span>\`.`)
  }

  parts.push(`## Style it (CSS variables)
\`\`\`css
.button .${n}-icon {
  --${n}-icon-size: 20px;          /* default 1em */
  --${n}-icon-color: #0a7d3b;      /* default currentColor */
${multi ? `  --${n}-icon-color-2: #6b7280;    /* extra colours of multi-colour icons, e.g. ${multi.name} */\n` : ''}${stroked ? `  --${n}-icon-stroke-width: 2;     /* line icons, e.g. ${stroked.name} */\n` : ''}}
\`\`\`
- Size helpers: \`${n}-icon--xs | sm | lg | xl | 2xl\`.
- Colours also fall back to your design tokens when the Figma colour was bound to a variable (chain: \`--${n}-icon-color\` → token → \`currentColor\`). \`icons.json\` → \`colorSlots[].designToken\` lists them.
${policy === 'constant' ? '- **Stroke weight is constant** in screen px at any size.' : policy === 'scale' ? '- Strokes **scale** with the icon.' : `- **Stroke weight follows the icon size**: ${strokeSteps(b).map((s) => `${s.size}px→${s.weight}px`).join(', ')}. Use the size classes \`${n}-icon--s${strokeSteps(b)[0]?.size ?? 24}\`… or the Angular \`size\` input.`}

## Accessibility
- Decorative: \`aria-hidden="true"\` (all examples above).
- Meaningful (no visible text): \`<svg role="img" aria-label="Search">…</svg>\`${angular ? ' or `<' + n + '-icon name="…" label="Search">`' : ''}.
- Colour changes keep working in forced-colors mode (they use \`currentColor\`).`)

  parts.push(`## Add it to a project
1. **Copy** the folder(s) you use into the project (keep \`icons.json\` and \`toolkit.config.json\` next to them).
2. **Import** \`html/${n}-icons.css\` once${f.sprite ? ' and serve/paste the sprite' : ''}${angular ? ', or import the Angular component' : ''}.
3. **Commit** the folder. It is generated: do not edit by hand.

Updating: re-export from Figma, replace the folder, read \`CHANGELOG.md\` (if present) and \`deprecated\` in \`icons.json\`. Renamed icons keep working under the old name for one major version${angular ? ` (\`<${n}-icon name="old-name">\` resolves to the new icon)` : ''}.

## Reference
| File | Purpose |
|---|---|
| \`icons.json\` | every icon: name, category, kind, colour slots, tags, Figma component key, usage snippets |
| \`toolkit.config.json\` | settings used; load it in the plugin to export identically |
| \`CHANGELOG.md\` | what changed since the previous export (when compared) |
| \`FIX-PLAN.md\` | problems found in the Figma file (when any) |
| \`AGENTS.md\` | how AI agents map Figma icons to code |

Naming: \`${n}:<name>\` (kebab-case) → file \`${n}-<name>.svg\`, sprite id \`${n}-<name>\`${f.mask ? `, class \`${n}-icon--<name>\`` : ''}${angular ? `, tag \`<${n}-icon name="<name>">\`` : ''}.`)

  return parts.join('\n\n') + '\n'
}
