import { Checkbox } from '@create-figma-plugin/ui'

import { ComponentChildren, h } from 'preact'

import { FORMAT_LABEL } from '../../core/overrides'
import { BlockIcon, CheckIcon, InfoIcon, LocateIcon, WarnIcon } from '../icons'
import { PreviewBg, bgClass } from '../IconPreview'
import styles from '../styles'
import { FormatId, Icon, ScanScope, ScanSummary } from '../../types'

import { cx, plural } from '../util'
import { worst } from './severity'

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
  /** the icon whose detail panel is open */
  selected: boolean
  onInclude: (v: boolean) => void
  /** open the detail panel */
  onExpand: () => void
  onLocate: () => void
}) {
  const { icon, selected } = props
  const firstError = icon.findings.find((f) => f.severity === 'error')
  const sub = [icon.categoryLabel, icon.usage ? `used ${icon.usage.instances}×${icon.usage.remote ? ' · library' : ''}` : ''].filter(Boolean).join(' · ')
  const rowEl = (e: Event) => (e.currentTarget as HTMLElement).closest('[data-row]') as HTMLElement
  return (
    <div class={cx(styles.row, selected && styles.rowSelected)} data-row>
      <div class={cx(styles.rowMain, !props.included && styles.rowOff)}>
        <Checkbox value={props.included} onValueChange={props.onInclude}>{''}</Checkbox>
        <span class={cx(styles.thumb, props.size === 'S' && styles.thumbS, props.size === 'L' && styles.thumbL, bgClass(props.bg, icon))} onMouseEnter={(e) => props.onPreview(icon, rowEl(e))} onMouseLeave={props.onPreviewEnd}><Thumb icon={icon} /></span>
        <button class={styles.nameBtn} onClick={props.onExpand} data-hint="Open the icon details" onFocus={(e) => props.onPreview(icon, rowEl(e))} onBlur={props.onPreviewEnd}>
          <div class={cx(styles.name, styles.ellipsis, icon.nameOverride !== null && styles.renamed)}>{icon.name || '(no name)'}</div>
          <div class={cx(styles.ellipsis, firstError ? styles.sevError : styles.muted)}>{firstError ? firstError.message : sub}</div>
        </button>
        <StatusPill icon={icon} onClick={props.onExpand} />
        <button class={styles.iconBtn} onClick={props.onLocate} aria-label={`Locate ${icon.name}`} data-hint="Locate on canvas"><LocateIcon /></button>
      </div>
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

