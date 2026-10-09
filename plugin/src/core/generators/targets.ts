import { Settings } from '../../types'
import { angularFiles } from './angular'
import { BuildInput, Files, ns } from './common'
import { codeConnectFiles } from './codeconnect'
import { baseCss, maskCss } from './css'
import { reactFiles } from './react'
import { categorySprites, spriteFile, svgFiles } from './svg-files'
import { testPage } from './testpage'
import { webComponentFiles } from './webcomponent'

/**
 * The one list of export targets. `buildFiles`, the export overview and the file-to-target mapping all read it, so adding a target is:
 * write its generator, add an entry here, add its default to Settings.formats (and its schema entry), add a checkbox in Settings.
 */
export type TargetKey = keyof Settings['formats']

export interface Target {
  key: TargetKey
  label: string
  detail: string
  /** one short line for the format cards in Settings and Export */
  hint: string
  build: (b: BuildInput) => Files
  /** does this output path belong to the target? (used for the per-format size overview) */
  owns: (path: string) => boolean
}

const under = (dir: string) => (p: string) => p.startsWith(dir + '/')

export const TARGETS: Target[] = [
  {
    key: 'svg',
    hint: 'One themeable .svg per icon',
    label: 'SVG files',
    detail: 'One themeable .svg per icon (svg/). Colours and stroke width follow CSS variables when inlined.',
    build: svgFiles,
    owns: under('svg')
  },
  {
    key: 'sprite',
    hint: 'One file used with <use>. Best for multi-colour icons',
    label: 'SVG sprite',
    detail: 'One <symbol> sprite used with <svg><use href="…#id">. Best for multi-colour and stroked icons.',
    build: (b) => ({ [`sprite/${ns(b)}-sprite.svg`]: spriteFile(b), ...(b.settings.splitByCategory ? categorySprites(b) : {}) }),
    owns: under('sprite')
  },
  {
    key: 'html',
    hint: 'Searchable preview page and base CSS',
    label: 'HTML',
    detail: 'Base CSS plus a self-contained, searchable test page (html/index.html).',
    build: (b) => ({ [`html/${ns(b)}-icons.css`]: baseCss(b), 'html/index.html': testPage(b) }),
    owns: (p) => p.startsWith('html/') && !p.includes('-icons-mask.css')
  },
  {
    key: 'mask',
    hint: 'Single-colour CSS classes, no stroke control',
    label: 'CSS mask classes',
    detail: 'Optional single-colour classes (<i class="…">). No multi-colour or live stroke width.',
    build: (b) => ({ [`html/${ns(b)}-icons-mask.css`]: maskCss(b) }),
    owns: (p) => p.includes('-icons-mask.css')
  },
  {
    key: 'angularModern',
    hint: 'Signals, tree-shakable, lazy categories',
    label: 'Angular 17.1+',
    detail: 'Standalone <icon> component with signal inputs, per-icon tree-shakable data, lazy category chunks and an optional sprite component.',
    build: (b) => angularFiles(b, 'modern'),
    owns: under('angular')
  },
  {
    key: 'angularClassic',
    hint: 'For Angular 14 to 16 (works on newer too)',
    label: 'Angular 14+',
    detail: 'Standalone component with @Input, for older Angular versions (same data, registry and sprite strategy).',
    build: (b) => angularFiles(b, 'classic'),
    owns: under('angular-classic')
  },
  {
    key: 'react',
    hint: 'Typed component, no dependencies',
    label: 'React',
    detail: 'Typed <Icon icon={…} /> / name component (React 17+), no dependencies; per-icon data, lazy category chunks. Props: size, color, strokeWidth, label.',
    build: reactFiles,
    owns: under('react')
  },
  {
    key: 'webComponent',
    hint: 'Works in any framework',
    label: 'Web Component',
    detail: 'Framework-free <icon> custom element (plain ES module + typings). Works in any framework or none.',
    build: webComponentFiles,
    owns: under('web-component')
  },
  {
    key: 'codeConnect',
    hint: 'Mappings for Dev Mode and the Figma MCP server',
    label: 'Code Connect',
    detail: 'Templates that map each icon component to <icon name="…"> for Dev Mode and the Figma MCP server (publishing needs an Organization/Enterprise plan).',
    build: codeConnectFiles,
    owns: under('code-connect')
  }
]

export const ALL_TARGETS_ON = Object.fromEntries(TARGETS.map((t) => [t.key, true])) as Settings['formats']
