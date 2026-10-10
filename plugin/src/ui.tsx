import { Button, Checkbox, render } from '@create-figma-plugin/ui'
import { emit, on } from '@create-figma-plugin/utilities'
import { h } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { summariseCategories } from './core/categories'
import { buildFiles, TARGETS } from './core/generators'
import { fixesReportMarkdown, fixPlanMarkdown } from './core/generators/manifest'
import { BASELINE_LABEL, BaselineSource, ChangeKind } from './core/baseline'
import { exportConfig, parseConfig, serializeShared } from './core/config'
import { TIER_LABEL } from './core/library'
import { cleanNamespace } from './core/naming'
import { hasBlockingErrors, processIcons, ThemeCache } from './core/process'
import { SHARED_KEYS } from './core/settingsSchema'
import { zipFiles } from './core/zip'
import styles from './ui/styles'
import { ConfirmApply, FixCard } from './ui/Fixes'
import { useFilters } from './ui/hooks/useFilters'
import { useDescriptions } from './ui/hooks/useDescriptions'
import { DescriptionsDialog } from './ui/DescriptionsDialog'
import { ReportDialog } from './ui/ReportDialog'
import { BulkRenameDialog } from './ui/BulkRenameDialog'
import { useBulkRename } from './ui/hooks/useBulkRename'
import { buildHealth, healthHtml, healthMarkdown } from './core/report'
import { useFixes } from './ui/hooks/useFixes'
import { groupOutputs, outputReady, settingsFor } from './core/outputs'
import { IconsPanel, Status, View } from './ui/panels/IconsPanel'
import { IssuesPanel } from './ui/panels/IssuesPanel'
import { SkippedPanel } from './ui/panels/SkippedPanel'
import { Row } from './ui/components/IconList'
import { ExportPanel } from './ui/ExportPanel'
import { CogIcon } from './ui/icons'
import { computeOverview } from './ui/overview'
import { useResizeHandles } from './ui/resize'
import { IconPreview, PreviewBg } from './ui/IconPreview'
import { Segmented } from './ui/components/Segmented'
import { TabBar, TabPanel } from './ui/components/TabBar'
import { InspectPanel } from './ui/Inspect'
import { filterIcons, groupIssues, IssueGroup, isAlert, isBlocked } from './ui/selectors'
import { useBaselines } from './ui/hooks/useBaselines'
import { useScan } from './ui/hooks/useScan'
import { usePublish } from './ui/hooks/usePublish'
import { pullRequestText } from './core/pullRequest'
import { copyText, cx, download, notify, plural } from './ui/util'
import { recentLog } from './log'
import { DiagnosticsHandler, RequestDiagnosticsHandler } from './types'
import { SettingsPanel, SettingsTab } from './ui/Settings'
import { PublishDialog } from './ui/PublishDialog'
import { ConfigPublishedHandler, PublishConfigHandler, SharedConfigHandler, FixCandidate, CancelScanHandler, DEFAULT_SETTINGS, Icon, LocateHandler, ResizeHandler, SaveSettingsHandler, AttachDevResourcesHandler, DevResourcesAttachedHandler, ScanHandler, ScanScope, SelectionHandler, Settings, SettingsLoadedHandler, UiReadyHandler } from './types'

const PAGE_SIZE = 200
type Tab = 'icons' | 'issues' | 'skipped'


function Plugin() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [selection, setSelection] = useState<{ count: number; names: string[] }>({ count: 0, names: [] })
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [off, setOff] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>('icons')
  const { filters, dispatch: filter } = useFilters(PAGE_SIZE)
  const { status, rule: ruleFilter, category: catFilter, query, change: changeFilter, limit } = filters
  const [view, setView] = useState<View>('list')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState<Record<string, number>>({})
  const [showNotes, setShowNotes] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('packages')
  const [previewSize, setPreviewSize] = useState<'S' | 'M' | 'L'>('M')
  const [previewBg, setPreviewBg] = useState<PreviewBg>('auto')
  const [hover, setHover] = useState<{ icon: Icon; rect: DOMRect } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverHide = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [scannedAt, setScannedAt] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [outlineOverrides, setOutlineOverrides] = useState<Record<string, boolean>>({})
  const [configMessage, setConfigMessage] = useState('')
  const [sharedCfg, setSharedCfg] = useState<{ at: string; by: string | null; config: string } | null>(null)
  const resetFixes = useRef(() => {})
  // reset what belongs to the previous scan (the hook resets its own rows and progress)
  const resetForScan = () => {
    setOff(new Set())
    setOpen(new Set())
    setCursor({})
    resetFixes.current()
    filter({ type: 'reset' })
  }
  const { raws, summary, scanning, progress, phase, scanError } = useScan(resetForScan)
  useEffect(() => {
    if (summary && !scanning) setScannedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
  }, [summary, scanning])

  useEffect(() => {
    const offs = [
      on<SettingsLoadedHandler>('SETTINGS_LOADED', (s) => {
        setSettings(s)
        setLoaded(true)
      }),
      on<DevResourcesAttachedHandler>('DEV_RESOURCES_ATTACHED', (added, existing, failed, message) =>
        setConfigMessage(`Dev resources: ${added} added, ${existing} already there${failed ? `, ${failed} failed${message ? ` (${message})` : ''}` : ''}.`)
      ),
      on<DiagnosticsHandler>('DIAGNOSTICS', (text) => notify(copyText(text + '\n--- recent log (ui) ---\n' + recentLog().join('\n')) ? 'Diagnostics copied' : 'Copy is blocked here', false)),
      on<SharedConfigHandler>('SHARED_CONFIG', (at, by, config) => setSharedCfg(at && config ? { at, by, config } : null)),
      on<ConfigPublishedHandler>('CONFIG_PUBLISHED', (ok, message) => setConfigMessage(message + (ok ? '.' : ''))),
      on<SelectionHandler>('SELECTION', (count, names) => setSelection({ count, names })),
    ]
    emit<UiReadyHandler>('UI_READY')
    return () => offs.forEach((o) => o())
  }, [])

  useEffect(() => {
    if (!loaded) return
    const t = setTimeout(() => emit<SaveSettingsHandler>('SAVE_SETTINGS', settings), 400)
    return () => clearTimeout(t)
  }, [settings, loaded])

  // resize handles: no React state is touched while dragging (see ui/resize.ts)
  useResizeHandles((w, h) => emit<ResizeHandler>('RESIZE', w, h), { minWidth: 360, minHeight: 460, maxWidth: 1000, maxHeight: 1100 })

  const patch = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }))

  // ---- derived -------------------------------------------------------------
  // Only settings that change the result re-run the pipeline: window size, Labs switches, sync fields and the like must not
  // re-process thousands of icons. Theming is additionally cached per icon (see ThemeCache).
  const processSettings = useMemo(() => settings, [JSON.stringify([SHARED_KEYS.map((k) => settings[k]), settings.ignoredDuplicates])]) // eslint-disable-line react-hooks/exhaustive-deps
  const themeCache = useRef<ThemeCache>(new Map())
  const processed = useMemo(() => processIcons(raws, processSettings, overrides, outlineOverrides, themeCache.current), [raws, processSettings, overrides, outlineOverrides])
  const icons = processed.icons
  const g = processed.grid

  const blockedIcons = useMemo(() => icons.filter(isBlocked), [icons])
  const alertIcons = useMemo(() => icons.filter(isAlert), [icons])
  const categories = useMemo(() => summariseCategories(icons), [icons])

  const groups = useMemo<IssueGroup[]>(() => groupIssues(icons), [icons])
  const actionable = groups.filter((x) => x.severity !== 'info')


  const included = useMemo(() => icons.filter((i) => !off.has(i.key)), [icons, off])
  const exportable = useMemo(() => included.filter((i) => !hasBlockingErrors(i)), [included])
  const blocked = included.length - exportable.length
  const exportCats = useMemo(() => summariseCategories(exportable), [exportable])

  const fmtKeys = Object.keys(settings.formats) as (keyof Settings['formats'])[]
  const enabledFormats = fmtKeys.filter((k) => settings.formats[k])
  const overview = useMemo(
    () => ((exportOpen || showSettings) && exportable.length ? computeOverview(exportable, settings, g, processed.tier) : null),
    // computeOverview builds every format regardless of the format toggles, so toggling a format must not rebuild it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exportOpen, showSettings, exportable, JSON.stringify(SHARED_KEYS.filter((k) => k !== 'formats').map((k) => settings[k])), g, processed.tier]
  )

  // ---- actions -------------------------------------------------------------
  const startScan = () =>
    emit<ScanHandler>('SCAN', { mode: settings.scanMode, scope: settings.scanScope, usageOnly: settings.usageOnly, maxIconSize: settings.maxIconSize, compositeFrames: settings.labs ? settings.compositeFrames : 'ignore', leafName: settings.leafName, leafNameMode: settings.leafNameMode })
  const allFixes = useMemo(() => icons.flatMap((i) => i.fixes), [icons])
  const totalAutoFixes = allFixes.filter((f) => f.actions.length > 0 && f.confidence !== 'low').length
  const fixes = useFixes(allFixes, summary, settings, g)
  resetFixes.current = fixes.reset
  const { actionOf } = fixes
  const locate = (nodeId: string) => emit<LocateHandler>('LOCATE', nodeId)
  const toggle = (set: Set<string>, k: string) => {
    const n = new Set(set)
    if (n.has(k)) n.delete(k)
    else n.add(k)
    return n
  }
  const setIncluded = (keys: string[], v: boolean) =>
    setOff((prev) => {
      const n = new Set(prev)
      for (const k of keys) {
        if (v) n.delete(k)
        else n.add(k)
      }
      return n
    })
  const rename = (i: Icon, value: string) =>
    setOverrides((prev) => {
      const n = { ...prev }
      if (value === '') delete n[i.key]
      else n[i.key] = value
      return n
    })
  const showInList = (next: { status?: Status; rule?: string | null }) => {
    filter({ type: 'show', ...next })
    setTab('icons')
  }

  const baseline = useBaselines(exportable, settings)
  const { release, changes: changeMap, changeCounts } = baseline

  const visible = useMemo(
    () => filterIcons(icons, { status, ruleId: ruleFilter, category: catFilter, change: changeFilter, query }, off, changeMap),
    [icons, query, status, ruleFilter, catFilter, changeFilter, changeMap, off]
  )

  const makeFiles = (forSettings: Settings = settings) => buildFiles({ allIcons: included, settings: forSettings, spriteStrategy: settings.formats.sprite, grid: processed.grid, tier: processed.tier, generatedAt: new Date().toISOString().slice(0, 10), release })

  const onImportConfig = async (file: File) => {
    try {
      const res = parseConfig(await file.text(), settings)
      setSettings(res.settings)
      setConfigMessage(`Applied ${plural(res.applied.length, 'setting')}${res.ignored.length ? `; ignored: ${res.ignored.join(', ')}` : ''}.`)
    } catch {
      setConfigMessage('That file is not a valid toolkit.config.json.')
    }
  }
  const onPublish = () => {
    setConfigMessage('Publishing…')
    emit<PublishConfigHandler>('PUBLISH_CONFIG', serializeShared(settings, new Date().toISOString()))
  }
  const onUseShared = () => {
    if (!sharedCfg) return
    try {
      const res = parseConfig(sharedCfg.config, settings)
      setSettings(res.settings)
      setConfigMessage(`Applied the file's config (${res.applied.length} settings).`)
    } catch {
      setConfigMessage('The config stored in the file could not be read.')
    }
  }
  const sharedInfo = useMemo(() => {
    if (!sharedCfg) return null
    return { at: sharedCfg.at, by: sharedCfg.by, differs: sharedCfg.config.trim() !== exportConfig(settings).trim() }
  }, [sharedCfg, settings])
  const onAttachDevResources = () => {
    const base = settings.devResourceUrl.trim()
    const items = icons
      .filter((i) => (i.sourceKind === 'component' || i.sourceKind === 'component-set') && /^\d+:\d+$/.test(i.nodeId))
      .map((i) => ({ nodeId: i.nodeId, url: `${base}#${i.name}`, name: `${settings.namespace}: ${i.name}` }))
    if (!/^https?:\/\//.test(base)) return setConfigMessage('Enter a link first (http:// or https://), e.g. the icons.json in your repository.')
    if (!items.length) return setConfigMessage('Scan icon components first.')
    setConfigMessage(`Attaching ${items.length} links…`)
    emit<AttachDevResourcesHandler>('ATTACH_DEV_RESOURCES', items)
  }
  const onExportConfig = () => download('toolkit.config.json', exportConfig(settings), 'application/json')

  const prText = (packages: (keyof Settings['formats'])[]) =>
    pullRequestText({
      diff: release.diff,
      version: release.version,
      iconCount: exportable.length,
      formats: TARGETS.filter((t) => packages.includes(t.key)).map((t) => t.label),
      warnings: exportable.filter((i) => i.findings.some((f) => f.severity === 'warn')).length,
      date: new Date().toISOString().slice(0, 10)
    })
  const bulkRename = useBulkRename(icons, visible)
  const descriptions = useDescriptions(icons, cleanNamespace(settings.namespace))
  const publish = usePublish(settings, (o) => makeFiles(settingsFor(settings, o)), () => baseline.snapshotNow('local'), (g) => prText(g.packages))
  const scanVariables = useMemo(() => {
    const seen = new Map<string, { variable: string; collection?: string }>()
    for (const p of raws.flatMap((r) => r.facts.paints)) if (p.variable) seen.set(`${p.collection ?? ''}::${p.variable}`, { variable: p.variable, collection: p.collection })
    return [...seen.values()]
  }, [raws])
  const exampleVariable = useMemo(() => {
    const p = raws.flatMap((r) => r.facts.paints).find((x) => x.variable)
    return p ? { variable: p.variable!, collection: p.collection } : { variable: 'color/neutral/darkest', collection: 'Primitives' }
  }, [raws])

  const doExport = () => {
    notify('Preparing the ZIP…')
    // let the toast paint first: generating and zipping thousands of files blocks this thread for a moment
    setTimeout(runExport, 30)
  }
  const runExport = () => {
    try {
      const files = makeFiles()
      const name = `${settings.zipName.trim() ? cleanNamespace(settings.zipName) : `${cleanNamespace(settings.namespace)}-icons`}.zip`
      download(name, zipFiles(files), 'application/zip')
      baseline.snapshotNow('local')
      notify(`Exported ${exportable.length} icons (${Object.keys(files).length} files)`)
    } catch (e) {
      notify(`Export failed: ${e instanceof Error ? e.message : String(e)}`, true)
    }
  }
  const doFixesReport = () => download('FIXES-DRY-RUN.md', fixesReportMarkdown(allFixes, new Date().toISOString().slice(0, 10)), 'text/markdown')
  const [reportOpen, setReportOpen] = useState(false)
  const healthReport = useMemo(
    () =>
      reportOpen
        ? buildHealth({ title: cleanNamespace(settings.namespace), generatedAt: new Date().toISOString().slice(0, 10), icons, tier: processed.tier, grid: processed.grid, profile: settings.profile, diff: release.diff, baseline: baseline.source ? BASELINE_LABEL[baseline.source] : null, skipped: summary?.skipped.length ?? 0 })
        : null,
    [reportOpen, icons, processed.tier, processed.grid, settings.profile, settings.namespace, release.diff, baseline.source, summary]
  )
  const doReport = () => download('FIX-PLAN.md', fixPlanMarkdown(icons, new Date().toISOString().slice(0, 10)), 'text/markdown')

  // ---- render --------------------------------------------------------------
  const hasResults = icons.length > 0
  const noSelection = selection.count === 0
  const scope = settings.scanScope
  const canScan = !scanning && !(scope === 'selection' && noSelection)
  const scopeWord = scope === 'selection' ? 'selection' : scope === 'page' ? 'page' : 'document'
  const scanLabel = hasResults || summary ? 'Scan again' : `Scan ${scopeWord}`
  const interactive = hasResults && !scanning
  // one line, one fact: what is selected before a scan; when and how healthy after it (counts live on the tabs and chips)
  const firstRunStatus =
    scope === 'selection'
      ? noSelection
        ? 'Nothing selected'
        : `${plural(selection.count, 'layer')} selected`
      : scope === 'page'
        ? 'This page'
        : 'All pages in this file'
  const tierLabel = `${processed.tier} ${TIER_LABEL[processed.tier]}`
  const health = processed.tier === 'T5' || processed.tier === 'T4' ? 'good' : processed.tier === 'T3' ? 'fair' : 'needs work'
  const skippedCount = summary?.skipped.length ?? 0
  const errorGroups = actionable.filter((x) => x.severity === 'error').length
  const warnGroups = actionable.length - errorGroups
  const issueSummary = !actionable.length
    ? ''
    : [errorGroups ? `${plural(errorGroups, 'error')} block the export` : '', warnGroups ? plural(warnGroups, 'warning') : ''].filter(Boolean).join(' · ') + (totalAutoFixes ? '' : '. None can be fixed automatically.')

  const hidePreview = (now = false) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (hoverHide.current) clearTimeout(hoverHide.current)
    if (now) setHover(null)
    else hoverHide.current = setTimeout(() => setHover(null), 120)
  }
  const showPreview = (icon: Icon, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (hoverHide.current) clearTimeout(hoverHide.current)
    hoverTimer.current = setTimeout(() => setHover({ icon, rect: el.getBoundingClientRect() }), 300)
  }

  const rowProps = (i: Icon) => ({
    icon: i,
    size: previewSize,
    bg: previewBg,
    onPreview: showPreview,
    onPreviewEnd: () => hidePreview(),
    included: !off.has(i.key),
    expanded: open.has(i.key),
    onInclude: (v: boolean) => setIncluded([i.key], v),
    onExpand: () => setOpen((p) => toggle(p, i.key)),
    onRename: (v: string) => rename(i, v),
    onLocate: () => locate(i.nodeId),
    onOutline: (v: boolean) => setOutlineOverrides((p) => ({ ...p, [i.key]: v }))
  })

  const renderRows = (list: Icon[]) => list.map((i) => <Row key={i.key} {...rowProps(i)} />)

  const renderGrouped = (list: Icon[]) => {
    const by = new Map<string, Icon[]>()
    for (const i of list) {
      const id = i.category.join('/')
      by.set(id, [...(by.get(id) ?? []), i])
    }
    const keys = [...by.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : (by.get(a)![0].categoryLabel).localeCompare(by.get(b)![0].categoryLabel)))
    return keys.map((k) => {
      const items = by.get(k)!
      const all = items.every((i) => !off.has(i.key))
      return (
        <div key={k || '(none)'}>
          <div class={styles.groupHead}>
            <Checkbox value={all} onValueChange={(v) => setIncluded(items.map((i) => i.key), v)}>
              {k ? items[0].categoryLabel : 'Uncategorised'}
            </Checkbox>
            <span class={styles.muted}>{items.length}</span>
          </div>
          {items.slice(0, limit).map((i) => (
            <Row key={i.key} {...rowProps(i)} />
          ))}
        </div>
      )
    })
  }

  /** immediate "fix all": pre-selects the (non-low-confidence) fixes and opens the confirmation; Labs must be on */
  const fixAll = (list: FixCandidate[]) => {
    if (!settings.labs || !settings.labsBranchAck) {
      setShowSettings(true)
      return
    }
    fixes.review(list)
  }

  const renderFix = (f: FixCandidate) => (
    <FixCard
      key={f.id}
      fix={f}
      selected={fixes.isSelected(f.id)}
      action={actionOf(f)}
      result={fixes.results[f.id]}
      onSelect={(v) => fixes.select(f.id, v)}
      onAction={(a) => fixes.setAction(f.id, a)}
      onLocate={() => locate(f.nodeId)}
      onIgnore={f.groupId ? () => patch({ ignoredDuplicates: [...settings.ignoredDuplicates, f.groupId!] }) : undefined}
    />
  )

  return (
    <div class={styles.root}>
      {/* announced by screen readers: scan progress, results and the status lines that otherwise only change on screen */}
      <div class={styles.srOnly} role="status" aria-live="polite">
        {scanning ? phase || 'Scanning' : summary ? `Scan finished: ${plural(icons.length, 'icon')} found` : ''} {configMessage} {baseline.message} {Object.values(publish.testMessages).join(' ')}
      </div>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <Segmented<ScanScope>
            label="Scan scope"
            value={scope}
            onValueChange={(v) => patch({ scanScope: v })}
            disabled={scanning}
            options={[
              { value: 'selection', children: 'Selection', title: 'Only the layers you have selected' },
              { value: 'page', children: 'Page', title: 'Everything on the current page' },
              { value: 'document', children: 'Document', title: 'Every page in this file (can take a while)' }
            ]}
          />
          {scanning ? (
            <Button danger onClick={() => emit<CancelScanHandler>('CANCEL_SCAN')}>Cancel scan</Button>
          ) : (
            <Button onClick={startScan} disabled={!canScan} secondary={hasResults || !!summary} data-hint={canScan ? '' : 'Select layers in Figma, or choose Page or Document'}>
              {scanLabel}
            </Button>
          )}
          <button class={styles.iconBtn} onClick={() => { setSettingsTab('packages'); setShowSettings(true) }} aria-label="Open settings" data-hint="Settings"><CogIcon /></button>
        </div>
        {/* fixed height: progress or a long message is drawn inside this row, so nothing below it ever moves */}
        {scanning ? (
          <div class={cx(styles.statusRow, styles.statusProgress)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span class={cx(styles.statusDot, styles.statusBusy)} />
              <span class={styles.statusText}>{phase || 'Reading…'}</span>
            </div>
            <div class={styles.progress}><div class={styles.progressBar} style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          </div>
        ) : scanError ? (
          <div class={styles.statusRow} role="alert">
            <span class={cx(styles.statusDot, styles.statusErr)} />
            <span class={cx(styles.statusText, styles.sevError)} title={scanError}>{scanError}</span>
          </div>
        ) : hasResults || summary ? (
          <div class={styles.statusRow} data-hint={`Library structure ${tierLabel} · most common icon size ${g.width}×${g.height}`}>
            <span class={cx(styles.statusDot, actionable.some((x) => x.severity === 'error') ? styles.statusErr : actionable.length ? styles.statusWarn : styles.statusOk)} />
            <span class={styles.statusText}>{hasResults ? `Scanned ${scannedAt} · Library health ${health}` : `Scanned ${scannedAt}`}{settings.usageOnly ? ' · icons in use only' : ''}</span>
          </div>
        ) : (
          <div class={styles.statusRow}>
            <span class={styles.statusDot} />
            <span class={styles.statusText}>{firstRunStatus}</span>
          </div>
        )}
      </div>

      <TabBar<Tab>
        label="Results"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'icons', label: 'Icons', badge: icons.length },
          { id: 'issues', label: 'Issues', badge: summary || hasResults ? actionable.length : '–', tone: actionable.some((x) => x.severity === 'error') ? 'error' : actionable.length ? 'warn' : undefined },
          { id: 'skipped', label: 'Skipped', badge: summary ? skippedCount : '–' }
        ]}
      />

      {/* ---------------- Icons ---------------- */}
      {tab === 'icons' && (
        <TabPanel id="icons"><IconsPanel
          icons={icons}
          visible={visible}
          limit={limit}
          pageSize={PAGE_SIZE}
          hasResults={hasResults}
          interactive={interactive}
          scanning={scanning}
          summary={summary}
          scope={scope}
          query={query}
          view={view}
          previewSize={previewSize}
          previewBg={previewBg}
          categories={categories}
          catFilter={catFilter}
          status={status}
          ruleFilter={ruleFilter}
          changeFilter={changeFilter}
          changeCounts={changeCounts}
          showChanges={!!release.diff}
          baselineSource={baseline.source}
          blockedCount={blockedIcons.length}
          alertCount={alertIcons.length}
          off={off}
          onQuery={(value) => filter({ type: 'query', value })}
          onView={setView}
          onPreviewSize={setPreviewSize}
          onCategory={(value) => filter({ type: 'category', value })}
          onShow={showInList}
          onClearRule={() => filter({ type: 'clearRule' })}
          onChangeFilter={(value) => filter({ type: 'change', value })}
          onLimit={(value) => filter({ type: 'limit', value })}
          onSelectAll={(v) => setOff(v ? new Set() : new Set(icons.map((i) => i.key)))}
          onInclude={(key, v) => setIncluded([key], v)}
          onLocate={locate}
          onExpand={(i) => { setView('list'); setOpen((p) => new Set(p).add(i.key)); filter({ type: 'query', value: i.name }) }}
          onScroll={() => hidePreview(true)}
          renderRows={renderRows}
          renderGrouped={renderGrouped}
        /></TabPanel>
      )}

      {/* ---------------- Issues ---------------- */}
      {tab === 'issues' && (
        <TabPanel id="issues"><IssuesPanel
          summary={issueSummary}
          scanSummary={summary}
          iconCount={icons.length}
          groups={groups}
          actionable={actionable}
          allFixes={allFixes}
          autoFixCount={totalAutoFixes}
          fixes={fixes}
          settings={settings}
          scanning={scanning}
          cursor={cursor}
          showNotes={showNotes}
          renderFix={renderFix}
          onReport={() => setReportOpen(true)}
          onFixesReport={doFixesReport}
          onFix={fixAll}
          onShowRule={(rule) => showInList({ rule })}
          onLocateRule={(x) => {
            const idx = (cursor[x.ruleId] ?? 0) % x.icons.length
            locate(x.icons[idx].nodeId)
            setCursor((c) => ({ ...c, [x.ruleId]: idx + 1 }))
          }}
          onToggleNotes={() => setShowNotes(!showNotes)}
          onOpenSettings={() => setShowSettings(true)}
          onDescriptions={descriptions.show}
          onRename={bulkRename.show}
        /></TabPanel>
      )}

      {/* ---------------- Skipped ---------------- */}
      {tab === 'skipped' && <TabPanel id="skipped"><SkippedPanel summary={summary} onLocate={locate} /></TabPanel>}

      {/* ---------------- Footer: the single primary action ---------------- */}
      <div class={styles.footer}>
        <div class={styles.footerNote}>
          {interactive && blocked > 0 && (
            <button class={cx(styles.linkBtn, styles.sevError)} onClick={() => showInList({ status: 'blocked' })}>{blocked} blocked, will be skipped</button>
          )}
          {interactive && (
            <button class={styles.linkBtn} onClick={() => { setSettingsTab('packages'); setShowSettings(true) }} data-hint="Choose what to export">{plural(enabledFormats.length, 'format')} ▾</button>
          )}
        </div>
        <Button onClick={() => setExportOpen(true)} disabled={!interactive || exportable.length === 0} data-hint={interactive ? '' : scanning ? 'Available when the scan finishes' : 'Scan first'}>
          {off.size > 0 && exportable.length ? `Export ${exportable.length} selected` : 'Export'}
        </Button>
      </div>
      {hover && (
        <IconPreview icon={hover.icon} anchor={hover.rect} bg={previewBg} onBg={setPreviewBg} onEnter={() => { if (hoverHide.current) clearTimeout(hoverHide.current) }} onLeave={() => hidePreview()} />
      )}
      {exportOpen && (
        <ExportPanel
          settings={settings}
          patch={patch}
          ready={exportable.length}
          blocked={blocked}
          excluded={off.size}
          categories={exportCats}
          rows={overview}
          hasStrokeIcons={exportable.some((i) => i.hasStroke)}
          release={release}
          prevCatalog={baseline.previous}
          prevError={baseline.loadError}
          onLoadPrevious={baseline.loadFile}
          onClearPrevious={() => baseline.pick('none')}
          baseline={{
            source: baseline.source,
            options: (['repo', 'shared', 'local', 'file'] as BaselineSource[]).filter((k) => baseline.catalogs[k]).map((k) => ({ value: k, text: `${BASELINE_LABEL[k]} · ${baseline.meta(k)}` })),
            message: baseline.message,
            canRepo: settings.outputs.some((o) => outputReady(o, settings.tokens)),
            canShare: settings.labs,
            onPick: baseline.pick,
            onLoadRepo: baseline.loadRepo,
            onSaveShared: baseline.saveShared
          }}
          onDownload={doExport}
          onPublish={publish.configured ? publish.start : null}
          publishLabel={(() => { const n = groupOutputs(settings.outputs, settings.formats).length; return n > 1 ? `Publish to ${n} repositories…` : 'Publish to repository…' })()}
          onSetupPublish={() => { setExportOpen(false); setSettingsTab('output'); setShowSettings(true) }}
          onShowBlocked={() => { setExportOpen(false); showInList({ status: 'blocked' }) }}
          onClose={() => setExportOpen(false)}
        />
      )}
      {fixes.confirmOpen && (
        <ConfirmApply
          items={fixes.selected.map((f) => ({ fix: f, action: actionOf(f) }))}
          renameLeaves={fixes.renameLeaves}
          leafName={settings.leafName}
          onRenameLeaves={fixes.setRenameLeaves}
          onCancel={fixes.closeConfirm}
          onApply={fixes.apply}
          applying={fixes.applying}
        />
      )}

      {bulkRename.open && (
        <BulkRenameDialog r={bulkRename} labsReady={settings.labs && settings.labsBranchAck} labsOn={settings.labs} onOpenSettings={() => setShowSettings(true)} />
      )}

      {reportOpen && healthReport && (
        <ReportDialog
          report={healthReport}
          onClose={() => setReportOpen(false)}
          onHtml={() => download(`${cleanNamespace(settings.namespace)}-health-report.html`, healthHtml(healthReport), 'text/html')}
          onMarkdown={() => download(`${cleanNamespace(settings.namespace)}-health-report.md`, healthMarkdown(healthReport), 'text/markdown')}
          onFixPlan={doReport}
        />
      )}

      {descriptions.open && (
        <DescriptionsDialog d={descriptions} labsReady={settings.labs && settings.labsBranchAck} labsOn={settings.labs} onOpenSettings={() => setShowSettings(true)} />
      )}

      {publish.open && (
        <PublishDialog
          views={publish.views}
          planning={publish.planning}
          publishing={publish.publishing}
          description={(g) => prText(g.packages)}
          onOpen={publish.openLink}
          onCopy={(text) => notify(copyText(text) ? 'Description copied' : 'Copy is blocked here; open the details and copy it', false)}
          onCancel={publish.close}
          onSend={publish.send}
        />
      )}
      {showSettings && (
        <SettingsPanel
          initialTab={settingsTab}
          settings={settings}
          patch={patch}
          onClose={() => setShowSettings(false)}
          extras={{ overview, onCopyDiagnostics: () => emit<RequestDiagnosticsHandler>('REQUEST_DIAGNOSTICS'), exampleVariable, scanVariables, onAttachDevResources, scannedComponents: icons.filter((i) => i.sourceKind === 'component' || i.sourceKind === 'component-set').length, onExportConfig, onImportConfig, configMessage, shared: sharedInfo, onPublish, onUseShared, testMessages: publish.testMessages, onTestRepo: publish.test, outputProblems: publish.problems }}
        />
      )}
      <div class={styles.grip} />
    </div>
  )
}

function Root(props: { inspect?: boolean }) {
  return props.inspect ? <InspectPanel /> : <Plugin />
}

export default render(Root)
