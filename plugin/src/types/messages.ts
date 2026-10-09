// One map ties every message name to its argument list. `emit<ScanHandler>('SCAN', options)` and `on<ScanHandler>('SCAN', (options) => …)`
// are checked against it, so a renamed message or a changed argument fails to compile on BOTH sides (UI and main thread).

import type { EventHandler } from '@create-figma-plugin/utilities'
import type { Settings } from './settings'
import type { RawIcon, ScanSummary, ScanOptions, DevResourceItem } from './domain'
import type { ApplyFixRequest, FixResult } from './fixes'

export interface Messages {
  OPEN_EXTERNAL: [url: string]
  REQUEST_DIAGNOSTICS: []
  DIAGNOSTICS: [text: string]
  SCAN: [options: ScanOptions]
  SCAN_PHASE: [text: string]
  CANCEL_SCAN: []
  LOCATE: [nodeId: string]
  SAVE_SETTINGS: [settings: Settings]
  RESIZE: [width: number, height: number]
  UI_READY: []
  NOTIFY: [message: string, error: boolean]
  SETTINGS_LOADED: [settings: Settings]
  SELECTION: [count: number, names: string[]]
  SCAN_START: []
  SCAN_BATCH: [icons: RawIcon[], progress: number]
  SCAN_DONE: [summary: ScanSummary]
  SCAN_ERROR: [message: string]
  APPLY_FIXES: [requests: ApplyFixRequest[]]
  FIX_RESULT: [result: FixResult]
  FIXES_APPLIED: [ok: number, failed: number]
  PUBLISH_CONFIG: [settingsJson: string]
  CONFIG_PUBLISHED: [ok: boolean, message: string]
  SHARED_CONFIG: [publishedAt: string | null, publishedBy: string | null, config: string | null]
  ATTACH_DEV_RESOURCES: [items: DevResourceItem[]]
  DEV_RESOURCES_ATTACHED: [added: number, existing: number, failed: number, message: string]
  SAVE_BASELINE: [text: string, target: 'local' | 'shared']
  BASELINES: [local: string | null, shared: string | null, fileId: string]
  BASELINE_SAVED: [target: 'local' | 'shared', ok: boolean, message: string]
}

export type Handler<N extends keyof Messages> = EventHandler & { name: N; handler: (...args: Messages[N]) => void }

export type ScanHandler = Handler<'SCAN'>
export type ScanPhaseHandler = Handler<'SCAN_PHASE'>
export type CancelScanHandler = Handler<'CANCEL_SCAN'>
export type LocateHandler = Handler<'LOCATE'>
export type SaveSettingsHandler = Handler<'SAVE_SETTINGS'>
export type ResizeHandler = Handler<'RESIZE'>
export type UiReadyHandler = Handler<'UI_READY'>
export type NotifyHandler = Handler<'NOTIFY'>
export type SettingsLoadedHandler = Handler<'SETTINGS_LOADED'>
export type SelectionHandler = Handler<'SELECTION'>
export type ScanStartHandler = Handler<'SCAN_START'>
export type ScanBatchHandler = Handler<'SCAN_BATCH'>
export type ScanDoneHandler = Handler<'SCAN_DONE'>
export type ScanErrorHandler = Handler<'SCAN_ERROR'>
export type ApplyFixesHandler = Handler<'APPLY_FIXES'>
export type FixResultHandler = Handler<'FIX_RESULT'>
export type FixesAppliedHandler = Handler<'FIXES_APPLIED'>
export type PublishConfigHandler = Handler<'PUBLISH_CONFIG'>
export type ConfigPublishedHandler = Handler<'CONFIG_PUBLISHED'>
export type SharedConfigHandler = Handler<'SHARED_CONFIG'>
export type AttachDevResourcesHandler = Handler<'ATTACH_DEV_RESOURCES'>
export type DevResourcesAttachedHandler = Handler<'DEV_RESOURCES_ATTACHED'>
export type SaveBaselineHandler = Handler<'SAVE_BASELINE'>
export type BaselinesHandler = Handler<'BASELINES'>
export type BaselineSavedHandler = Handler<'BASELINE_SAVED'>
export type RequestDiagnosticsHandler = Handler<'REQUEST_DIAGNOSTICS'>
export type DiagnosticsHandler = Handler<'DIAGNOSTICS'>
export type OpenExternalHandler = Handler<'OPEN_EXTERNAL'>
