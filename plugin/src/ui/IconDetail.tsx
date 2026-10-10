import { Button, Checkbox, Textbox } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { useState } from 'preact/hooks'
import { CHANGE_LABEL, ChangeKind } from '../core/baseline'
import { modeNames, modeStyle, slotColour, tileForMode } from '../core/iconDetail'
import { describeUsage } from '../core/overrides'
import { ruleInfo } from '../core/rules'
import { angularSnippet, htmlSnippet, reactComponentSnippet, SnippetInput } from '../core/snippets'
import { Icon, Settings } from '../types'
import { FormatChips } from './components/IconList'
import { SevIcon, sevClass } from './components/severity'
import { Dialog } from './Dialog'
import { InfoTip } from './InfoTip'
import { LocateIcon } from './icons'
import styles from './styles'
import { copyText, cx, notify, plural } from './util'

type Tile = 'light' | 'dark' | 'checker'
const SIZES = [16, 24, 32, 48]

const sized = (svg: string, px: number) => svg.replace(/<svg\b([^>]*)>/, (_m, a: string) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, '')} width="${px}" height="${px}">`)

/**
 * The detail panel of one icon: how it looks (any mode, any background, every size), what it is made of, where it comes from, how it is
 * used, what is wrong with it and how to use it in code. Replaces the inline expander of the list.
 */
export function IconDetail(props: {
  icon: Icon
  settings: Settings
  included: boolean
  changes: ChangeKind[]
  index: number
  count: number
  onInclude: (v: boolean) => void
  onRename: (v: string) => void
  onOutline: (v: boolean) => void
  onLocate: () => void
  onStep: (delta: number) => void
  onClose: () => void
}) {
  const { icon, settings } = props
  const modes = modeNames(icon)
  const [mode, setMode] = useState<string | null>(null)
  const [tile, setTile] = useState<Tile | 'auto'>('auto')
  const activeMode = mode && modes.includes(mode) ? mode : null
  const shownTile: Tile = tile === 'auto' ? tileForMode(icon, activeMode) : tile
  const style = modeStyle(icon, activeMode)
  const input: SnippetInput = { ns: settings.namespace ? settings.namespace.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'icon' : 'icon', name: icon.name, spritePath: './icons/sprite/', importPath: settings.importPath, sizePx: null, sizeUnit: 'px', vars: {} }
  const copy = (what: string, text: string) => notify(copyText(text) ? `${what} copied` : 'Copy is blocked here', false)
  const art = (px: number) => <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: sized(icon.standalone, px) }} />
  const tileCls = (t: Tile) => cx(styles.detailTile, t === 'dark' ? styles.bgDark : t === 'checker' ? styles.bgChecker : styles.bgLight)
  return (
    <Dialog label={`Icon ${icon.name}`} onClose={props.onClose}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <button class={styles.iconBtn} onClick={() => props.onStep(-1)} disabled={props.index <= 0} aria-label="Previous icon" data-hint="Previous icon">‹</button>
          <strong class={cx(styles.grow, styles.ellipsis)} style={{ fontSize: 13 }}>{icon.name || '(no name)'}</strong>
          <span class={styles.muted}>{props.index + 1} / {props.count}</span>
          <button class={styles.iconBtn} onClick={() => props.onStep(1)} disabled={props.index >= props.count - 1} aria-label="Next icon" data-hint="Next icon">›</button>
          <Button secondary onClick={props.onClose}>Close</Button>
        </div>
      </div>
      <div class={styles.overlayBody}>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Preview</span>
          <div class={tileCls(shownTile)} style={style}>{icon.svgOk ? art(64) : <span class={styles.muted}>?</span>}</div>
          <div class={styles.fieldRow} style={{ flexWrap: 'wrap' }}>
            {modes.length > 0 && (
              <span role="group" aria-label="Mode" class={styles.seg}>
                <button class={cx(styles.iconBtn, activeMode === null && styles.iconBtnActive)} aria-pressed={activeMode === null} onClick={() => setMode(null)}>As drawn</button>
                {modes.map((m) => <button key={m} class={cx(styles.iconBtn, activeMode === m && styles.iconBtnActive)} aria-pressed={activeMode === m} onClick={() => setMode(m)}>{m}</button>)}
              </span>
            )}
            <span role="group" aria-label="Background" class={styles.seg}>
              {(['auto', 'light', 'dark', 'checker'] as const).map((t) => <button key={t} class={cx(styles.iconBtn, tile === t && styles.iconBtnActive)} aria-pressed={tile === t} onClick={() => setTile(t)}>{t === 'auto' ? 'Auto' : t[0].toUpperCase() + t.slice(1)}</button>)}
            </span>
          </div>
          <div class={styles.detailLadder} style={style}>
            {SIZES.map((px) => (
              <div key={px} class={tileCls(shownTile)} style={{ padding: 8, minHeight: 0 }}>
                {icon.svgOk ? art(px) : null}
                <span class={styles.muted} style={{ display: 'block', textAlign: 'center' }}>{px}</span>
              </div>
            ))}
          </div>
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Export</span>
          <div class={styles.fieldRow}>
            <div class={styles.grow}>
              <Textbox value={icon.nameOverride ?? icon.name} onValueInput={props.onRename} placeholder={icon.name} />
            </div>
            {icon.nameOverride !== null && <Button secondary onClick={() => props.onRename('')}>Reset</Button>}
          </div>
          <Checkbox value={props.included} onValueChange={props.onInclude}>Include in the export</Checkbox>
          {icon.hasStroke && (
            <div class={styles.fieldRow}>
              <Checkbox value={icon.outlined} disabled={!icon.canOutline} onValueChange={props.onOutline}>Convert strokes to paths on export</Checkbox>
              <InfoTip title="Strokes to paths">
                <span>{icon.canOutline ? 'Exports this line icon with its strokes as filled shapes: identical look everywhere, but the stroke weight can no longer be changed in code. Your Figma layer is not changed.' : 'Figma could not provide an exact outline for this icon (masks, gradients or unsupported shapes), so the normal export is used.'}</span>
              </InfoTip>
            </div>
          )}
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Source</span>
          <div class={styles.muted}>
            {icon.layerName} · page “{icon.pageName}” · {icon.sourceKind} · {icon.width}×{icon.height}
            {icon.categoryLabel ? ` · category “${icon.categoryLabel}”` : ''}
            {icon.setName ? ` · set “${icon.setName}”` : ''}
          </div>
          {Object.keys(icon.variantProps).length > 0 && <div class={styles.muted}>Variant: {Object.entries(icon.variantProps).map(([k, v]) => `${k}=${v}`).join(', ')}</div>}
          {icon.componentKey && <div class={styles.muted}>Component key <code>{icon.componentKey.slice(0, 12)}…</code> <button class={styles.linkBtn} onClick={() => copy('Component key', icon.componentKey!)}>Copy</button></div>}
          {icon.description.trim() ? <div>Description: {icon.description}</div> : <div class={styles.muted}>No description (it becomes the search tags).</div>}
          {icon.tags.length > 0 && <div class={styles.muted}>Tags: {icon.tags.join(' · ')}</div>}
          <div class={styles.fieldRow}>
            <button class={styles.iconBtn} onClick={props.onLocate}><LocateIcon /> Locate on canvas</button>
          </div>
        </div>

        {icon.slots.length > 0 && (
          <div class={styles.section}>
            <span class={styles.sectionTitle}>Colours</span>
            {icon.slots.map((s) => (
              <div key={s.index} style={{ padding: '4px 0' }}>
                <span class={styles.slot}>
                  <span class={styles.swatch} style={{ background: slotColour(s, activeMode) }} />
                  <span class={styles.mono}>{s.cssVar}</span>
                  <span class={styles.muted}>drawn {s.hex}{s.uses > 1 ? ` · ${s.uses} shapes` : ''}</span>
                </span>
                {s.variable ? <div class={styles.muted}>Figma variable {s.variable}{s.token ? ` → ${s.token}` : ''}</div> : <div class={styles.muted}>Not bound to a variable</div>}
                {s.modes && <div class={styles.muted}>{Object.entries(s.modes).map(([m, hex]) => `${m} ${hex}`).join(' · ')}</div>}
              </div>
            ))}
          </div>
        )}

        {(icon.usage || icon.placements !== undefined) && (
          <div class={styles.section}>
            <span class={styles.sectionTitle}>Usage</span>
            {icon.placements !== undefined && <div>{icon.placements === 0 ? 'Not placed in the scanned pages.' : `Placed ${icon.placements}× in the scanned pages.`} <span class={styles.muted}>Other files that use the library are not visible to a plugin.</span></div>}
            {icon.usage && describeUsage(icon.usage).map((l, n) => <div key={n}>{l}</div>)}
            {icon.usage && <div class={styles.muted}>Artwork exported from the {icon.usage.exportedFrom === 'main' ? 'main component' : 'instance (main component not readable)'}.</div>}
          </div>
        )}

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Findings</span>
          {icon.findings.length === 0 && <div class={styles.muted}>No findings.</div>}
          {icon.findings.map((f, n) => (
            <div class={styles.finding} key={n}>
              <span class={sevClass(f.severity)}><SevIcon s={f.severity} /></span>
              <div>
                <strong>{ruleInfo(f.ruleId).title}</strong>
                <div>{f.message}</div>
                {f.fixHint && <div class={styles.muted}>Fix: {f.fixHint}</div>}
                <FormatChips formats={f.formats} />
              </div>
            </div>
          ))}
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>History</span>
          {props.changes.length === 0 ? <div class={styles.muted}>No change since the baseline (or no baseline selected).</div> : <div>{props.changes.map((c) => CHANGE_LABEL[c]).join(' · ')} since the baseline.</div>}
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Use in code</span>
          <div class={styles.fieldRow} style={{ flexWrap: 'wrap' }}>
            <Button secondary onClick={() => copy('Angular', angularSnippet(input))}>Copy Angular</Button>
            <Button secondary onClick={() => copy('HTML', htmlSnippet(input))}>Copy HTML</Button>
            <Button secondary onClick={() => copy('React', reactComponentSnippet(input))}>Copy React</Button>
            <Button secondary onClick={() => copy('SVG', icon.standalone)}>Copy SVG</Button>
          </div>
          <pre class={styles.mono} style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 11 }}>{angularSnippet(input)}</pre>
          <div class={styles.muted}>{plural(icon.findings.length, 'finding')} · {icon.kind}</div>
        </div>
      </div>
    </Dialog>
  )
}
