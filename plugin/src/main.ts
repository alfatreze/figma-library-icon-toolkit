import { emit, on, showUI } from '@create-figma-plugin/utilities'
import {
  ApplyFixesHandler, ConfigPublishedHandler, PublishConfigHandler, SharedConfigHandler, FixCandidate, FixesAppliedHandler, FixResultHandler,
  CancelScanHandler, DEFAULT_SETTINGS, LocateHandler, NotifyHandler, ResizeHandler, SaveSettingsHandler,
  ScanBatchHandler, ScanDoneHandler, ScanErrorHandler, ScanHandler, ScanPhaseHandler, ScanStartHandler, SelectionHandler,
  Settings, SettingsLoadedHandler, UiReadyHandler, SaveBaselineHandler, BaselinesHandler, BaselineSavedHandler
} from './types'
import { registerCodegen } from './main/codegen'
import { applyFix } from './main/apply'
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
  const settings = await loadSettings()
  let cancel = false
  let scanning = false

  showUI({ width: settings.windowWidth, height: settings.windowHeight, title: 'Icon Library Toolkit' })

  on<UiReadyHandler>('UI_READY', async () => {
    emit<SettingsLoadedHandler>('SETTINGS_LOADED', settings)
    emitSelection()
    const shared = await readShared()
    emit<SharedConfigHandler>('SHARED_CONFIG', shared ? shared.publishedAt : null, shared ? shared.publishedBy ?? null : null, shared ? shared.config : null)
    emit<BaselinesHandler>('BASELINES', await readLocalBaseline(), await readSharedBaseline(), fileIdentity())
  })

  // Local baseline is automatic (clientStorage, no file write). The shared one writes into the file: UI offers it only in Labs.
  on<SaveBaselineHandler>('SAVE_BASELINE', async (text, target) => {
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
    latest = s // the window size is owned by the main thread, so UI saves never overwrite it
    persist()
  })

  on<ResizeHandler>('RESIZE', (w, h) => {
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
