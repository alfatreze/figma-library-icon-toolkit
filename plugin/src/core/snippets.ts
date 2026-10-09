import { OverrideClass, Settings, UsageInfo } from '../types'
import { overrideFindings } from './overrides'
import { cleanNamespace, pascal } from './naming'

/** Pure snippet builders: Dev Mode codegen, the export README and the Inspect UI must print identical strings. */

export interface SnippetInput {
  ns: string
  name: string
  /** folder (or URL) that serves the sprite, e.g. "./icons/sprite/" */
  spritePath: string
  sizePx: number | null
  sizeUnit: 'px' | 'rem'
  /** css custom property → value (hex or var(--token)) */
  vars: Record<string, string>
  /** value of the primary colour override, if any */
  color?: string
  strokeWidth?: number
  label?: string
}

const rem = (px: number) => `${Math.round((px / 16) * 1000) / 1000}rem`
const sizeValue = (i: SnippetInput) => (i.sizePx === null ? null : i.sizeUnit === 'rem' ? rem(i.sizePx) : `${i.sizePx}px`)

function cssVars(i: SnippetInput): Record<string, string> {
  const out = { ...i.vars }
  const s = sizeValue(i)
  const key = `--${i.ns}-icon-size`
  if (s !== null) out[key] = s
  return out
}

/** attribute values come from layer names and variables: escape them so a quote or < cannot break (or inject into) the snippet */
const q = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const js = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')

const joinPath = (base: string, file: string) => (base.endsWith('/') || base === '' ? base : base + '/') + file

export function spriteHref(i: SnippetInput): string {
  return `${joinPath(i.spritePath, `${i.ns}-sprite.svg`)}#${i.ns}-${i.name}`
}

export function htmlSnippet(i: SnippetInput): string {
  const vars = cssVars(i)
  const style = Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('; ')
  const a11y = i.label ? `role="img" aria-label="${q(i.label)}"` : 'aria-hidden="true" focusable="false"'
  return `<svg class="${i.ns}-icon" ${a11y}${style ? ` style="${q(style)}"` : ''}>\n  <use href="${spriteHref(i)}"/>\n</svg>`
}

export function reactSnippet(i: SnippetInput): string {
  const vars = cssVars(i)
  const entries = Object.entries(vars).map(([k, v]) => `'${js(k)}': '${js(v)}'`).join(', ')
  const a11y = i.label ? `role="img" aria-label="${q(i.label)}"` : 'aria-hidden="true" focusable="false"'
  return `<svg className="${i.ns}-icon" ${a11y}${entries ? ` style={{ ${entries} }}` : ''}>\n  <use href="${spriteHref(i)}" />\n</svg>`
}

/** with the exported React component: <CmnIcon name="home" size={24} /> */
export function reactComponentSnippet(i: SnippetInput): string {
  const C = pascal(i.ns) + 'Icon'
  const attrs = [`name="${i.name}"`, i.sizePx !== null ? (i.sizeUnit === 'rem' ? `size="${rem(i.sizePx)}"` : `size={${i.sizePx}}`) : '', i.color ? `color="${q(i.color)}"` : '', i.strokeWidth !== undefined ? `strokeWidth={${i.strokeWidth}}` : '', i.label ? `label="${q(i.label)}"` : '']
    .filter(Boolean)
    .join(' ')
  return `// import { ${C} } from './icons'\n<${C} ${attrs} />`
}

export function angularSnippet(i: SnippetInput): string {
  const C = pascal(i.ns) + 'Icon'
  const attrs = [`name="${i.name}"`, i.sizePx !== null ? (i.sizeUnit === 'rem' ? `size="${rem(i.sizePx)}"` : `[size]="${i.sizePx}"`) : '', i.color ? `color="${q(i.color)}"` : '', i.strokeWidth !== undefined ? `[strokeWidth]="${i.strokeWidth}"` : '', i.label ? `label="${q(i.label)}"` : '']
    .filter(Boolean)
    .join(' ')
  return `<!-- import { ${C} } from './icons';  add ${C} to the component's imports -->\n<${i.ns}-icon ${attrs} />`
}

export function webComponentSnippet(i: SnippetInput): string {
  const size = sizeValue(i)
  const attrs = [`name="${i.name}"`, size ? `size="${size}"` : '', i.color ? `color="${q(i.color)}"` : '', i.strokeWidth !== undefined ? `stroke-width="${i.strokeWidth}"` : '', i.label ? `label="${q(i.label)}"` : '']
    .filter(Boolean)
    .join(' ')
  return `<!-- <script type="module" src="./icons/web-component/${i.ns}-icon.js"></script> -->\n<${i.ns}-icon ${attrs}></${i.ns}-icon>`
}

export function cssSnippet(i: SnippetInput): string {
  const vars = cssVars(i)
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`)
  return lines.length ? `.icon {\n${lines.join('\n')}\n}` : '/* no overrides: the icon uses its defaults */'
}

/** human notes about overrides the selected export formats cannot reproduce */
export function overrideNotes(classes: Partial<Record<OverrideClass, number>>, settings: Settings): string[] {
  const usage: UsageInfo = { instances: 1, pages: [], remote: false, overrides: classes, sizes: [], colors: [], exportedFrom: 'main' }
  return overrideFindings(usage, settings).map((f) => `${f.severity === 'warn' ? '⚠' : 'ℹ'} ${f.message.replace(/ \(\d+× in use\)/g, '')}${f.fixHint ? `\n   ${f.fixHint}` : ''}`)
}

export function snippetNamespace(settings: Settings): string {
  return cleanNamespace(settings.namespace)
}
