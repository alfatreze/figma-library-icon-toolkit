import { EventHandler } from '@create-figma-plugin/utilities'

export type SourceKind = 'component-set' | 'component' | 'instance' | 'frame' | 'loose'
export type ScanMode = 'auto' | 'components' | 'frames' | 'loose'
export type ScanScope = 'selection' | 'page' | 'document'
export type CategorySource = 'auto' | 'path' | 'section' | 'frame' | 'page' | 'none'
export type StrokePolicy = 'constant' | 'scale' | 'table'
export type TokenMode = 'path' | 'collection' | 'custom' | 'none'

export interface TokenNaming {
  mode: TokenMode
  /** prepended to the CSS variable, e.g. "ds" → --ds-color-neutral-darkest */
  prefix: string
  /** leading path segments to drop, comma separated (e.g. "color") */
  stripSegments: string
  /** custom mapping, one per line: figma/variable/name = --css-var */
  mapping: string
}

export interface SyncSettings {
  enabled: boolean
  url: string
  token: string
  subdir: string
  commit: boolean
  message: string
  branch: string
}
export type FormatId = 'svg' | 'sprite' | 'html' | 'mask' | 'angular' | 'react' | 'webComponent'
export type Profile = 'lenient' | 'standard' | 'strict'
export type Severity = 'error' | 'warn' | 'info'
export type IconKind = 'filled' | 'stroked' | 'multicolor' | 'mixed'

export interface Settings {
  namespace: string
  profile: Profile
  scanMode: ScanMode
  scanScope: ScanScope
  /** canonical name for the vector layer inside icon components (override-safe) */
  leafName: string
  /** 'auto' = use the name most icons in the file already use; 'fixed' = always use leafName */
  leafNameMode: 'auto' | 'fixed'
  /** duplicate-artwork groups you marked as intentional (kept on this computer) */
  ignoredDuplicates: string[]
  /** only icons placed as instances (library usage); aggregates usage + overrides */
  usageOnly: boolean
  categorySource: CategorySource
  splitByCategory: boolean
  /** category segments dropped from names (e.g. "icon/Home" -> "home") */
  ignoreSegments: string[]
  /** variant values omitted from names (e.g. "Default") */
  ignoreVariantValues: string[]
  libSizeMode: 'auto' | 'manual'
  libWidth: number
  libHeight: number
  maxIconSize: number
  colorMode: 'themeable' | 'original'
  tokenNaming: TokenNaming
  strokePolicy: StrokePolicy
  /** "size:weight" pairs for the table policy, e.g. "16:1.5, 24:2, 32:2, 64:3" */
  strokeTable: string
  /** convert strokes to filled paths on export (stroke width is then fixed) */
  outlineStrokes: boolean
  /** Labs: features that can edit the Figma file or talk to localhost */
  labs: boolean
  labsBranchAck: boolean
  compositeFrames: 'ignore' | 'include'
  sync: SyncSettings
  precision: number
  formats: {
    svg: boolean
    sprite: boolean
    html: boolean
    mask: boolean
    angularModern: boolean
    angularClassic: boolean
    react: boolean
    webComponent: boolean
    /** Code Connect template files (needs an Organization/Enterprise plan to publish) */
    codeConnect: boolean
  }
  /** Figma file URL used by Code Connect and dev resources, e.g. https://www.figma.com/design/<key>/<name> */
  codeConnectUrl: string
  /** where developers find an icon (e.g. link to icons.json in the repo); attached as dev resource links (Labs) */
  devResourceUrl: string
  zipName: string
  windowWidth: number
  windowHeight: number
}

export const DEFAULT_SETTINGS: Settings = {
  namespace: 'cmn',
  profile: 'lenient',
  scanMode: 'auto',
  scanScope: 'selection',
  leafName: 'Vector',
  leafNameMode: 'auto',
  ignoredDuplicates: [],
  usageOnly: false,
  categorySource: 'auto',
  splitByCategory: false,
  ignoreSegments: ['icon', 'icons'],
  ignoreVariantValues: ['default'],
  libSizeMode: 'auto',
  libWidth: 24,
  libHeight: 24,
  maxIconSize: 128,
  colorMode: 'themeable',
  tokenNaming: { mode: 'path', prefix: '', stripSegments: '', mapping: '' },
  strokePolicy: 'constant',
  strokeTable: '16:1.5, 24:2, 32:2, 48:2.5, 64:3',
  outlineStrokes: false,
  labs: false,
  labsBranchAck: false,
  compositeFrames: 'ignore',
  sync: { enabled: false, url: 'http://localhost:5199', token: '', subdir: 'icons', commit: false, message: 'chore(icons): update from Figma', branch: '' },
  precision: 3,
  formats: {
    svg: true,
    sprite: true,
    html: true,
    mask: false,
    angularModern: true,
    angularClassic: true,
    react: false,
    webComponent: false,
    codeConnect: false
  },
  codeConnectUrl: '',
  devResourceUrl: '',
  zipName: '',
  windowWidth: 460,
  windowHeight: 640
}

export interface PaintFact {
  role: 'fill' | 'stroke'
  hex: string // #rrggbb lower
  opacity: number
  variable?: string // Figma variable name, e.g. "color/icon/primary"
  collection?: string // name of the variable collection
}

/** Plain, serialisable facts gathered from the Figma node tree (main thread). */
export interface Facts {
  paints: PaintFact[]
  leafCount: number
  hasText: boolean
  hasImage: boolean
  hasGradient: boolean
  hasEffects: boolean
  hasHidden: boolean
  hasLocked: boolean
  emptyContainers: boolean
  hasMask: boolean
  hasBlend: boolean
  hasOpacity: boolean
  hasRotation: boolean
  nonCenterStroke: boolean
  dashedStroke: boolean
  rootBackground: boolean
  clipsContent: boolean | null
  hasNestedInstance: boolean
}

export type OverrideClass =
  | 'color' | 'strokeWeight' | 'strokeStyle' | 'size' | 'geometry' | 'opacity' | 'visibility'
  | 'effects' | 'blend' | 'radius' | 'swap' | 'properties'

export interface UsageInfo {
  instances: number
  pages: string[]
  remote: boolean
  /** how many instances override each class of property */
  overrides: Partial<Record<OverrideClass, number>>
  /** distinct instance sizes seen, e.g. "16×16" */
  sizes: string[]
  /** override colours seen (hex + variable name when bound) */
  colors: { hex: string; variable?: string }[]
  exportedFrom: 'main' | 'instance'
}

export interface CategoryContext {
  section?: string
  frame?: string
}

export interface Padding {
  left: number
  top: number
  right: number
  bottom: number
}

export interface RawIcon {
  key: string // unique per scan row (node id)
  nodeId: string
  pageId: string
  pageName: string
  sourceKind: SourceKind
  rawName: string
  setName?: string
  variantProps: Record<string, string>
  componentKey?: string
  description: string
  width: number
  height: number
  padding: Padding | null
  facts: Facts
  svg: string | null
  /** same artwork with strokes converted to filled paths (only when the icon has strokes) */
  svgOutlined?: string | null
  /** problems with an automatic fix, found in the same pass (detached, not a component, layer names…) */
  fixes?: FixCandidate[]
  exportError?: string
  categoryCtx: CategoryContext
  usage?: UsageInfo
}

export interface LeafNames {
  /** the name used as the standard (detected or configured) */
  standard: string
  detected: boolean
  /** icons whose vector layer is the same name differing only by upper/lower case */
  caseVariants: number
  stats: { name: string; count: number }[]
}

export interface ScanSummary {
  leafNames?: LeafNames
  scanned: number
  skipped: { name: string; reason: string; nodeId: string }[]
  adapters: Partial<Record<SourceKind, number>>
}

export interface Finding {
  ruleId: string
  severity: Severity
  message: string
  fixHint?: string
  /** export formats this finding affects (only enabled formats are listed) */
  formats?: FormatId[]
}

export interface SlotInfo {
  index: number
  cssVar: string
  hex: string
  token?: string
  variable?: string
  uses: number
}

export interface Icon {
  key: string
  nodeId: string
  pageId: string
  pageName: string
  sourceKind: SourceKind
  rawName: string
  /** artwork hash (changes when the drawing changes) */
  hash: string
  colorHash: string
  hasStroke: boolean
  canOutline: boolean
  outlined: boolean
  fixes: FixCandidate[]
  layerName: string
  name: string // canonical kebab id
  nameOverride: string | null
  category: string[] // slugified path, e.g. ['acessibilidade']
  categoryLabel: string // original names, e.g. 'Acessibilidade'
  usage?: UsageInfo
  tags: string[]
  description: string
  kind: IconKind
  width: number
  height: number
  viewBox: string
  body: string
  standalone: string
  maskSvg: string | null
  slots: SlotInfo[]
  strokeWidth: number | null
  componentKey?: string
  variantProps: Record<string, string>
  setName?: string
  findings: Finding[]
  svgOk: boolean
}

export interface GridInfo {
  width: number
  height: number
  count: number
  total: number
  padding: number
  detected: boolean
}

// ---- messaging -------------------------------------------------------------

export interface ScanOptions {
  mode: ScanMode
  scope: ScanScope
  usageOnly: boolean
  maxIconSize: number
  compositeFrames: 'ignore' | 'include'
  leafName: string
  leafNameMode: 'auto' | 'fixed'
}
export interface ScanHandler extends EventHandler {
  name: 'SCAN'
  handler: (options: ScanOptions) => void
}
export interface ScanPhaseHandler extends EventHandler {
  name: 'SCAN_PHASE'
  handler: (text: string) => void
}
export interface CancelScanHandler extends EventHandler {
  name: 'CANCEL_SCAN'
  handler: () => void
}
export interface LocateHandler extends EventHandler {
  name: 'LOCATE'
  handler: (nodeId: string) => void
}
export interface SaveSettingsHandler extends EventHandler {
  name: 'SAVE_SETTINGS'
  handler: (settings: Settings) => void
}
export interface ResizeHandler extends EventHandler {
  name: 'RESIZE'
  handler: (width: number, height: number) => void
}
export interface UiReadyHandler extends EventHandler {
  name: 'UI_READY'
  handler: () => void
}
export interface NotifyHandler extends EventHandler {
  name: 'NOTIFY'
  handler: (message: string, error: boolean) => void
}

export interface SettingsLoadedHandler extends EventHandler {
  name: 'SETTINGS_LOADED'
  handler: (settings: Settings) => void
}
export interface SelectionHandler extends EventHandler {
  name: 'SELECTION'
  handler: (count: number, names: string[]) => void
}
export interface ScanStartHandler extends EventHandler {
  name: 'SCAN_START'
  handler: () => void
}
export interface ScanBatchHandler extends EventHandler {
  name: 'SCAN_BATCH'
  handler: (icons: RawIcon[], progress: number) => void
}
export interface ScanDoneHandler extends EventHandler {
  name: 'SCAN_DONE'
  handler: (summary: ScanSummary) => void
}
export interface ScanErrorHandler extends EventHandler {
  name: 'SCAN_ERROR'
  handler: (message: string) => void
}

// ---- health scan (heuristics) + fixes ---------------------------------------

export type FixKind =
  | 'detached-identical' // detached from a known component, geometry unchanged
  | 'detached-match' // not known as detached, but identical geometry to an existing component
  | 'detached-changed' // detached/similar, differs from the component
  | 'detached-unresolved' // detached from a component that cannot be read here
  | 'convert-frame' // icon-like frame that is not a component
  | 'wrap-loose' // loose group/vector: wrap in a frame and make a component
  | 'layer-names' // layer names inside the component are not override-safe
  | 'duplicate-component' // several components share identical artwork

export type FixActionId = 'replace-with-instance' | 'convert-to-component' | 'wrap-and-convert' | 'rename-layers' | 'apply-name'

export interface FixTarget {
  componentId?: string
  componentKey?: string
  name: string
  remote: boolean
  svg: string | null
  width: number
  height: number
}

export interface LayerRename {
  nodeId: string
  from: string
  to: string
}

export interface FixCandidate {
  id: string
  kind: FixKind
  confidence: 'high' | 'medium' | 'low'
  nodeId: string
  nodeType: string
  name: string
  pageName: string
  width: number
  height: number
  /** preview of the current artwork */
  svg: string | null
  target?: FixTarget
  /** human-readable differences between this layer and the target component */
  diffs: string[]
  /** actions that can be applied, first one is the recommended action */
  actions: FixActionId[]
  renames?: LayerRename[]
  /** extra layers involved (duplicate components) */
  others?: { nodeId: string; name: string }[]
  suggestedName?: string
  /** duplicate groups: stable id so "intentional" can be remembered */
  groupId?: string
}

export interface ApplyFixRequest {
  id: string
  action: FixActionId
  gridWidth: number
  gridHeight: number
  leafName: string
  name?: string
  /** also normalise vector layer names while converting */
  renameLeaves: boolean
}

export interface FixResult {
  id: string
  ok: boolean
  message: string
  newNodeId?: string
}

export interface ApplyFixesHandler extends EventHandler {
  name: 'APPLY_FIXES'
  handler: (requests: ApplyFixRequest[]) => void
}
export interface FixResultHandler extends EventHandler {
  name: 'FIX_RESULT'
  handler: (result: FixResult) => void
}
export interface FixesAppliedHandler extends EventHandler {
  name: 'FIXES_APPLIED'
  handler: (ok: number, failed: number) => void
}

export interface PublishConfigHandler extends EventHandler {
  name: 'PUBLISH_CONFIG'
  handler: (settingsJson: string) => void
}
export interface ConfigPublishedHandler extends EventHandler {
  name: 'CONFIG_PUBLISHED'
  handler: (ok: boolean, message: string) => void
}
export interface SharedConfigHandler extends EventHandler {
  name: 'SHARED_CONFIG'
  handler: (publishedAt: string | null, publishedBy: string | null, config: string | null) => void
}

// ---- dev resources (Labs: writes links onto icon components so they show in Dev Mode) ----
export interface DevResourceItem { nodeId: string; url: string; name: string }
export interface AttachDevResourcesHandler extends EventHandler {
  name: 'ATTACH_DEV_RESOURCES'
  handler: (items: DevResourceItem[]) => void
}
export interface DevResourcesAttachedHandler extends EventHandler {
  name: 'DEV_RESOURCES_ATTACHED'
  handler: (added: number, existing: number, failed: number, message: string) => void
}

// ---- change-detection baseline (see docs/CHANGE-DETECTION.md) ----
export interface SaveBaselineHandler extends EventHandler {
  name: 'SAVE_BASELINE'
  /** encoded snapshot; target 'shared' writes into the file (Labs only) */
  handler: (text: string, target: 'local' | 'shared') => void
}
export interface BaselinesHandler extends EventHandler {
  name: 'BASELINES'
  handler: (local: string | null, shared: string | null, fileId: string) => void
}
export interface BaselineSavedHandler extends EventHandler {
  name: 'BASELINE_SAVED'
  handler: (target: 'local' | 'shared', ok: boolean, message: string) => void
}
