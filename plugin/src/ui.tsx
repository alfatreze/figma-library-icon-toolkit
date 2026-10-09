import { Button, Checkbox, render, SearchTextbox, SegmentedControl, Textbox, Dropdown } from '@create-figma-plugin/ui'
import { emit, on } from '@create-figma-plugin/utilities'
import { ComponentChildren, h } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { summariseCategories } from './core/categories'
import { buildFiles } from './core/generators'
import { fixesReportMarkdown, fixPlanMarkdown } from './core/generators/manifest'
import { BASELINE_LABEL, BaselineSource, catalogToSnapshot, changesByName, CHANGE_KINDS, CHANGE_LABEL, ChangeKind, decodeSnapshot, encodeSnapshot, makeSnapshot, pickBaseline, Snapshot, snapshotToCatalog } from './core/baseline'
import { bumpVersion, diffCatalogs, nextDeprecated, parseCatalog, PreviousCatalog } from './core/changelog'
import { exportConfig, parseConfig, serializeShared } from './core/config'
import { TIER_LABEL } from './core/library'
import { cleanNamespace } from './core/naming'
import { describeUsage, FORMAT_LABEL } from './core/overrides'
import { hasBlockingErrors, processIcons } from './core/process'
import { ruleInfo, STEPS } from './core/rules'
import { zipFiles } from './core/zip'
import styles from './styles.css'
import { ConfirmApply, FixCard } from './ui/Fixes'
import { ExportPanel } from './ui/ExportPanel'
import { InfoTip } from './ui/InfoTip'
import {
  BlockIcon, CheckIcon, ChevronIcon, CogIcon, GridIcon, GroupedIcon, InfoIcon, ListIcon, LocateIcon, NextIcon, WarnIcon
} from './ui/icons'
import { computeOverview, kb } from './ui/overview'
import { useResizeHandles } from './ui/resize'
import { SettingsPanel } from './ui/Settings'
import { SyncDialog, SyncPlan, SyncResult } from './ui/SyncDialog'
import {
  ApplyFixRequest, ApplyFixesHandler, ConfigPublishedHandler, PublishConfigHandler, SharedConfigHandler, FixActionId, FixCandidate, FixesAppliedHandler, FixResult, FixResultHandler,
  CancelScanHandler, DEFAULT_SETTINGS, Finding, FormatId, Icon, LocateHandler, NotifyHandler, RawIcon, ResizeHandler,
  SaveSettingsHandler, SaveBaselineHandler, BaselinesHandler, BaselineSavedHandler, ScanBatchHandler, ScanDoneHandler, ScanErrorHandler, ScanHandler, ScanPhaseHandler, ScanScope,
  ScanStartHandler, ScanSummary, SelectionHandler, Settings, SettingsLoadedHandler, Severity, UiReadyHandler
} from './types'

const PAGE_SIZE = 200
type Tab = 'icons' | 'issues' | 'skipped'
type Status = 'all' | 'blocked' | 'alerts' | 'excluded'
type View = 'list' | 'grouped' | 'grid'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

function download(name: string, data: Uint8Array | string, mime: string) {
  const blob = new Blob([data as BlobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const notify = (message: string, error = false) => emit<NotifyHandler>('NOTIFY', message, error)
const worst = (fs: Finding[]): Severity | null =>
  fs.some((f) => f.severity === 'error') ? 'error' : fs.some((f) => f.severity === 'warn') ? 'warn' : fs.length ? 'info' : null
const SevIcon = ({ s }: { s: Severity }) => (s === 'error' ? <BlockIcon /> : s === 'warn' ? <WarnIcon /> : <InfoIcon />)
const sevClass = (s: Severity) => (s === 'error' ? styles.sevError : s === 'warn' ? styles.sevWarn : styles.sevInfo)
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(x|s|ch|sh)$/.test(w) ? w + 'es' : w + 's'}`

interface IssueGroup {
  ruleId: string
  severity: Severity
  icons: Icon[]
  formats: FormatId[]
}

const SCOPE_INFO = (
  <span>
    Where the scan looks.
    <ul class={styles.tipList}>
      <li><strong>Selection</strong>: only the layers you have selected (frames, sections, components…).</li>
      <li><strong>Page</strong>: everything on the current page.</li>
      <li><strong>Document</strong>: every page in the file. It loads all pages first, so large files take a while; you can cancel.</li>
    </ul>
    Nothing is changed in your file in any case.
  </span>
)

const USAGE_INFO = (
  <span>
    Finds the icons that are actually <em>placed</em> as instances in your designs, including components from a linked library, instead of every icon that exists. Each icon is listed once with how often it is used, which sizes are used, and which overrides (colour, stroke weight, size…) designers applied.
    <br /><br />
    Use it on an app/product file to export just the subset of the library that is in use. Where an override can’t be reproduced by an export format, you get an alert. The artwork is exported from the library’s main component when readable, otherwise from an instance.
  </span>
)

function Plugin() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [raws, setRaws] = useState<RawIcon[]>([])
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [selection, setSelection] = useState<{ count: number; names: string[] }>({ count: 0, names: [] })
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [off, setOff] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<Tab>('icons')
  const [status, setStatus] = useState<Status>('all')
  const [ruleFilter, setRuleFilter] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState('')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>('list')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [cursor, setCursor] = useState<Record<string, number>>({})
  const [showNotes, setShowNotes] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [outlineOverrides, setOutlineOverrides] = useState<Record<string, boolean>>({})
  const [fileCatalog, setFileCatalog] = useState<PreviousCatalog | null>(null)
  const [repoCatalog, setRepoCatalog] = useState<PreviousCatalog | null>(null)
  const [localSnap, setLocalSnap] = useState<Snapshot | null>(null)
  const [sharedSnap, setSharedSnap] = useState<Snapshot | null>(null)
  const [baselineChoice, setBaselineChoice] = useState<BaselineSource | 'none' | null>(null) // null = most authoritative available
  const [baselineMsg, setBaselineMsg] = useState('')
  const [changeFilter, setChangeFilter] = useState<ChangeKind | null>(null)
  const [prevError, setPrevError] = useState('')
  const [diffOpen, setDiffOpen] = useState<string | null>(null)
  const [configMessage, setConfigMessage] = useState('')
  const [sharedCfg, setSharedCfg] = useState<{ at: string; by: string | null; config: string } | null>(null)
  const [syncStatus, setSyncStatus] = useState('')
  const [syncPlan, setSyncPlan] = useState<SyncPlan | null>(null)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [fixGroupOpen, setFixGroupOpen] = useState<Set<string>>(new Set())
  const [fixSel, setFixSel] = useState<Set<string>>(new Set())
  const [fixAction, setFixAction] = useState<Record<string, FixActionId>>({})
  const [fixResults, setFixResults] = useState<Record<string, FixResult>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [renameLeaves, setRenameLeaves] = useState(true)
  const defaultsFor = useRef<ScanSummary | null>(null)

  useEffect(() => {
    const offs = [
      on<SettingsLoadedHandler>('SETTINGS_LOADED', (s) => {
        setSettings(s)
        setLoaded(true)
      }),
      on<BaselinesHandler>('BASELINES', (local, shared) => {
        setLocalSnap(decodeSnapshot(local))
        setSharedSnap(decodeSnapshot(shared))
      }),
      on<BaselineSavedHandler>('BASELINE_SAVED', (target, ok, message) => {
        if (target === 'shared' || !ok) setBaselineMsg(message)
      }),
      on<SharedConfigHandler>('SHARED_CONFIG', (at, by, config) => setSharedCfg(at && config ? { at, by, config } : null)),
      on<ConfigPublishedHandler>('CONFIG_PUBLISHED', (ok, message) => setConfigMessage(message + (ok ? '.' : ''))),
      on<SelectionHandler>('SELECTION', (count, names) => setSelection({ count, names })),
      on<ScanStartHandler>('SCAN_START', () => {
        setScanning(true)
        setProgress(0)
        setPhase('Starting…')
        setScanError(null)
        setRaws([])
        setSummary(null)
        setOff(new Set())
        setOpen(new Set())
        setCursor({})
        setFixSel(new Set())
        setFixResults({})
        setFixAction({})
        setFixGroupOpen(new Set())
        setRuleFilter(null)
        setCatFilter('')
        setStatus('all')
        setChangeFilter(null)
        setLimit(PAGE_SIZE)
      }),
      on<ScanPhaseHandler>('SCAN_PHASE', (t) => setPhase(t)),
      on<FixResultHandler>('FIX_RESULT', (r) => setFixResults((prev) => ({ ...prev, [r.id]: r }))),
      on<FixesAppliedHandler>('FIXES_APPLIED', (ok, failed) => {
        setApplying(false)
        setConfirmOpen(false)
        setFixSel(new Set())
        notify(failed ? `${ok} fixed, ${failed} failed` : `${ok} fix${ok === 1 ? '' : 'es'} applied. Cmd/Ctrl+Z undoes them.`, failed > 0)
      }),
      on<ScanBatchHandler>('SCAN_BATCH', (icons, p) => {
        setRaws((prev) => prev.concat(icons))
        setProgress(p)
      }),
      on<ScanDoneHandler>('SCAN_DONE', (s) => {
        setSummary(s)
        setScanning(false)
        setProgress(1)
        setPhase('')
      }),
      on<ScanErrorHandler>('SCAN_ERROR', (m) => {
        setScanError(m)
        setScanning(false)
        setPhase('')
      })
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
  const processed = useMemo(() => processIcons(raws, settings, overrides, outlineOverrides), [raws, settings, overrides, outlineOverrides])
  const icons = processed.icons
  const g = processed.grid

  const blockedIcons = useMemo(() => icons.filter((i) => i.findings.some((f) => f.severity === 'error')), [icons])
  const alertIcons = useMemo(
    () => icons.filter((i) => !i.findings.some((f) => f.severity === 'error') && i.findings.some((f) => f.severity === 'warn')),
    [icons]
  )
  const categories = useMemo(() => summariseCategories(icons), [icons])

  const groups = useMemo<IssueGroup[]>(() => {
    const map = new Map<string, IssueGroup>()
    for (const icon of icons) {
      for (const f of icon.findings) {
        let e = map.get(f.ruleId)
        if (!e) {
          e = { ruleId: f.ruleId, severity: f.severity, icons: [icon], formats: [] }
          map.set(f.ruleId, e)
        } else {
          if (!e.icons.includes(icon)) e.icons.push(icon)
          if (f.severity === 'error') e.severity = 'error'
          else if (f.severity === 'warn' && e.severity === 'info') e.severity = 'warn'
        }
        for (const fm of f.formats ?? []) if (!e.formats.includes(fm)) e.formats.push(fm)
      }
    }
    const order: Record<Severity, number> = { error: 0, warn: 1, info: 2 }
    return [...map.values()].sort((a, b) => order[a.severity] - order[b.severity] || b.icons.length - a.icons.length)
  }, [icons])
  const actionable = groups.filter((x) => x.severity !== 'info')


  const included = useMemo(() => icons.filter((i) => !off.has(i.key)), [icons, off])
  const exportable = useMemo(() => included.filter((i) => !hasBlockingErrors(i)), [included])
  const blocked = included.length - exportable.length
  const exportCats = useMemo(() => summariseCategories(exportable), [exportable])

  const fmtKeys = Object.keys(settings.formats) as (keyof Settings['formats'])[]
  const enabledFormats = fmtKeys.filter((k) => settings.formats[k])
  const overview = useMemo(
    () => (exportOpen && exportable.length ? computeOverview(exportable, settings, g, processed.tier) : null),
    [exportOpen, exportable, settings, g, processed.tier]
  )

  // ---- actions -------------------------------------------------------------
  const startScan = () =>
    emit<ScanHandler>('SCAN', { mode: settings.scanMode, scope: settings.scanScope, usageOnly: settings.usageOnly, maxIconSize: settings.maxIconSize, compositeFrames: settings.labs ? settings.compositeFrames : 'ignore', leafName: settings.leafName, leafNameMode: settings.leafNameMode })
  const allFixes = useMemo(() => icons.flatMap((i) => i.fixes), [icons])
  const actionOf = (f: FixCandidate): FixActionId => fixAction[f.id] ?? f.actions[0]
  const selectedFixes = allFixes.filter((f) => fixSel.has(f.id) && f.actions.length && !fixResults[f.id]?.ok)
  const fixesForRule = (ruleId: string, list: Icon[]) => {
    const kinds = ruleId === 'not-component' ? ['convert-frame'] : [ruleId]
    return list.flatMap((i) => i.fixes).filter((f) => kinds.includes(f.kind))
  }
  // sensible default: pre-select the safe, high-confidence fixes once per scan
  useEffect(() => {
    if (!summary || defaultsFor.current === summary) return
    defaultsFor.current = summary
    setFixSel(new Set(allFixes.filter((f) => f.actions.length && f.confidence === 'high' && ['detached-identical', 'detached-match', 'layer-names', 'convert-frame'].includes(f.kind)).map((f) => f.id)))
  }, [summary, allFixes])
  const applySelected = () => {
    setApplying(true)
    const grid = { w: g.width || settings.libWidth, h: g.height || settings.libHeight }
    const reqs: ApplyFixRequest[] = selectedFixes.map((f) => ({
      id: f.id, action: actionOf(f), gridWidth: grid.w, gridHeight: grid.h, leafName: settings.leafName, renameLeaves
    }))
    emit<ApplyFixesHandler>('APPLY_FIXES', reqs)
  }
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
    setStatus(next.status ?? 'all')
    setRuleFilter(next.rule ?? null)
    setLimit(PAGE_SIZE)
    setTab('icons')
  }

  const baselines = useMemo<Record<BaselineSource, PreviousCatalog | null>>(
    () => ({ repo: repoCatalog, shared: sharedSnap ? snapshotToCatalog(sharedSnap) : null, local: localSnap ? snapshotToCatalog(localSnap) : null, file: fileCatalog }),
    [repoCatalog, sharedSnap, localSnap, fileCatalog]
  )
  const baselineSource: BaselineSource | null = baselineChoice === 'none' ? null : baselineChoice && baselines[baselineChoice] ? baselineChoice : pickBaseline({ repo: repoCatalog && catalogToSnapshot(repoCatalog), shared: sharedSnap, local: localSnap, file: fileCatalog && catalogToSnapshot(fileCatalog) })
  const prevCatalog = baselineSource ? baselines[baselineSource] : null
  const baselineMeta = (src: BaselineSource) => {
    const sn = src === 'local' ? localSnap : src === 'shared' ? sharedSnap : null
    const c = baselines[src]
    return [c ? `${c.icons.length} icons` : '', c?.libraryVersion ? `v${c.libraryVersion}` : '', sn?.at ? sn.at.slice(0, 10) : ''].filter(Boolean).join(' · ')
  }

  const release = useMemo(() => {
    const catalog = exportable.map((i) => ({ name: i.name, hash: i.hash, colorHash: i.colorHash, category: i.category, figma: { componentKey: i.componentKey, layerName: i.layerName } }))
    const diff = prevCatalog ? diffCatalogs(prevCatalog, catalog) : null
    const version = prevCatalog ? bumpVersion(prevCatalog.libraryVersion, diff!.bump) : '1.0.0'
    const deprecated = nextDeprecated(prevCatalog, diff, version, new Set(catalog.map((c) => c.name)))
    return { version, deprecated, diff }
  }, [exportable, prevCatalog])

  const changeMap = useMemo(() => changesByName(release.diff), [release.diff])
  const changeCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const set of changeMap.values()) for (const k of set) c[k] = (c[k] ?? 0) + 1
    return c
  }, [changeMap])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return icons.filter((i) => {
      if (status === 'blocked' && !blockedIcons.includes(i)) return false
      if (status === 'alerts' && !alertIcons.includes(i)) return false
      if (status === 'excluded' && !off.has(i.key)) return false
      if (ruleFilter && !i.findings.some((f) => f.ruleId === ruleFilter)) return false
      if (catFilter && i.category.join('/') !== catFilter) return false
      if (changeFilter && !changeMap.get(i.name)?.has(changeFilter)) return false
      if (!q) return true
      return (i.name + ' ' + i.layerName + ' ' + i.categoryLabel + ' ' + i.tags.join(' ')).toLowerCase().includes(q)
    })
  }, [icons, query, status, ruleFilter, catFilter, changeFilter, changeMap, off, blockedIcons, alertIcons])

  /** local snapshot is automatic and never touches the file; the shared one is an explicit Labs action */
  const snapshotNow = (target: 'local' | 'shared') => {
    const catalog = exportable.map((i) => ({ name: i.name, hash: i.hash, colorHash: i.colorHash, category: i.category, figma: { componentKey: i.componentKey ?? null, layerName: i.layerName } }))
    const snap = makeSnapshot(catalog, { at: new Date().toISOString(), version: release.version, namespace: settings.namespace })
    emit<SaveBaselineHandler>('SAVE_BASELINE', encodeSnapshot(snap), target)
  }
  const saveSharedBaseline = () => {
    setBaselineMsg('Saving…')
    snapshotNow('shared')
  }
  const loadRepoBaseline = async () => {
    try {
      const out = await syncFetch(`/catalog?subdir=${encodeURIComponent(settings.sync.subdir)}`)
      if (!out.found) {
        setBaselineMsg(`No icons.json in “${settings.sync.subdir}” of the project folder yet.`)
        return
      }
      setRepoCatalog(parseCatalog(out.catalog))
      setBaselineChoice('repo')
      setBaselineMsg('')
    } catch (e) {
      setBaselineMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const makeFiles = () => buildFiles({ allIcons: included, settings, grid: processed.grid, tier: processed.tier, generatedAt: new Date().toISOString().slice(0, 10), release })

  const loadPrevious = async (file: File) => {
    try {
      setFileCatalog(parseCatalog(await file.text()))
      setBaselineChoice('file')
      setPrevError('')
    } catch (e) {
      setFileCatalog(null)
      setPrevError(e instanceof Error ? e.message : 'Could not read the file')
    }
  }
  const onImportConfig = async (file: File) => {
    try {
      const res = parseConfig(await file.text(), settings)
      setSettings(res.settings)
      setConfigMessage(`Applied ${res.applied.length} setting${res.applied.length === 1 ? '' : 's'}${res.ignored.length ? `; ignored: ${res.ignored.join(', ')}` : ''}.`)
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
  const onExportConfig = () => download('toolkit.config.json', exportConfig(settings), 'application/json')

  // ---- project sync (Labs; local companion) ----
  const syncFetch = async (path: string, body?: unknown) => {
    const url = settings.sync.url.replace(/\/$/, '') + path
    let res: Response
    try {
      res = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'x-toolkit-token': settings.sync.token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    } catch {
      throw new Error(`Cannot reach the companion at ${settings.sync.url}. Is it running (node tools/icon-sync.mjs --dir …)? The plugin must be loaded from this build's manifest so localhost is allowed.`)
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || `Companion error ${res.status}`)
    return json
  }
  const onTestSync = async () => {
    try {
      const st = await syncFetch('/status')
      setSyncStatus(`Connected: ${st.dir}${st.git?.repo ? ` · git ${st.git.branch}` : st.allowGit ? ' · not a git repo' : ' · git off'}`)
    } catch (e) {
      setSyncStatus(e instanceof Error ? e.message : String(e))
    }
  }
  const startSync = async () => {
    setSyncError(null)
    setSyncResult(null)
    try {
      const files = makeFiles()
      const plan = await syncFetch('/export', { files, subdir: settings.sync.subdir, dryRun: true })
      setSyncPlan({ added: plan.added, changed: plan.changed, removed: plan.removed, unchanged: plan.unchanged })
    } catch (e) {
      setSyncPlan({ added: [], changed: [], removed: [], unchanged: 0 })
      setSyncError(e instanceof Error ? e.message : String(e))
    }
  }
  const sendSync = async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      const out = await syncFetch('/export', { files: makeFiles(), subdir: settings.sync.subdir, dryRun: false, commit: settings.sync.commit, message: settings.sync.message, branch: settings.sync.branch || undefined })
      setSyncResult({ committed: out.committed })
      snapshotNow('local')
      notify('Written to your project folder')
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(false)
    }
  }
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
    try {
      const files = makeFiles()
      const name = `${settings.zipName.trim() ? cleanNamespace(settings.zipName) : `${cleanNamespace(settings.namespace)}-icons`}.zip`
      download(name, zipFiles(files), 'application/zip')
      snapshotNow('local')
      notify(`Exported ${exportable.length} icons (${Object.keys(files).length} files)`)
    } catch (e) {
      notify(`Export failed: ${e instanceof Error ? e.message : String(e)}`, true)
    }
  }
  const doFixesReport = () => download('FIXES-DRY-RUN.md', fixesReportMarkdown(allFixes, new Date().toISOString().slice(0, 10)), 'text/markdown')
  const doReport = () => download('FIX-PLAN.md', fixPlanMarkdown(icons, new Date().toISOString().slice(0, 10)), 'text/markdown')

  // ---- render --------------------------------------------------------------
  const hasResults = icons.length > 0
  const noSelection = selection.count === 0
  const scope = settings.scanScope
  const canScan = !scanning && !(scope === 'selection' && noSelection)
  const scopeWord = scope === 'selection' ? 'selection' : scope === 'page' ? 'page' : 'document'
  const scanLabel = `${hasResults || summary ? 'Rescan' : 'Scan'} ${scopeWord}${settings.usageOnly ? ' (icons in use)' : ''}`
  const scopeHint =
    scope === 'selection'
      ? noSelection
        ? 'Select layers in Figma to scan, or choose Page / Document.'
        : `${plural(selection.count, 'layer')} selected${selection.names.length ? `: ${selection.names.slice(0, 2).join(', ')}${selection.count > 2 ? '…' : ''}` : ''}`
      : scope === 'page'
        ? 'Scans everything on the current page.'
        : 'Scans every page in this file. This can take a while.'
  const tierLabel = `${processed.tier} ${TIER_LABEL[processed.tier]}`
  const skippedCount = summary?.skipped.length ?? 0
  const catIds = new Set(categories.map((c) => c.id))

  const rowProps = (i: Icon) => ({
    icon: i,
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

  const fixable = (f: FixCandidate) => f.actions.length > 0 && !fixResults[f.id]?.ok
  /** immediate "fix all": pre-selects the (non-low-confidence) fixes and opens the confirmation; Labs must be on */
  const fixAll = (list: FixCandidate[]) => {
    if (!settings.labs || !settings.labsBranchAck) {
      setShowSettings(true)
      return
    }
    const ids = list.filter((f) => fixable(f) && f.confidence !== 'low').map((f) => f.id)
    if (!ids.length) return
    setFixSel(new Set(ids))
    setConfirmOpen(true)
  }

  const renderFix = (f: FixCandidate) => (
    <FixCard
      key={f.id}
      fix={f}
      selected={fixSel.has(f.id)}
      action={actionOf(f)}
      result={fixResults[f.id]}
      onSelect={(v) => setFixSel((p) => { const n = new Set(p); if (v) n.add(f.id); else n.delete(f.id); return n })}
      onAction={(a) => setFixAction((p) => ({ ...p, [f.id]: a }))}
      onLocate={() => locate(f.nodeId)}
      onIgnore={f.groupId ? () => patch({ ignoredDuplicates: [...settings.ignoredDuplicates, f.groupId!] }) : undefined}
    />
  )

  return (
    <div class={styles.root}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <div class={styles.scopeRow}>
            <SegmentedControl
              value={scope}
              onValueChange={(v) => patch({ scanScope: v as ScanScope })}
              options={[{ value: 'selection', children: 'Selection' }, { value: 'page', children: 'Page' }, { value: 'document', children: 'Document' }]}
            />
            <InfoTip title="Scan scope">{SCOPE_INFO}</InfoTip>
          </div>
          <span class={styles.grow} />
          <button class={styles.settingsBtn} onClick={() => setShowSettings(true)} aria-label="Open settings">
            <CogIcon /> Settings
          </button>
        </div>
        <div class={styles.checkRow}>
          <Checkbox value={settings.usageOnly} onValueChange={(v) => patch({ usageOnly: v })}>
            Only icons in use (instances)
          </Checkbox>
          <InfoTip title="Only icons in use">{USAGE_INFO}</InfoTip>
        </div>
        {scanning ? (
          <Button fullWidth danger onClick={() => emit<CancelScanHandler>('CANCEL_SCAN')}>
            Cancel scan
          </Button>
        ) : (
          <Button fullWidth onClick={startScan} disabled={!canScan}>
            {scanLabel}
          </Button>
        )}
        <div class={styles.scope}>
          <span>{scanning ? phase : scopeHint}</span>
          {hasResults && !scanning && (
            <span title="Highest tier reached by at least 80% of icons · most common icon size">
              {tierLabel} · {g.width}×{g.height}
            </span>
          )}
        </div>
        {scanning && (
          <div class={styles.progress}>
            <div class={styles.progressBar} style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {scanError && <div class={cx(styles.pill, styles.pillError)}>{scanError}</div>}
      </div>

      {(hasResults || summary) && (
        <div class={styles.tabs} role="tablist">
          <TabButton active={tab === 'icons'} onClick={() => setTab('icons')} count={icons.length}>Icons</TabButton>
          <TabButton
            active={tab === 'issues'}
            onClick={() => setTab('issues')}
            count={actionable.length}
            tone={actionable.some((x) => x.severity === 'error') ? 'error' : actionable.length ? 'warn' : undefined}
          >
            Issues
          </TabButton>
          <TabButton active={tab === 'skipped'} onClick={() => setTab('skipped')} count={skippedCount}>Skipped</TabButton>
        </div>
      )}

      {/* ---------------- Icons ---------------- */}
      {tab === 'icons' && hasResults && (
        <div class={styles.toolbar}>
          <div class={styles.toolbarRow}>
            <div class={styles.grow}>
              <SearchTextbox value={query} onValueInput={setQuery} placeholder="Search icons" />
            </div>
            <div class={styles.seg} role="group" aria-label="View">
              <button class={cx(styles.iconBtn, view === 'list' && styles.iconBtnActive)} onClick={() => setView('list')} aria-label="List view" title="List"><ListIcon /></button>
              <button class={cx(styles.iconBtn, view === 'grouped' && styles.iconBtnActive)} onClick={() => setView('grouped')} aria-label="Group by category" title="Group by category" disabled={categories.length === 0}><GroupedIcon /></button>
              <button class={cx(styles.iconBtn, view === 'grid' && styles.iconBtnActive)} onClick={() => setView('grid')} aria-label="Grid view" title="Grid"><GridIcon /></button>
            </div>
          </div>
          {categories.length > 0 && (
            <div class={styles.toolbarRow}>
              <div class={styles.grow}>
                <Dropdown
                  value={catFilter || '__all'}
                  onValueChange={(v) => setCatFilter(v === '__all' ? '' : v)}
                  options={[{ value: '__all', text: `All categories (${categories.length})` }, ...categories.map((c) => ({ value: c.id, text: `${c.label} (${c.count})` }))]}
                />
              </div>
              <InfoTip title="Categories">
                <span>
                  Icons are grouped using your Figma organisation: layer-name path, section, parent frame or page (see Settings → Categories). Filter here, switch to the grouped view to include/exclude whole categories, and optionally split the export folders by category.
                </span>
              </InfoTip>
            </div>
          )}
          <div class={styles.chips}>
            <Chip active={status === 'all' && !ruleFilter} onClick={() => showInList({})}>All <span class={styles.muted}>{icons.length}</span></Chip>
            <Chip tone="error" active={status === 'blocked'} onClick={() => showInList({ status: 'blocked' })} disabled={blockedIcons.length === 0} title="Icons with errors; they are not exported until fixed or excluded">
              <BlockIcon /> Blocked <span>{blockedIcons.length}</span>
            </Chip>
            <Chip tone="warn" active={status === 'alerts'} onClick={() => showInList({ status: 'alerts' })} disabled={alertIcons.length === 0} title="Icons with warnings (exported, but worth a look)">
              <WarnIcon /> Alerts <span>{alertIcons.length}</span>
            </Chip>
            {off.size > 0 && (
              <Chip active={status === 'excluded'} onClick={() => showInList({ status: 'excluded' })}>Excluded <span class={styles.muted}>{off.size}</span></Chip>
            )}
            {release.diff && CHANGE_KINDS.filter((k) => changeCounts[k]).map((k) => (
              <Chip key={k} active={changeFilter === k} onClick={() => { setChangeFilter(changeFilter === k ? null : k); setLimit(PAGE_SIZE) }} title={`Changed since the baseline: ${BASELINE_LABEL[baselineSource!]}`}>
                {CHANGE_LABEL[k]} <span>{changeCounts[k]}</span>
              </Chip>
            ))}
            <InfoTip title="Blocked vs alerts">
              <span>
                <strong>Blocked</strong>: has an error (text or image layer, invalid or duplicate name…). Blocked icons are <em>not exported</em> until you fix them in Figma and rescan, rename them here, or exclude them.
                <br /><br />
                <strong>Alerts</strong>: warnings such as effects, off-grid size, or instance overrides the export can’t reproduce. These icons are still exported.
              </span>
            </InfoTip>
          </div>
        </div>
      )}

      {tab === 'icons' && ruleFilter && (
        <div class={styles.banner}>
          <span>
            <strong>{ruleInfo(ruleFilter).title}</strong> · {plural(visible.length, 'icon')}
          </span>
          <button class={styles.iconBtn} onClick={() => setRuleFilter(null)}>Clear</button>
        </div>
      )}

      {tab === 'icons' && (
        <div class={styles.list}>
          {!hasResults && !scanning && <EmptyState summary={summary} />}
          {hasResults && (
            <div class={styles.listHead}>
              <Checkbox value={off.size === 0} onValueChange={(v) => setOff(v ? new Set() : new Set(icons.map((i) => i.key)))}>
                Include all
              </Checkbox>
              <span>{visible.length} shown</span>
            </div>
          )}
          {hasResults && visible.length === 0 && <div class={styles.empty}>No icons match.</div>}
          {view === 'list' && renderRows(visible.slice(0, limit))}
          {view === 'grouped' && renderGrouped(visible.slice(0, limit))}
          {view === 'grid' && (
            <div class={styles.grid}>
              {visible.slice(0, limit).map((i) => (
                <Card key={i.key} icon={i} included={!off.has(i.key)} onInclude={(v) => setIncluded([i.key], v)} onLocate={() => locate(i.nodeId)} onExpand={() => { setView('list'); setOpen((p) => new Set(p).add(i.key)); setQuery(i.name) }} />
              ))}
            </div>
          )}
          {visible.length > limit && (
            <div style={{ padding: '8px 0' }}>
              <Button secondary fullWidth onClick={() => setLimit(limit + PAGE_SIZE)}>Show more ({visible.length - limit} left)</Button>
            </div>
          )}
        </div>
      )}

      {/* ---------------- Issues ---------------- */}
      {tab === 'issues' && (
        <div class={styles.list}>
          <div class={styles.listHead} style={{ justifyContent: 'space-between' }}>
            <span>{actionable.length ? `${plural(actionable.length, 'problem')} to review` : ''}</span>
            <Button secondary onClick={doReport} disabled={icons.length === 0}>Export report (.md)</Button>
          </div>
          {actionable.length > 0 && (
            <IssueOverview
              groups={actionable}
              fixesFor={fixesForRule}
              fixable={fixable}
              labsReady={settings.labs && settings.labsBranchAck}
              onFixGroup={(g) => fixAll(fixesForRule(g.ruleId, g.icons))}
              onFixAll={() => fixAll(allFixes)}
              onShow={(g) => showInList({ rule: g.ruleId })}
            />
          )}
          {allFixes.some((f) => f.actions.length > 0) && (
            <div class={styles.applyBarSticky}>
              <div class={styles.fieldRow}>
                <strong class={styles.grow}>Selected fixes: {selectedFixes.length} of {plural(allFixes.filter((f) => f.actions.length).length, 'automatic fix')}</strong>
                <span class={styles.labsBadge}>Labs</span>
                <InfoTip title="Automatic fixes">
                  <span>Some problems can be fixed for you: replacing a detached icon with an instance, turning a frame into a component, standardising layer names. Open a problem’s <em>fixes</em> to see before/after previews. Fixes <strong>edit your Figma file</strong> only after you review and confirm, and are applied as one undo step. Turn on Labs in Settings and confirm you are in a branch or copy.</span>
                </InfoTip>
              </div>
              {!settings.labs || !settings.labsBranchAck ? (
                <div class={styles.muted}>
                  {!settings.labs ? 'Applying fixes is a Labs feature (off).' : 'Confirm you are working in a branch or a copy to enable Apply.'}{' '}
                  <button class={styles.linkBtn} onClick={() => setShowSettings(true)}>{settings.labs ? 'Open Labs settings' : 'Enable Labs…'}</button> · <button class={styles.linkBtn} onClick={doFixesReport}>Dry-run report (.md)</button>
                </div>
              ) : (
                <div class={styles.fieldRow}>
                  <div class={styles.grow}>
                    <Button fullWidth onClick={() => setConfirmOpen(true)} disabled={selectedFixes.length === 0 || scanning}>
                      {selectedFixes.length ? `Review & apply ${plural(selectedFixes.length, 'fix')}` : 'Select fixes to apply'}
                    </Button>
                  </div>
                  <button class={styles.linkBtn} onClick={() => setFixSel(new Set(allFixes.filter((f) => f.actions.length).map((f) => f.id)))}>Select all</button>
                  <button class={styles.linkBtn} onClick={doFixesReport}>Dry-run report</button>
                </div>
              )}
            </div>
          )}
          {actionable.length === 0 && (
            <div class={styles.empty}>
              <div class={styles.allClear}><CheckIcon /> No errors or alerts.</div>
              <div>Notes below are informational.</div>
            </div>
          )}
          {(['error', 'warn'] as Severity[]).map((sev) => {
            const list = groups.filter((x) => x.severity === sev)
            if (!list.length) return null
            return (
              <div key={sev}>
                <div class={styles.groupTitle}>{sev === 'error' ? 'Blocking export' : 'Needs attention'} · {list.length}</div>
                {list.map((x) => (
                  <IssueCard key={x.ruleId} extra={x.ruleId === 'layer-names' && summary?.leafNames ? <LeafSchemes info={summary.leafNames} /> : undefined} group={x} cursor={cursor[x.ruleId] ?? 0} fixes={fixesForRule(x.ruleId, x.icons)} fixesOpen={fixGroupOpen.has(x.ruleId)} onToggleFixes={() => setFixGroupOpen((p) => { const n = new Set(p); if (n.has(x.ruleId)) n.delete(x.ruleId); else n.add(x.ruleId); return n })} renderFix={renderFix} onShow={() => showInList({ rule: x.ruleId })}
                    onLocate={() => {
                      const idx = (cursor[x.ruleId] ?? 0) % x.icons.length
                      locate(x.icons[idx].nodeId)
                      setCursor((c) => ({ ...c, [x.ruleId]: idx + 1 }))
                    }} />
                ))}
              </div>
            )
          })}
          {groups.some((x) => x.severity === 'info') && (
            <div>
              <div class={styles.groupTitle}>
                <button class={styles.iconBtn} onClick={() => setShowNotes(!showNotes)} aria-expanded={showNotes}>
                  <ChevronIcon open={showNotes} /> Notes · {groups.filter((x) => x.severity === 'info').length}
                </button>
              </div>
              {showNotes &&
                groups.filter((x) => x.severity === 'info').map((x) => (
                  <IssueCard key={x.ruleId} extra={x.ruleId === 'layer-names' && summary?.leafNames ? <LeafSchemes info={summary.leafNames} /> : undefined} group={x} cursor={cursor[x.ruleId] ?? 0} fixes={fixesForRule(x.ruleId, x.icons)} fixesOpen={fixGroupOpen.has(x.ruleId)} onToggleFixes={() => setFixGroupOpen((p) => { const n = new Set(p); if (n.has(x.ruleId)) n.delete(x.ruleId); else n.add(x.ruleId); return n })} renderFix={renderFix} onShow={() => showInList({ rule: x.ruleId })}
                    onLocate={() => {
                      const idx = (cursor[x.ruleId] ?? 0) % x.icons.length
                      locate(x.icons[idx].nodeId)
                      setCursor((c) => ({ ...c, [x.ruleId]: idx + 1 }))
                    }} />
                ))}
            </div>
          )}
          {actionable.length > 0 && (
            <div class={styles.muted} style={{ padding: '4px 0 8px' }}>
              Fix order: {STEPS.map((s) => s.title).join(' → ')}. The plugin never edits your file; fix in Figma, then rescan.
            </div>
          )}
        </div>
      )}

      {/* ---------------- Skipped ---------------- */}
      {tab === 'skipped' && (
        <div class={styles.list}>
          <div class={styles.muted} style={{ padding: '8px 0' }}>
            Layers the scan looked at but did not treat as icons. Change <em>Scan mode</em> or <em>Max icon size</em> in Settings to include them.
          </div>
          {skippedCount === 0 && <div class={styles.empty}>Nothing was skipped.</div>}
          {summary?.skipped.map((s) => (
            <div class={styles.skipRow} key={s.nodeId}>
              <div style={{ minWidth: 0 }}>
                <div class={cx(styles.name, styles.ellipsis)} title={s.name}>{s.name}</div>
                <div class={styles.muted}>{s.reason}</div>
              </div>
              <button class={styles.iconBtn} onClick={() => locate(s.nodeId)} aria-label={`Locate ${s.name}`} title="Locate on canvas"><LocateIcon /> Locate</button>
            </div>
          ))}
        </div>
      )}

      {/* ---------------- Footer ---------------- */}
      <div class={styles.footer}>
        {hasResults && (
          <div class={styles.footerNote}>
            <span>
              {blocked > 0 ? (
                <button class={cx(styles.iconBtn, styles.sevError)} style={{ height: 18, padding: '0 4px' }} onClick={() => showInList({ status: 'blocked' })}>{blocked} blocked, will be skipped</button>
              ) : (
                `${exportable.length} ready`
              )}
            </span>
            <span>{plural(enabledFormats.length, 'format')}</span>
          </div>
        )}
        <Button fullWidth onClick={() => setExportOpen(true)} disabled={!hasResults || scanning}>
          {exportable.length ? `Export ${plural(exportable.length, 'icon')}…` : 'Export…'}
        </Button>
      </div>
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
          prevCatalog={prevCatalog}
          prevError={prevError}
          onLoadPrevious={loadPrevious}
          onClearPrevious={() => setBaselineChoice('none')}
          baseline={{
            source: baselineSource,
            options: (['repo', 'shared', 'local', 'file'] as BaselineSource[]).filter((k) => baselines[k]).map((k) => ({ value: k, text: `${BASELINE_LABEL[k]} · ${baselineMeta(k)}` })),
            message: baselineMsg,
            canRepo: settings.labs && settings.sync.enabled,
            canShare: settings.labs,
            onPick: (v) => setBaselineChoice(v),
            onLoadRepo: loadRepoBaseline,
            onSaveShared: saveSharedBaseline
          }}
          onDownload={doExport}
          onSend={settings.labs && settings.sync.enabled ? startSync : null}
          onShowBlocked={() => { setExportOpen(false); showInList({ status: 'blocked' }) }}
          onClose={() => setExportOpen(false)}
        />
      )}
      {confirmOpen && (
        <ConfirmApply
          items={selectedFixes.map((f) => ({ fix: f, action: actionOf(f) }))}
          renameLeaves={renameLeaves}
          leafName={settings.leafName}
          onRenameLeaves={setRenameLeaves}
          onCancel={() => setConfirmOpen(false)}
          onApply={applySelected}
          applying={applying}
        />
      )}

      {syncPlan && (
        <SyncDialog
          plan={syncPlan}
          subdir={settings.sync.subdir}
          commit={settings.sync.commit}
          branch={settings.sync.branch}
          sending={syncing}
          result={syncResult}
          error={syncError}
          onCancel={() => { setSyncPlan(null); setSyncResult(null); setSyncError(null) }}
          onSend={sendSync}
        />
      )}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          patch={patch}
          onClose={() => setShowSettings(false)}
          extras={{ exampleVariable, scanVariables, onExportConfig, onImportConfig, configMessage, shared: sharedInfo, onPublish, onUseShared, syncStatus, onTestSync }}
        />
      )}
      <div class={styles.grip} />
    </div>
  )
}

function TabButton(props: { active: boolean; onClick: () => void; count: number; tone?: 'error' | 'warn'; children: ComponentChildren }) {
  return (
    <button class={cx(styles.tab, props.active && styles.tabActive)} onClick={props.onClick} role="tab" aria-selected={props.active}>
      {props.children}
      <span class={cx(styles.count, props.tone === 'error' && styles.countError, props.tone === 'warn' && styles.countWarn)}>{props.count}</span>
    </button>
  )
}

function Chip(props: { active: boolean; onClick: () => void; children: ComponentChildren; tone?: 'error' | 'warn'; disabled?: boolean; title?: string }) {
  return (
    <button
      class={cx(styles.chip, props.active && styles.chipActive, props.tone === 'error' && styles.chipError, props.tone === 'warn' && styles.chipWarn)}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-pressed={props.active}
      title={props.title}
      style={props.disabled ? { opacity: 0.45, cursor: 'default' } : undefined}
    >
      {props.children}
    </button>
  )
}

function EmptyState({ summary }: { summary: ScanSummary | null }) {
  if (summary) {
    return (
      <div class={styles.empty}>
        <strong>No icons found.</strong>
        <div>Try another scope, or check the Skipped tab and Settings → Scan mode.</div>
      </div>
    )
  }
  return (
    <div class={styles.empty}>
      <strong>Scan your icon frames</strong>
      <ol class={styles.emptySteps}>
        <li>Pick a scope: selection, page or document.</li>
        <li>Review alerts; <em>Locate</em> jumps to the layer.</li>
        <li>Check the export summary, then export a ZIP.</li>
      </ol>
      <div style={{ marginTop: 10 }}>Nothing in your file is ever modified.</div>
    </div>
  )
}

function Thumb({ icon }: { icon: Icon }) {
  return icon.svgOk ? <span dangerouslySetInnerHTML={{ __html: icon.standalone }} style={{ display: 'contents' }} /> : <span class={styles.muted}>?</span>
}

function StatusPill({ icon, onClick }: { icon: Icon; onClick?: () => void }) {
  const errs = icon.findings.filter((f) => f.severity === 'error').length
  const warns = icon.findings.filter((f) => f.severity === 'warn').length
  const infos = icon.findings.length - errs - warns
  if (errs) return <button class={cx(styles.pill, styles.pillError)} onClick={onClick} title="Blocked: has errors, not exported"><BlockIcon /> Blocked{errs > 1 ? ` · ${errs}` : ''}</button>
  if (warns) return <button class={cx(styles.pill, styles.pillWarn)} onClick={onClick} title="Has alerts, exported anyway"><WarnIcon /> {plural(warns, 'alert')}</button>
  if (infos) return <button class={cx(styles.pill, styles.pillInfo)} onClick={onClick} title="Informational notes"><InfoIcon /> {infos}</button>
  return <span class={cx(styles.pill, styles.pillOk)} title="No findings"><CheckIcon /></span>
}

function FormatChips({ formats }: { formats?: FormatId[] }) {
  if (!formats || !formats.length) return null
  return (
    <span class={styles.fmtChips}>
      {formats.map((f) => <span class={styles.fmtChip} key={f}>{FORMAT_LABEL[f]}</span>)}
    </span>
  )
}

function Row(props: {
  icon: Icon
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
  const sub = [icon.categoryLabel, icon.usage ? `used ×${icon.usage.instances}${icon.usage.remote ? ' · library' : ''}` : '', icon.layerName, icon.kind].filter(Boolean).join(' · ')
  return (
    <div class={styles.row}>
      <div class={cx(styles.rowMain, !props.included && styles.rowOff)}>
        <Checkbox value={props.included} onValueChange={props.onInclude}>{''}</Checkbox>
        <span class={styles.thumb}><Thumb icon={icon} /></span>
        <button class={styles.nameBtn} onClick={props.onExpand} aria-expanded={expanded} title="Show details and rename">
          <div class={cx(styles.name, styles.ellipsis, icon.nameOverride !== null && styles.renamed)}>{icon.name || '(no name)'}</div>
          <div class={cx(styles.ellipsis, firstError ? styles.sevError : styles.muted)}>{firstError ? firstError.message : sub}</div>
        </button>
        <StatusPill icon={icon} onClick={props.onExpand} />
        <button class={styles.iconBtn} onClick={props.onLocate} aria-label={`Locate ${icon.name}`} title="Locate on canvas"><LocateIcon /></button>
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

function Card(props: { icon: Icon; included: boolean; onInclude: (v: boolean) => void; onLocate: () => void; onExpand: () => void }) {
  const { icon } = props
  const sev = worst(icon.findings)
  return (
    <div class={cx(styles.card, sev === 'error' && styles.cardError, sev === 'warn' && styles.cardWarn, !props.included && styles.rowOff)}>
      <div class={styles.cardThumb}><Thumb icon={icon} /></div>
      <button class={styles.nameBtn} onClick={props.onExpand} title={icon.layerName}>
        <div class={cx(styles.name, styles.ellipsis)}>{icon.name}</div>
        {icon.categoryLabel && <div class={cx(styles.muted, styles.ellipsis)}>{icon.categoryLabel}</div>}
      </button>
      <StatusPill icon={icon} onClick={props.onExpand} />
      <div class={styles.cardFoot}>
        <Checkbox value={props.included} onValueChange={props.onInclude}>Include</Checkbox>
        <button class={styles.iconBtn} onClick={props.onLocate} aria-label={`Locate ${icon.name}`} title="Locate on canvas"><LocateIcon /></button>
      </div>
    </div>
  )
}

function IssueOverview(props: {
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
          <strong>{plural(errors, 'blocking icon')} · {plural(warns, 'alerted icon')}</strong>
          <div class={styles.muted}>{plural(props.groups.length, 'type')} of problem · {totalSafe} can be fixed automatically</div>
        </div>
        {totalSafe > 0 && (
          <Button onClick={props.onFixAll} title={props.labsReady ? '' : 'Enable Labs first'}>
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
              {fixes.length > safe && <span class={styles.muted} title="Low-confidence fixes (they would discard edits) are excluded from Fix all; review them one by one">+{fixes.length - safe} to review</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LeafSchemes({ info }: { info: NonNullable<ScanSummary['leafNames']> }) {
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

function IssueCard(props: { extra?: ComponentChildren; group: IssueGroup; cursor: number; fixes: FixCandidate[]; fixesOpen: boolean; onToggleFixes: () => void; renderFix: (f: FixCandidate) => ComponentChildren; onShow: () => void; onLocate: () => void }) {
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
      {info.fix && <div><strong>Fix:</strong> {info.fix}</div>}
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
        <Button secondary onClick={props.onShow}>Show {plural(n, 'icon')}</Button>
        <button class={styles.iconBtn} onClick={props.onLocate} title="Select the next affected layer on the canvas">
          <LocateIcon /> Locate {(props.cursor % n) + 1}/{n} <NextIcon />
        </button>
      </div>
    </div>
  )
}

export default render(Plugin)
