import { Textbox } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { useState } from 'preact/hooks'
import { TARGETS, TargetKey } from '../../core/generators'
import styles from '../styles'
import { Settings } from '../../types'
import { OverviewRow, kb } from '../overview'
import { cx, plural } from '../util'
import { Segmented } from './Segmented'

type Formats = Settings['formats']
type CardId = 'svg' | 'png' | 'html' | 'angular' | 'react' | 'vue' | 'svelte' | 'webComponent' | 'codeConnect' | 'npm'

interface CardDef {
  id: CardId
  title: string
  hint: string
  detail: string
  /** the package keys the card switches; PNG has none (it is `settings.png.enabled`) */
  keys: TargetKey[]
  /** what switching the card on turns on */
  initial: TargetKey[]
}

const target = (k: TargetKey) => TARGETS.find((t) => t.key === k)!

/** The one list of cards: SVG, PNG, HTML & CSS, Angular, React, Vue, Svelte, Web Component, Code Connect (PNG sits right after SVG on purpose). */
const CARDS: CardDef[] = [
  { id: 'svg', title: 'SVG', hint: 'Themeable icons as files and/or one sprite', detail: '', keys: ['svg', 'sprite'], initial: ['svg'] },
  { id: 'png', title: 'PNG', hint: 'Images at the sizes and colours you choose', detail: '', keys: [], initial: [] },
  { id: 'html', title: 'HTML & CSS', hint: 'Preview page, CSS file and CSS mask classes', detail: '', keys: ['html', 'css', 'mask'], initial: ['html', 'css'] },
  { id: 'angular', title: 'Angular', hint: 'Standalone component, tree-shakable', detail: '', keys: ['angularModern', 'angularClassic'], initial: ['angularModern'] },
  { id: 'react', title: 'React', hint: 'Typed component, no dependencies', detail: target('react').detail, keys: ['react'], initial: ['react'] },
  { id: 'vue', title: 'Vue', hint: 'Vue 3 component, no SFC build needed', detail: target('vue').detail, keys: ['vue'], initial: ['vue'] },
  { id: 'svelte', title: 'Svelte', hint: 'Svelte 4 and 5 component', detail: target('svelte').detail, keys: ['svelte'], initial: ['svelte'] },
  { id: 'webComponent', title: 'Web Component', hint: 'Works in any framework', detail: target('webComponent').detail, keys: ['webComponent'], initial: ['webComponent'] },
  { id: 'codeConnect', title: 'Code Connect', hint: 'Mappings for Dev Mode and the Figma MCP server', detail: target('codeConnect').detail, keys: ['codeConnect'], initial: ['codeConnect'] },
  { id: 'npm', title: 'npm packages', hint: 'A package.json in each package, ready to publish', detail: '', keys: [], initial: [] }
]

type AngularChoice = 'modern' | 'classic' | 'both'

function Box({ on }: { on: boolean }) {
  return <span class={cx(styles.fmtBox, on && styles.fmtBoxOn)} aria-hidden="true">{on ? '✓' : ''}</span>
}

/**
 * One list of package cards, used by Settings → Packages and by the Export dialog so the choice always looks and behaves the same.
 * Each card has a switch, a one-line purpose, the real size when known, and a fold-out with that package's own settings.
 * Angular's two versions and the SVG / HTML & CSS parts are choices inside their cards; the underlying package keys are unchanged.
 */
export function PackageCards(props: {
  formats: Formats
  png: Settings['png']
  npm: Settings['npm']
  onNpm: (n: Settings['npm']) => void
  onFormats: (f: Formats) => void
  onPng: (p: Settings['png']) => void
  rows: OverviewRow[] | null
  /** the PNG card's content (rows); built by the shell, which owns the scan data it needs */
  pngBody: preact.ComponentChildren
  pngFiles: number
}) {
  const { formats, png, npm } = props
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const sizeOf = (keys: TargetKey[]) => {
    const rs = (props.rows ?? []).filter((r) => (keys as string[]).includes(r.id) && formats[r.id as TargetKey])
    const files = rs.reduce((a, r) => a + r.files, 0)
    return files ? `${plural(files, 'file')} · ${kb(rs.reduce((a, r) => a + r.bytes, 0))}` : ''
  }
  const setKeys = (keys: TargetKey[], on: boolean) => props.onFormats({ ...formats, ...Object.fromEntries(keys.map((k) => [k, on])) })
  const isOn = (c: CardDef) => (c.id === 'png' ? png.enabled : c.id === 'npm' ? npm.enabled : c.keys.some((k) => formats[k]))
  const toggle = (c: CardDef, on: boolean) => {
    if (c.id === 'png') return props.onPng({ ...png, enabled: on })
    if (c.id === 'npm') return props.onNpm({ ...npm, enabled: on })
    props.onFormats({ ...formats, ...Object.fromEntries(c.keys.map((k) => [k, on && c.initial.includes(k)])) })
    if (on) setOpen((o) => ({ ...o, [c.id]: o[c.id] ?? false }))
  }
  const angular: AngularChoice = formats.angularModern && formats.angularClassic ? 'both' : formats.angularClassic ? 'classic' : 'modern'

  const body = (c: CardDef) => {
    if (c.id === 'png') return props.pngBody
    if (c.id === 'npm') {
      const scopeBad = npm.scope !== '' && !/^@[a-z0-9][a-z0-9-]{0,40}$/.test(npm.scope)
      const licenseBad = !/^[A-Za-z0-9.+() -]{1,60}$/.test(npm.license)
      return (
        <div class={styles.section}>
          <div class={styles.muted}>
            Adds a <code>package.json</code> (ESM, types, <code>sideEffects: false</code>) and the build file it needs to the React, Vue, Svelte, Angular 17.1+ and Web Component folders and to <code>svg/</code>, so each folder can be published as it is. Angular 14+ is not packaged: its build tool cannot bundle the lazy category chunks.
          </div>
          <div class={styles.fieldRow}>
            <span class={styles.muted} style={{ width: 56 }}>Scope</span>
            <div class={styles.grow}><Textbox value={npm.scope} placeholder="@acme (optional)" onValueInput={(scope) => props.onNpm({ ...npm, scope })} /></div>
          </div>
          {scopeBad && <div class={styles.sevWarn}>Use a scope like @acme (lowercase letters, digits and “-”); it is left out until then.</div>}
          <div class={styles.fieldRow}>
            <span class={styles.muted} style={{ width: 56 }}>Licence</span>
            <div class={styles.grow}><Textbox value={npm.license} placeholder="MIT, UNLICENSED…" onValueInput={(license) => props.onNpm({ ...npm, license })} /></div>
          </div>
          {licenseBad && <div class={styles.sevWarn}>Use an SPDX name such as MIT or UNLICENSED; UNLICENSED is used until then.</div>}
        </div>
      )
    }
    if (c.id === 'angular') {
      return (
        <div class={styles.section}>
          <div class={styles.muted}>Version</div>
          <Segmented<AngularChoice>
            label="Angular version"
            value={angular}
            onValueChange={(v) => props.onFormats({ ...formats, angularModern: v !== 'classic', angularClassic: v !== 'modern' })}
            options={[
              { value: 'modern', children: '17.1+', title: 'Signal inputs, per-icon tree-shakable data, lazy category chunks' },
              { value: 'classic', children: '14+', title: 'Standalone component with @Input, for Angular 14 to 16 (works on newer too)' },
              { value: 'both', children: 'Both' }
            ]}
          />
          <div class={styles.muted}>{target('angularModern').detail} The 14+ version has the same data and sprite strategy with <code>@Input</code>, and works on newer Angular too.</div>
        </div>
      )
    }
    if (c.keys.length > 1) {
      return (
        <div class={styles.section}>
          {c.keys.map((k) => {
            const t = target(k)
            const on = formats[k]
            return (
              <label key={k} class={styles.pkgSub}>
                <input type="checkbox" class={styles.srOnly} checked={on} onChange={(e) => setKeys([k], (e.currentTarget as HTMLInputElement).checked)} />
                <Box on={on} />
                <span>
                  <span class={styles.fmtName}>{t.label}</span>
                  <span class={styles.fmtHint}>{t.detail}</span>
                </span>
                <span class={styles.fmtSize}>{on ? sizeOf([k]) : ''}</span>
              </label>
            )
          })}
        </div>
      )
    }
    return <div class={styles.muted}>{c.detail}</div>
  }

  return (
    <div class={styles.fmtList}>
      {CARDS.map((c) => {
        const on = isOn(c)
        const expanded = !!open[c.id]
        const size = c.id === 'png' ? (on && props.pngFiles ? plural(props.pngFiles, 'file') : '') : on ? sizeOf(c.keys) : ''
        return (
          <div key={c.id} class={cx(styles.pkg, on && styles.pkgOn)}>
            <div class={styles.pkgHead}>
              <label class={styles.pkgToggle}>
                <input type="checkbox" class={styles.srOnly} checked={on} onChange={(e) => toggle(c, (e.currentTarget as HTMLInputElement).checked)} />
                <Box on={on} />
                <span>
                  <span class={styles.fmtName}>{c.title}</span>
                  <span class={styles.fmtHint}>{c.hint}</span>
                </span>
              </label>
              <span class={styles.fmtSize}>{size}</span>
              <button type="button" class={styles.pkgChevron} aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} ${c.title} settings`} data-hint={`${c.title} settings`} onClick={() => setOpen({ ...open, [c.id]: !expanded })}>
                {expanded ? '▾' : '▸'}
              </button>
            </div>
            {expanded && <div class={styles.pkgBody}>{body(c)}</div>}
          </div>
        )
      })}
    </div>
  )
}
