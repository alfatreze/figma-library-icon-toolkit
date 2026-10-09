import { buildFiles } from '../core/generators'
import { Tier } from '../core/library'
import { GridInfo, Icon, Settings } from '../types'

export interface OverviewRow {
  id: keyof Settings['formats'] | 'meta'
  label: string
  detail: string
  files: number
  bytes: number
}

const ROWS: { id: OverviewRow['id']; label: string; detail: string }[] = [
  { id: 'svg', label: 'SVG files', detail: 'One themeable .svg per icon (svg/). Colours and stroke width follow CSS variables when inlined.' },
  { id: 'sprite', label: 'SVG sprite', detail: 'One <symbol> sprite used with <svg><use href="…#id">. Best for multi-colour and stroked icons.' },
  { id: 'html', label: 'HTML', detail: 'Base CSS plus a self-contained, searchable test page (html/index.html).' },
  { id: 'mask', label: 'CSS mask classes', detail: 'Optional single-colour classes (<i class="…">). No multi-colour or live stroke width.' },
  { id: 'angularModern', label: 'Angular 17.1+', detail: 'Standalone <icon> component with signal inputs, typed icon names and data.' },
  { id: 'angularClassic', label: 'Angular 14+', detail: 'Standalone component with @Input, for older Angular versions.' },
  { id: 'react', label: 'React', detail: 'Typed <Icon name="…"/> component (React 17+), no dependencies. Same data file as Angular; props: size, color, strokeWidth, label.' },
  { id: 'webComponent', label: 'Web Component', detail: 'Framework-free <icon> custom element (plain ES module + typings). Works in any framework or none.' },
  { id: 'codeConnect', label: 'Code Connect', detail: 'Templates that map each icon component to <icon name="…"> for Dev Mode and the Figma MCP server (publishing needs an Organization/Enterprise plan).' },
  { id: 'meta', label: 'Manifest & guide', detail: 'README.md (how to use it), icons.json (catalogue), toolkit.config.json, AGENTS.md (for AI agents), CHANGELOG.md / FIX-PLAN.md when applicable. Always included.' }
]

const bytes = (s: string) => new TextEncoder().encode(s).length

/** Builds every format once (all enabled) so each row can show its real file count and size. */
export function computeOverview(icons: Icon[], settings: Settings, grid: GridInfo, tier: Tier): OverviewRow[] {
  const all = { svg: true, sprite: true, html: true, mask: true, angularModern: true, angularClassic: true, react: true, webComponent: true, codeConnect: true }
  const files = buildFiles({ allIcons: icons, settings: { ...settings, formats: all }, grid, tier, generatedAt: 'preview' })
  const rows = new Map<OverviewRow['id'], OverviewRow>(ROWS.map((r) => [r.id, { ...r, files: 0, bytes: 0 }]))
  for (const [path, content] of Object.entries(files)) {
    let id: OverviewRow['id'] = 'meta'
    if (path.startsWith('svg/')) id = 'svg'
    else if (path.startsWith('sprite/')) id = 'sprite'
    else if (path.includes('-icons-mask.css')) id = 'mask'
    else if (path.startsWith('html/')) id = 'html'
    else if (path.startsWith('react/')) id = 'react'
    else if (path.startsWith('web-component/')) id = 'webComponent'
    else if (path.startsWith('code-connect/')) id = 'codeConnect'
    else if (path.startsWith('angular-classic/')) id = 'angularClassic'
    else if (path.startsWith('angular/')) id = 'angularModern'
    const r = rows.get(id)!
    r.files++
    r.bytes += bytes(content)
  }
  return [...rows.values()]
}

export const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1048576).toFixed(1)} MB`)
