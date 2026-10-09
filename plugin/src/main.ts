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
import { loadSettings, serializeSettings, SETTINGS_KEY } from './main/settings'
import { readShared, writeShared } from './main/shared'
import { serializeShared } from './core/config'
import { scan } from './main/scan'
import { clampSize, validBaseline, validDevResources, validFixRequests, validSharedConfig } from './main/guards'
import { migrateSettings } from './core/settingsSchema'
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
  let applying = false

  /** a message handler must never leave the UI waiting: log the failure and tell the user */
  const safe = <A extends unknown[]>(label: string, fn: (...args: A) => Promise<void> | void) => async (...args: A) => {
    try {
      await fn(...args)
    } catch (e) {
      console.error(`[icon-toolkit] ${label} failed`, e)
      figma.notify(`${label} failed: ${e instanceof Error ? e.message : String(e)}`, { error: true })
    }
  }

  showUI(inspect ? { width: 360, height: 560, title: 'Icon Library Toolkit' } : { width: settings.windowWidth, height: settings.windowHeight, title: 'Icon Library Toolkit' }, { inspect })

  on<UiReadyHandler>('UI_READY', safe('Starting', async () => {
    emit<SettingsLoadedHandler>('SETTINGS_LOADED', settings)
    emitSelection()
    const shared = await readShared()
    emit<SharedConfigHandler>('SHARED_CONFIG', shared ? shared.publishedAt : null, shared ? shared.publishedBy ?? null : null, shared ? shared.config : null)
    emit<BaselinesHandler>('BASELINES', await readLocalBaseline(), await readSharedBaseline(), fileIdentity())
  }))

  // Local baseline is automatic (clientStorage, no file write). The shared one writes into the file: UI offers it only in Labs.
  on<SaveBaselineHandler>('SAVE_BASELINE', safe('Saving the baseline', async (text, target) => {
    if (inspect || !validBaseline(text, target)) return
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
  }))

  // Opt-in write (Labs): publishes the library settings into the file so Dev Mode and teammates use the same config.
  on<PublishConfigHandler>('PUBLISH_CONFIG', safe('Publishing the config', async (settingsJson) => {
    if (inspect) return
    if (!validSharedConfig(settingsJson)) {
      emit<ConfigPublishedHandler>('CONFIG_PUBLISHED', false, 'That config is not valid, nothing was written')
      return
    }
    const res = await writeShared(settingsJson)
    emit<ConfigPublishedHandler>('CONFIG_PUBLISHED', res.ok, res.message)
    if (res.ok) {
      const shared = await readShared()
      emit<SharedConfigHandler>('SHARED_CONFIG', shared ? shared.publishedAt : null, shared ? shared.publishedBy ?? null : null, shared ? shared.config : null)
    }
  }))

  figma.on('selectionchange', emitSelection)
  figma.on('currentpagechange', emitSelection)

  let size = { w: settings.windowWidth, h: settings.windowHeight }
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let latest: Settings = settings
  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, 300)
  }
  const flush = async () => {
    saveTimer = null
    try {
      await figma.clientStorage.setAsync(SETTINGS_KEY, serializeSettings(latest, size))
    } catch (e) {
      console.warn('[icon-toolkit] could not save settings', e)
    }
  }
  // the 300 ms debounce must not lose the last change when the plugin is closed right after it
  figma.on('close', () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      void flush()
    }
  })

  on<SaveSettingsHandler>('SAVE_SETTINGS', (s) => {
    if (inspect) return // never overwrite a designer's saved settings from the read-only panel
    latest = migrateSettings(s) // validated like anything stored; the window size is owned by the main thread, so UI saves never overwrite it
    persist()
  })

  on<ResizeHandler>('RESIZE', (w, h) => {
    if (inspect) return
    size = clampSize(w, h, MIN, MAX)
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
    if (scanning || applying) {
      emit<ScanErrorHandler>('SCAN_ERROR', applying ? 'Fixes are being applied. Scan again in a moment.' : 'A scan is already running.')
      return
    }
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

  on<ApplyFixesHandler>('APPLY_FIXES', safe('Applying fixes', async (rawRequests) => {
    const requests = validFixRequests(rawRequests)
    if (inspect || !requests.length) return
    if (scanning || applying) {
      figma.notify('Wait for the scan or the previous fixes to finish.', { error: true })
      emit<FixesAppliedHandler>('FIXES_APPLIED', 0, requests.length)
      return
    }
    applying = true
    let ok = 0
    let failed = 0
    try {
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
    } finally {
      applying = false
      figma.commitUndo() // one undo step for the whole batch, also when something threw half-way
    }
    emit<FixesAppliedHandler>('FIXES_APPLIED', ok, failed)
  }))

  // Labs: attach a "where is this icon in code" link to each icon component (shows in Dev Mode > Dev resources). Writes to the file; no-op when the link already exists.
  on<AttachDevResourcesHandler>('ATTACH_DEV_RESOURCES', safe('Attaching dev resources', async (rawItems) => {
    const items = validDevResources(rawItems)
    if (inspect || !items.length) return
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
  }))

  // Selecting + zooming changes the user's selection/viewport only; it never edits nodes.
  on<LocateHandler>('LOCATE', safe('Locating the layer', async (nodeId) => {
    if (typeof nodeId !== 'string' || nodeId.length > 200) return
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
  }))
}
