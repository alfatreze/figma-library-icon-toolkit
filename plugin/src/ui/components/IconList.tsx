import { Button, Checkbox, Textbox } from '@create-figma-plugin/ui'

import { ComponentChildren, h } from 'preact'

import { FORMAT_LABEL, describeUsage } from '../../core/overrides'
import { ruleInfo } from '../../core/rules'
import { BlockIcon, CheckIcon, InfoIcon, LocateIcon, WarnIcon } from '../icons'
import { PreviewBg, bgClass } from '../IconPreview'
import { InfoTip } from '../InfoTip'
import styles from '../styles'
import { FormatId, Icon, ScanScope, ScanSummary } from '../../types'

import { cx, plural } from '../util'
import { SevIcon, sevClass, worst } from './severity'

export function Chip(props: { active: boolean; onClick: () => void; children: ComponentChildren; tone?: 'error' | 'warn'; disabled?: boolean; title?: string }) {
  return (
    <button
      class={cx(styles.chip, props.active && styles.chipActive, props.tone === 'error' && styles.chipError, props.tone === 'warn' && styles.chipWarn)}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.active}
      data-hint={props.title}
    >
      {props.children}
    </button>
  )
}

export function EmptyState({ summary, scope }: { summary: ScanSummary | null; scope: ScanScope }) {
  if (summary) {
    return (
      <div class={styles.emptyNote}>
        <strong>No icons found</strong>
        <p>Try Page or Document, or open Skipped to see layers that were left out.</p>
      </div>
    )
  }
  return (
    <div class={styles.emptyNote}>
      <p>Press <strong>Scan {scope}</strong> to list its icons. Choose Page or Document to look wider.</p>
      <p class={styles.muted}>Read-only: your file is never changed.</p>
    </div>
  )
}

export function Thumb({ icon }: { icon: Icon }) {
  return icon.svgOk ? <span dangerouslySetInnerHTML={{ __html: icon.standalone }} style={{ display: 'contents' }} /> : <span class={styles.muted}>?</span>
}

export function StatusPill({ icon, onClick }: { icon: Icon; onClick?: () => void }) {
  const errs = icon.findings.filter((f) => f.severity === 'error').length
  const warns = icon.findings.filter((f) => f.severity === 'warn').length
  const infos = icon.findings.length - errs - warns
  if (errs) return <button class={cx(styles.pill, styles.pillError)} onClick={onClick} data-hint="Blocked: not exported until fixed or excluded"><BlockIcon /> Blocked{errs > 1 ? ` · ${errs}` : ''}</button>
  if (warns) return <button class={cx(styles.pill, styles.pillWarn)} onClick={onClick} data-hint="Exported, but worth a look"><WarnIcon /> {plural(warns, 'warning')}</button>
  if (infos) return <button class={cx(styles.pill, styles.pillInfo)} onClick={onClick} data-hint="Informational notes"><InfoIcon /> {infos}</button>
  return <span class={cx(styles.pill, styles.pillOk)} data-hint="No findings"><CheckIcon /></span>
}

export function FormatChips({ formats }: { formats?: FormatId[] }) {
  if (!formats || !formats.length) return null
  return (
    <span class={styles.fmtChips}>
      {formats.map((f) => <span class={styles.fmtChip} key={f}>{FORMAT_LABEL[f]}</span>)}
    </span>
  )
}

export function Row(props: {
  icon: Icon
  size: 'S' | 'M' | 'L'
  bg: PreviewBg
  onPreview: (icon: Icon, el: HTMLElement) => void
  onPreviewEnd: () => void
  included: boolean
  expanded: boolean
  onInclude: (v: boolean) => void
  onExpand: () => void
  onRename: (v: string) => void
  onLocate: () => void
  onOutline: (v: boolean) => void
}) {
  const { icon, expanded } = props
  const firstError = icon.findings.find((f) => f.severity === 'error')
  const sub = [icon.categoryLabel, icon.usage ? `used ${icon.usage.instances}×${icon.usage.remote ? ' · library' : ''}` : ''].filter(Boolean).join(' · ')
  const rowEl = (e: Event) => (e.currentTarget as HTMLElement).closest('[data-row]') as HTMLElement
  return (
    <div class={cx(styles.row, expanded && styles.rowSelected)} data-row>
      <div class={cx(styles.rowMain, !props.included && styles.rowOff)}>
        <Checkbox value={props.included} onValueChange={props.onInclude}>{''}</Checkbox>
        <span class={cx(styles.thumb, props.size === 'S' && styles.thumbS, props.size === 'L' && styles.thumbL, bgClass(props.bg, icon))} onMouseEnter={(e) => props.onPreview(icon, rowEl(e))} onMouseLeave={props.onPreviewEnd}><Thumb icon={icon} /></span>
        <button class={styles.nameBtn} onClick={props.onExpand} aria-expanded={expanded} data-hint="Show details and rename" onFocus={(e) => props.onPreview(icon, rowEl(e))} onBlur={props.onPreviewEnd}>
          <div class={cx(styles.name, styles.ellipsis, icon.nameOverride !== null && styles.renamed)}>{icon.name || '(no name)'}</div>
          <div class={cx(styles.ellipsis, firstError ? styles.sevError : styles.muted)}>{firstError ? firstError.message : sub}</div>
        </button>
        <StatusPill icon={icon} onClick={props.onExpand} />
        <button class={styles.iconBtn} onClick={props.onLocate} aria-label={`Locate ${icon.name}`} data-hint="Locate on canvas"><LocateIcon /></button>
      </div>
      {expanded && (
        <div class={styles.details}>
          <div class={styles.fieldRow}>
            <div class={styles.grow}>
              <Textbox value={icon.nameOverride ?? icon.name} onValueInput={props.onRename} placeholder={icon.name} />
            </div>
            {icon.nameOverride !== null && <Button secondary onClick={() => props.onRename('')}>Reset</Button>}
          </div>
          <div class={styles.muted}>
            {icon.layerName} · page “{icon.pageName}” · {icon.sourceKind} · {icon.width}×{icon.height}
            {icon.categoryLabel ? ` · category “${icon.categoryLabel}”` : ''}
          </div>
          {icon.usage && (
            <div class={styles.usage}>
              {describeUsage(icon.usage).map((l, n) => <div key={n}>{l}</div>)}
              <div class={styles.muted}>Artwork exported from the {icon.usage.exportedFrom === 'main' ? 'main component' : 'instance (main component not readable)'}.</div>
            </div>
          )}
          {icon.hasStroke && (
            <div class={styles.fieldRow}>
              <Checkbox value={icon.outlined} disabled={!icon.canOutline} onValueChange={(v) => props.onOutline(v)}>
                Convert strokes to paths on export
              </Checkbox>
              <InfoTip title="Strokes to paths">
                <span>{icon.canOutline ? 'Exports this line icon with its strokes as filled shapes: identical look everywhere, but the stroke weight can no longer be changed in code. Your Figma layer is not changed.' : 'Figma could not provide an exact outline for this icon (masks, gradients or unsupported shapes), so the normal export is used.'}</span>
              </InfoTip>
            </div>
          )}
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
          {icon.slots.length > 0 && (
            <div class={styles.slots}>
              {icon.slots.map((s) => (
                <span class={styles.slot} key={s.index}>
                  <span class={styles.swatch} style={{ background: s.hex }} />
                  <span class={styles.mono}>{s.cssVar}</span>
                  {s.variable && <span class={styles.muted}>{s.variable}</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Card(props: { icon: Icon; bg: PreviewBg; included: boolean; onInclude: (v: boolean) => void; onLocate: () => void; onExpand: () => void }) {
  const { icon } = props
  const sev = worst(icon.findings)
  return (
    <div class={cx(styles.card, sev === 'error' && styles.cardError, sev === 'warn' && styles.cardWarn, !props.included && styles.rowOff)}>
      <div class={cx(styles.cardThumb, bgClass(props.bg, icon))}><Thumb icon={icon} /></div>
      <button class={styles.nameBtn} onClick={props.onExpand} title={icon.layerName}>
        <div class={cx(styles.name, styles.ellipsis)}>{icon.name}</div>
        {icon.categoryLabel && <div class={cx(styles.muted, styles.ellipsis)}>{icon.categoryLabel}</div>}
      </button>
      <StatusPill icon={icon} onClick={props.onExpand} />
      <div class={styles.cardFoot}>
        <Checkbox value={props.included} onValueChange={props.onInclude}>Include</Checkbox>
        <button class={styles.iconBtn} onClick={props.onLocate} aria-label={`Locate ${icon.name}`} data-hint="Locate on canvas"><LocateIcon /></button>
      </div>
    </div>
  )
}

