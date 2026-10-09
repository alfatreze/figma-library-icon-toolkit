import { Button } from '@create-figma-plugin/ui'
import { ComponentChildren, h } from 'preact'
import { STEPS } from '../../core/rules'
import { ChevronIcon, CheckIcon } from '../icons'
import { InfoTip } from '../InfoTip'
import styles from '../styles'
import { FixCandidate, ScanSummary, Severity, Settings } from '../../types'
import { IssueGroup } from '../selectors'
import { IssueCard, IssueOverview, LeafSchemes } from '../components/Issues'
import { useFixes } from '../hooks/useFixes'
import { plural } from '../util'

export interface IssuesPanelProps {
  summary: string
  scanSummary: ScanSummary | null
  iconCount: number
  groups: IssueGroup[]
  actionable: IssueGroup[]
  allFixes: FixCandidate[]
  autoFixCount: number
  fixes: ReturnType<typeof useFixes>
  settings: Settings
  scanning: boolean
  cursor: Record<string, number>
  showNotes: boolean
  renderFix: (f: FixCandidate) => ComponentChildren
  onReport: () => void
  onFixesReport: () => void
  onFix: (list: FixCandidate[]) => void
  onShowRule: (ruleId: string) => void
  onLocateRule: (group: IssueGroup) => void
  onToggleNotes: () => void
  onOpenSettings: () => void
  onDescriptions: () => void
}

/** the Issues tab: what blocks the export, what is worth a look, and the automatic fixes for both */
export function IssuesPanel(p: IssuesPanelProps) {
  const { fixes, groups, actionable, allFixes, settings } = p
  const labsReady = settings.labs && settings.labsBranchAck
  const card = (x: IssueGroup) => (
    <IssueCard
      key={x.ruleId}
      extra={x.ruleId === 'layer-names' && p.scanSummary?.leafNames ? <LeafSchemes info={p.scanSummary.leafNames} /> : undefined}
      group={x}
      cursor={p.cursor[x.ruleId] ?? 0}
      fixes={fixes.forRule(x.ruleId, x.icons)}
      fixesOpen={fixes.groupOpen.has(x.ruleId)}
      onToggleFixes={() => fixes.toggleGroup(x.ruleId)}
      renderFix={p.renderFix}
      onShow={() => p.onShowRule(x.ruleId)}
      onLocate={() => p.onLocateRule(x)}
    />
  )
  return (
      <div class={styles.list}>
        <div class={styles.listHead} style={{ justifyContent: 'space-between' }}>
          <span>{p.summary}</span>
          <span class={styles.fieldRow}>
          <Button secondary onClick={p.onDescriptions} disabled={p.iconCount === 0}>Descriptions…</Button>
          <Button secondary onClick={p.onReport} disabled={p.iconCount === 0}>Report…</Button>
        </span>
        </div>
        {actionable.length > 0 && p.autoFixCount > 0 && (
          <IssueOverview
            groups={actionable}
            fixesFor={fixes.forRule}
            fixable={fixes.fixable}
            labsReady={labsReady}
            onFixGroup={(g) => p.onFix(fixes.forRule(g.ruleId, g.icons))}
            onFixAll={() => p.onFix(p.allFixes)}
            onShow={(g) => p.onShowRule(g.ruleId)}
          />
        )}
        {allFixes.some((f) => f.actions.length > 0) && (
          <div class={styles.applyBarSticky}>
            <div class={styles.fieldRow}>
              <strong class={styles.grow}>Selected fixes: {fixes.selected.length} of {plural(allFixes.filter((f) => f.actions.length).length, 'automatic fix')}</strong>
              <span class={styles.labsBadge}>Labs</span>
              <InfoTip title="Automatic fixes">
                <span>Some problems can be fixed for you: replacing a detached icon with an instance, turning a frame into a component, standardising layer names. Open a problem’s <em>fixes</em> to see before/after previews. Fixes <strong>edit your Figma file</strong> only after you review and confirm, and are applied as one undo step. Turn on Labs in Settings and confirm you are in a branch or copy.</span>
              </InfoTip>
            </div>
            {!settings.labs || !settings.labsBranchAck ? (
              <div class={styles.muted}>
                {!settings.labs ? 'Applying fixes is a Labs feature (off).' : 'Confirm you are working in a branch or a copy to enable Apply.'}{' '}
                <button class={styles.linkBtn} onClick={p.onOpenSettings}>{settings.labs ? 'Open Labs settings' : 'Enable Labs…'}</button> · <button class={styles.linkBtn} onClick={p.onFixesReport}>Dry-run report (.md)</button>
              </div>
            ) : (
              <div class={styles.fieldRow}>
                <div class={styles.grow}>
                  <Button fullWidth onClick={fixes.openConfirm} disabled={fixes.selected.length === 0 || p.scanning}>
                    {fixes.selected.length ? `Review & apply ${plural(fixes.selected.length, 'fix')}` : 'Select fixes to apply'}
                  </Button>
                </div>
                <button class={styles.linkBtn} onClick={fixes.selectAll}>Select all</button>
                <button class={styles.linkBtn} onClick={p.onFixesReport}>Dry-run report</button>
              </div>
            )}
          </div>
        )}
        {actionable.length === 0 && (
          <div class={styles.empty}>
            <div class={styles.allClear}><CheckIcon /> No errors or warnings.</div>
          </div>
        )}
        {(['error', 'warn'] as Severity[]).map((sev) => {
          const list = groups.filter((x) => x.severity === sev)
          if (!list.length) return null
          return (
            <div key={sev}>
              <div class={styles.groupTitle}>{sev === 'error' ? 'Blocked: not exported' : 'Warnings'} · {list.length}</div>
              {list.map((x) => (
                card(x)
              ))}
            </div>
          )
        })}
        {groups.some((x) => x.severity === 'info') && (
          <div>
            <div class={styles.groupTitle}>
              <button class={styles.iconBtn} onClick={() => p.onToggleNotes()} aria-expanded={p.showNotes}>
                <ChevronIcon open={p.showNotes} /> Notes · {groups.filter((x) => x.severity === 'info').length}
              </button>
            </div>
            {p.showNotes &&
              groups.filter((x) => x.severity === 'info').map((x) => (
                card(x)
              ))}
          </div>
        )}
        {actionable.length > 0 && (
          <details class={styles.muted} style={{ padding: '4px 0 8px' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--figma-color-text-brand)' }}>Suggested order for fixing a whole library</summary>
            <div style={{ paddingTop: 4 }}>{STEPS.map((s) => s.title).join(' → ')}. Fix in Figma, then scan again.</div>
          </details>
        )}
      </div>

  )
}
