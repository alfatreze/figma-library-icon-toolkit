import { Button } from '@create-figma-plugin/ui'

import { ComponentChildren, h } from 'preact'

import { ruleInfo } from '../../core/rules'
import { ChevronIcon, LocateIcon, NextIcon } from '../icons'

import styles from '../styles'
import { FixCandidate, Icon, ScanSummary } from '../../types'
import { IssueGroup } from '../selectors'
import { cx, plural } from '../util'
import { SevIcon, sevClass } from './severity'
import { FormatChips } from './IconList'

export function IssueOverview(props: {
  groups: IssueGroup[]
  fixesFor: (ruleId: string, icons: Icon[]) => FixCandidate[]
  fixable: (f: FixCandidate) => boolean
  labsReady: boolean
  onFixGroup: (g: IssueGroup) => void
  onFixAll: () => void
  onShow: (g: IssueGroup) => void
}) {
  const rows = props.groups.map((g) => {
    const fixes = props.fixesFor(g.ruleId, g.icons).filter(props.fixable)
    return { g, fixes, safe: fixes.filter((f) => f.confidence !== 'low').length }
  })
  const errors = props.groups.filter((g) => g.severity === 'error').reduce((a, g) => a + g.icons.length, 0)
  const warns = props.groups.filter((g) => g.severity === 'warn').reduce((a, g) => a + g.icons.length, 0)
  const totalSafe = rows.reduce((a, r) => a + r.safe, 0)
  return (
    <div class={styles.ovw}>
      <div class={styles.fieldRow}>
        <div class={styles.grow}>
          <strong>{totalSafe} can be fixed automatically</strong>
          <div class={styles.muted}>{plural(errors + warns, 'icon')} affected. Fixes edit your file only after you review them (Labs).</div>
        </div>
        {totalSafe > 0 && (
          <Button onClick={props.onFixAll} data-hint={props.labsReady ? '' : 'Enable Labs first'}>
            Fix all ({totalSafe})
          </Button>
        )}
      </div>
      {rows.map(({ g, fixes, safe }) => {
        const info = ruleInfo(g.ruleId)
        return (
          <div class={styles.ovwRow} key={g.ruleId}>
            <span class={sevClass(g.severity)}><SevIcon s={g.severity} /></span>
            <div style={{ minWidth: 0 }}>
              <div><strong>{info.title}</strong> <span class={styles.muted}>· {plural(g.icons.length, 'icon')}</span></div>
              <div class={cx(styles.muted, styles.ellipsis)} title={info.fix}>Suggested: {info.fix}</div>
            </div>
            <div class={styles.ovwActions}>
              {safe > 0 ? (
                <Button onClick={() => props.onFixGroup(g)}>Fix {safe}</Button>
              ) : (
                <Button secondary onClick={() => props.onShow(g)}>Show</Button>
              )}
              {fixes.length > safe && <span class={styles.muted} data-hint="Low-confidence fixes (they would discard edits) are excluded from Fix all; review them one by one">+{fixes.length - safe} to review</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function LeafSchemes({ info }: { info: NonNullable<ScanSummary['leafNames']> }) {
  const total = info.stats.reduce((a, s) => a + s.count, 0)
  return (
    <div class={styles.diffNames} style={{ marginTop: 0 }}>
      <div><strong>Vector layer names in this file</strong> <span class={styles.muted}>(single-layer components)</span></div>
      {info.stats.map((s) => (
        <div key={s.name} class={styles.mono}>
          “{s.name}” × {s.count}{s.name === info.standard ? '  ← standard' : ''}{s.name !== info.standard && s.name.toLowerCase() === info.standard.toLowerCase() ? '  (same name, different case)' : ''}
        </div>
      ))}
      <div class={styles.muted}>
        {info.detected ? `Standard detected from the file (${total} components counted).` : 'No clear majority in the file, so the name from Settings is the standard.'}
        {info.caseVariants > 0 ? ` ${info.caseVariants} differ only by upper/lower case.` : ''}
      </div>
    </div>
  )
}

export function IssueCard(props: { extra?: ComponentChildren; group: IssueGroup; cursor: number; fixes: FixCandidate[]; fixesOpen: boolean; onToggleFixes: () => void; renderFix: (f: FixCandidate) => ComponentChildren; onShow: () => void; onLocate: () => void }) {
  const { group } = props
  const info = ruleInfo(group.ruleId)
  const n = group.icons.length
  const sample = group.icons.slice(0, 4)
  return (
    <div class={cx(styles.issue, group.severity === 'error' ? styles.issueError : group.severity === 'warn' ? styles.issueWarn : styles.issueInfo)}>
      <div class={styles.issueHead}>
        <span class={sevClass(group.severity)}><SevIcon s={group.severity} /></span>
        <span class={cx(styles.issueTitle, styles.grow)}>{info.title}</span>
        <span class={cx(styles.count, group.severity === 'error' && styles.countError, group.severity === 'warn' && styles.countWarn)}>{plural(n, 'icon')}</span>
      </div>
      {info.why && <div class={styles.muted}>{info.why}</div>}
      {props.extra}
      {info.fix && <div><strong>How to fix:</strong> {info.fix}</div>}
      {group.formats.length > 0 && (
        <div class={styles.fieldRow}>
          <span class={styles.muted}>Affects:</span> <FormatChips formats={group.formats} />
        </div>
      )}
      <div class={styles.samples}>
        {sample.map((i) => <span class={cx(styles.sample, styles.mono)} key={i.key}>{i.name}</span>)}
        {n > sample.length && <span class={styles.muted}>+{n - sample.length} more</span>}
      </div>
      {props.fixes.length > 0 && (
        <div>
          <button class={styles.linkBtn} onClick={props.onToggleFixes} aria-expanded={props.fixesOpen}>
            <ChevronIcon open={props.fixesOpen} /> {plural(props.fixes.filter((f) => f.actions.length).length, 'automatic fix')}: review with preview
          </button>
          {props.fixesOpen && <div style={{ marginTop: 6 }}>{props.fixes.slice(0, 30).map((f) => props.renderFix(f))}{props.fixes.length > 30 && <div class={styles.muted}>+{props.fixes.length - 30} more; use Show icons to see all</div>}</div>}
        </div>
      )}
      <div class={styles.issueActions}>
        <Button secondary onClick={props.onShow}>{n === 1 ? 'Show icon' : `Show ${n} icons`}</Button>
        <button class={styles.iconBtn} onClick={props.onLocate} data-hint="Select the affected layer in Figma">
          <LocateIcon /> Select in Figma{n > 1 ? ` ${(props.cursor % n) + 1}/${n}` : ''} {n > 1 && <NextIcon />}
        </button>
      </div>
    </div>
  )
}

/** Dev Mode inspect panel gets a small read-only UI; everything else is the full plugin. */
