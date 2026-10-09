import { emit, on, showUI } from '@create-figma-plugin/utilities'
import {
  ApplyFixesHandler, ConfigPublishedHandler, PublishConfigHandler, SharedConfigHandler, FixCandidate, FixesAppliedHandler, FixResultHandler,
  CancelScanHandler, DEFAULT_SETTINGS, LocateHandler, NotifyHandler, ResizeHandler, SaveSettingsHandler,
  ScanBatchHandler, ScanDoneHandler, ScanErrorHandler, ScanHandler, ScanPhaseHandler, ScanStartHandler, SelectionHandler,
  Settings, SettingsLoadedHandler, UiReadyHandler, SaveBaselineHandler, BaselinesHandler, BaselineSavedHandler, AttachDevResourcesHandler, DevResourcesAttachedHandler
} from './types'
import { registerCodegen } from './main/codegen'
import { applyFix } from './main/apply'
import { effectiveSettings } from './main/effective'
import { loadSettings, SETTINGS_KEY } from './main/settings'
import { readShared, writeShared } from './main/shared'
import { serializeShared } from './core/config'
import { scan } from './main/scan'
import { fileIdentity, readLocalBaseline, readSharedBaseline, writeLocalBaseline, writeSharedBaseline } from './main/baseline'

const MIN = { w: 360, h: 460 }
const MAX = { w: 1000, h: 1100 }

function emitSelection() {
  const sel = figma.currentPage.selection
  emit<SelectionHandler>('SELECTION', sel.length, sel.slice(0, 5).map((n) => n.name))
}

export default async function () {
  // Dev Mode: the Code section calls this plugin to generate snippets; no UI is shown.
  if (figma.mode === 'codegen') {
    registerCodegen()
    return
  }
  // Dev Mode inspect panel: read-only; uses the library config published in the file (a developer has no saved settings).
  const inspect = figma.mode === 'inspect'
  const settings = inspect ? (await effectiveSettings()).settings : await loadSettings()
  let cancel = false
  let scanning = false

  showUI(inspect ? { width: 360, height: 560, title: 'Icon Library Toolkit' } : { width: settings.windowWidth, height: settings.windowHeight, title: 'Icon Library Toolkit' }, { inspect })

  on<UiReadyHandler>('UI_READY', async () => {
    emit<SettingsLoadedHandler>('SETTINGS_LOADED', settings)
    emitSelection()
    const shared = await readShared()
    emit<SharedConfigHandler>('SHARED_CONFIG', shared ? shared.publishedAt : null, shared ? shared.publishedBy ?? null : null, shared ? shared.config : null)
    emit<BaselinesHandler>('BASELINES', await readLocalBaseline(), await readSharedBaseline(), fileIdentity())
  })

  // Local baseline is automatic (clientStorage, no file write). The shared one writes into the file: UI offers it only in Labs.
  on<SaveBaselineHandler>('SAVE_BASELINE', async (text, target) => {
    if (inspect) return
    try {
      if (target === 'local') {
        await writeLocalBaseline(text)
        emit<BaselineSavedHandler>('BASELINE_SAVED', 'local', true, 'Saved on this computer')
      } else {
        const res = await writeSharedBaseline(text)
        emit<BaselineSavedHandler>('BASELINE_SAVED', 'shared', res.ok, res.message)
      }
    } catch (e) {
      emit<BaselineSavedHandler>('BASELINE_SAVED', target, false, e instanceof Error ? e.message : String(e))
    }
    emit<BaselinesHandler>('BASELINES', await readLocalBaseline(), await readSharedBaseline(), fileIdentity())
  })

  // Opt-in write (Labs): publishes the library settings into the file so Dev Mode and teammates use the same config.
  on<PublishConfigHandler>('PUBLISH_CONFIG', async (settingsJson) => {
    if (inspect) return
    const res = await writeShared(settingsJson)
    emit<ConfigPublishedHandler>('CONFIG_PUBLISHED', res.ok, res.message)
    if (res.ok) {
      const shared = await readShared()
      emit<SharedConfigHandler>('SHARED_CONFIG', shared ? shared.publishedAt : null, shared ? shared.publishedBy ?? null : null, shared ? shared.config : null)
    }
  })

  figma.on('selectionchange', emitSelection)
  figma.on('currentpagechange', emitSelection)

  let size = { w: settings.windowWidth, h: settings.windowHeight }
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let latest: Settings = settings
  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await figma.clientStorage.setAsync(SETTINGS_KEY, { ...latest, windowWidth: size.w, windowHeight: size.h })
      } catch {
        /* non-fatal */
      }
    }, 300)
  }

  on<SaveSettingsHandler>('SAVE_SETTINGS', (s) => {
    if (inspect) return // never overwrite a designer's saved settings from the read-only panel
    latest = s // the window size is owned by the main thread, so UI saves never overwrite it
    persist()
  })

  on<ResizeHandler>('RESIZE', (w, h) => {
    if (inspect) return
    size = { w: Math.round(Math.min(MAX.w, Math.max(MIN.w, w))), h: Math.round(Math.min(MAX.h, Math.max(MIN.h, h))) }
    figma.ui.resize(size.w, size.h)
    persist()
  })

  on<NotifyHandler>('NOTIFY', (message, error) => {
    figma.notify(message, { error })
  })

  on<CancelScanHandler>('CANCEL_SCAN', () => {
    cancel = true
  })

  on<ScanHandler>('SCAN', async (options) => {
    if (scanning) return
    scanning = true
    cancel = false
    found.clear()
    emit<ScanStartHandler>('SCAN_START')
    try {
      const summary = await scan(
        options,
        () => cancel,
        (text) => emit<ScanPhaseHandler>('SCAN_PHASE', text),
        (icons, progress) => {
          for (const i of icons) for (const f of i.fixes ?? []) found.set(f.id, f)
          emit<ScanBatchHandler>('SCAN_BATCH', icons, progress)
        }
      )
      emit<ScanDoneHandler>('SCAN_DONE', summary)
    } catch (e) {
      emit<ScanErrorHandler>('SCAN_ERROR', e instanceof Error ? e.message : String(e))
    } finally {
      scanning = false
    }
  })

  // ---- fixes: the only code path that edits the file; always opt-in from the UI (Labs) ----
  const found = new Map<string, FixCandidate>()

  on<ApplyFixesHandler>('APPLY_FIXES', async (requests) => {
    if (inspect) return
    let ok = 0
    let failed = 0
    for (const req of requests) {
      const fix = found.get(req.id)
      if (!fix) {
        failed++
        emit<FixResultHandler>('FIX_RESULT', { id: req.id, ok: false, message: 'Unknown fix. Scan again.' })
        continue
      }
      const result = await applyFix(req, fix)
      if (result.ok) ok++
      else failed++
      emit<FixResultHandler>('FIX_RESULT', result)
    }
    figma.commitUndo() // one undo step for the whole batch
    emit<FixesAppliedHandler>('FIXES_APPLIED', ok, failed)
  })

  // Labs: attach a "where is this icon in code" link to each icon component (shows in Dev Mode > Dev resources). Writes to the file; no-op when the link already exists.
  on<AttachDevResourcesHandler>('ATTACH_DEV_RESOURCES', async (items) => {
    if (inspect) return
    let added = 0
    let existing = 0
    let failed = 0
    let lastError = ''
    for (const item of items) {
      try {
        const node = await figma.getNodeByIdAsync(item.nodeId)
        if (!node || !('addDevResourceAsync' in node)) {
          failed++
          continue
        }
        const have = await node.getDevResourcesAsync()
        if (have.some((r) => r.url === item.url)) {
          existing++
          continue
        }
        await node.addDevResourceAsync(item.url, item.name)
        added++
      } catch (e) {
        failed++
        lastError = e instanceof Error ? e.message : String(e)
      }
    }
    figma.commitUndo()
    emit<DevResourcesAttachedHandler>('DEV_RESOURCES_ATTACHED', added, existing, failed, lastError)
  })

  // Selecting + zooming changes the user's selection/viewport only; it never edits nodes.
  on<LocateHandler>('LOCATE', async (nodeId) => {
    const node = await figma.getNodeByIdAsync(nodeId)
    if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') {
      figma.notify('That layer no longer exists. Scan again.', { error: true })
      return
    }
    let p: BaseNode | null = node
    while (p && p.type !== 'PAGE') p = p.parent
    if (p && p.type === 'PAGE' && p.id !== figma.currentPage.id) await figma.setCurrentPageAsync(p)
    const scene = node as SceneNode
    figma.currentPage.selection = [scene]
    figma.viewport.scrollAndZoomIntoView([scene])
  })
}
