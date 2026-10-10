import { Button, Checkbox, Dropdown, SearchTextbox } from '@create-figma-plugin/ui'
import { ComponentChildren, Fragment, h } from 'preact'
import { BASELINE_LABEL, BaselineSource, CHANGE_LABEL, ChangeKind } from '../../core/baseline'
import { ruleInfo } from '../../core/rules'
import { BlockIcon, GridIcon, GroupedIcon, ListIcon, WarnIcon } from '../icons'
import { PreviewBg } from '../IconPreview'
import { Segmented } from '../components/Segmented'
import { Card, Chip, EmptyState } from '../components/IconList'
import styles from '../styles'
import { presentChangeKinds } from '../selectors'
import { Icon, ScanScope, ScanSummary } from '../../types'
import { cx, plural } from '../util'

export type View = 'list' | 'grouped' | 'grid'
export type Status = 'all' | 'blocked' | 'alerts' | 'excluded' | 'unused'

export interface IconsPanelProps {
  icons: Icon[]
  visible: Icon[]
  limit: number
  pageSize: number
  hasResults: boolean
  interactive: boolean
  scanning: boolean
  summary: ScanSummary | null
  scope: ScanScope
  query: string
  view: View
  previewSize: 'S' | 'M' | 'L'
  previewBg: PreviewBg
  categories: { id: string; label: string; count: number }[]
  catFilter: string
  status: Status
  ruleFilter: string | null
  changeFilter: ChangeKind | null
  changeCounts: Partial<Record<ChangeKind, number>>
  showChanges: boolean
  baselineSource: BaselineSource | null
  blockedCount: number
  alertCount: number
  /** components not placed anywhere in the scanned pages */
  unusedCount: number
  off: Set<string>
  onQuery: (v: string) => void
  onView: (v: View) => void
  onPreviewSize: (v: 'S' | 'M' | 'L') => void
  onCategory: (v: string) => void
  onShow: (next: { status?: Status; rule?: string | null }) => void
  onClearRule: () => void
  onChangeFilter: (k: ChangeKind | null) => void
  onLimit: (n: number) => void
  onSelectAll: (v: boolean) => void
  onInclude: (key: string, v: boolean) => void
  onLocate: (nodeId: string) => void
  onExpand: (icon: Icon) => void
  onScroll: () => void
  renderRows: (list: Icon[]) => ComponentChildren
  renderGrouped: (list: Icon[]) => ComponentChildren
}

/** the Icons tab: search and filters, the list / grouped / grid views and paging */
export function IconsPanel(p: IconsPanelProps) {
  const { visible, limit, interactive, hasResults, scanning, categories, off, icons, view, status, ruleFilter, previewSize, previewBg } = p
  return (
    <Fragment>
      <div class={styles.toolbar}>
        <div class={styles.toolbarRow}>
          <div class={styles.grow}>
            <SearchTextbox value={p.query} onValueInput={p.onQuery} placeholder="Search" disabled={!interactive} />
          </div>
          <div class={styles.seg} role="group" aria-label="View">
            <button class={cx(styles.iconBtn, view === 'list' && styles.iconBtnActive)} onClick={() => p.onView('list')} aria-label="List view" aria-pressed={view === 'list'} data-hint="List" disabled={!interactive}><ListIcon /></button>
            <button class={cx(styles.iconBtn, view === 'grouped' && styles.iconBtnActive)} onClick={() => p.onView('grouped')} aria-label="Group by category" aria-pressed={view === 'grouped'} data-hint="Group by category" disabled={!interactive || categories.length === 0}><GroupedIcon /></button>
            <button class={cx(styles.iconBtn, view === 'grid' && styles.iconBtnActive)} onClick={() => p.onView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'} data-hint="Grid" disabled={!interactive}><GridIcon /></button>
          </div>
          <Segmented<'S' | 'M' | 'L'>
            compact
            label="Preview size"
            value={previewSize}
            onValueChange={p.onPreviewSize}
            disabled={!interactive || view === 'grid'}
            options={[{ value: 'S', children: 'S', title: 'Small previews' }, { value: 'M', children: 'M', title: 'Medium previews' }, { value: 'L', children: 'L', title: 'Large previews' }]}
          />
        </div>
        <div class={styles.toolbarRow}>
          <div class={styles.grow}>
            <Dropdown
              value={p.catFilter || '__all'}
              disabled={!interactive || categories.length === 0}
              onValueChange={(v) => p.onCategory(v === '__all' ? '' : v)}
              options={[{ value: '__all', text: categories.length ? `All categories (${categories.length})` : 'All categories' }, ...categories.map((c) => ({ value: c.id, text: `${c.label} (${c.count})` }))]}
            />
          </div>
        </div>
        <div class={styles.chips}>
          <Chip active={status === 'all' && !ruleFilter} onClick={() => p.onShow({})} disabled={!interactive}>All</Chip>
          <Chip tone="error" active={status === 'blocked'} onClick={() => p.onShow({ status: 'blocked' })} disabled={!interactive || p.blockedCount === 0} title="Not exported until fixed or excluded">
            <BlockIcon /> Blocked {p.blockedCount}
          </Chip>
          <Chip tone="warn" active={status === 'alerts'} onClick={() => p.onShow({ status: 'alerts' })} disabled={!interactive || p.alertCount === 0} title="Exported, but worth a look">
            <WarnIcon /> Warnings {p.alertCount}
          </Chip>
          {p.unusedCount > 0 && (
            <Chip active={status === 'unused'} onClick={() => p.onShow({ status: 'unused' })} title="Components with no instance in the pages you scanned. Other files that use the library are not visible here: check Figma's library analytics before removing anything.">
              Unused {p.unusedCount}
            </Chip>
          )}
          {off.size > 0 && (
            <Chip active={status === 'excluded'} onClick={() => p.onShow({ status: 'excluded' })}>Excluded {off.size}</Chip>
          )}
          {p.showChanges && presentChangeKinds(p.changeCounts).map((k) => (
            <Chip key={k} active={p.changeFilter === k} onClick={() => p.onChangeFilter(p.changeFilter === k ? null : k)} title={`Changed since the baseline: ${BASELINE_LABEL[p.baselineSource!]}`}>
              {CHANGE_LABEL[k]} {p.changeCounts[k]}
            </Chip>
          ))}
        </div>
      </div>

      {ruleFilter && (
        <div class={styles.banner}>
          <span>
            <strong>{ruleInfo(ruleFilter).title}</strong> · {plural(visible.length, 'icon')}
          </span>
          <button class={styles.iconBtn} onClick={() => p.onClearRule()}>Clear</button>
        </div>
      )}

      <div class={styles.list} onScroll={() => p.onScroll()}>
        <div class={styles.listHead}>
          <Checkbox value={hasResults && off.size === 0} disabled={!interactive} onValueChange={p.onSelectAll}>
            Select all
          </Checkbox>
          {interactive && visible.length !== icons.length && <span>Showing {visible.length}</span>}
        </div>
        {!hasResults && !scanning && <EmptyState summary={p.summary} scope={p.scope} />}
        {scanning && !hasResults && [0, 1, 2].map((n) => (
          <div class={styles.skelRow} key={n} aria-hidden="true"><span /><span class={styles.skelBox} /><div><div class={styles.skelLine} style={{ width: 90 }} /><div class={styles.skelLine} style={{ width: 140 }} /></div></div>
        ))}
        {hasResults && visible.length === 0 && <div class={styles.empty}>No icons match.</div>}
        {view === 'list' && p.renderRows(visible.slice(0, limit))}
        {view === 'grouped' && p.renderGrouped(visible.slice(0, limit))}
        {view === 'grid' && (
          <div class={styles.grid}>
            {visible.slice(0, limit).map((i) => (
              <Card key={i.key} icon={i} bg={previewBg} included={!off.has(i.key)} onInclude={(v) => p.onInclude(i.key, v)} onLocate={() => p.onLocate(i.nodeId)} onExpand={() => p.onExpand(i)} />
            ))}
          </div>
        )}
        {visible.length > limit && (
          <div style={{ padding: '8px 0' }}>
            <Button secondary fullWidth onClick={() => p.onLimit(limit + p.pageSize)}>Show more ({visible.length - limit} left)</Button>
          </div>
        )}
      </div>

    </Fragment>
  )
}
