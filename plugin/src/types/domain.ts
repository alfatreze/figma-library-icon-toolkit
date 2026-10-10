// Split from the former types.ts: see types/index.ts for the barrel.
import type { ScanMode, ScanScope, FormatId } from './settings'
import type { FixCandidate } from './fixes'

export type SourceKind = 'component-set' | 'component' | 'instance' | 'frame' | 'loose'

export type Severity = 'error' | 'warn' | 'info'

export type IconKind = 'filled' | 'stroked' | 'multicolor' | 'mixed'

export interface PaintFact {
  role: 'fill' | 'stroke'
  hex: string // #rrggbb lower
  opacity: number
  variable?: string // Figma variable name, e.g. "color/icon/primary"
  collection?: string // name of the variable collection
  /** the variable's colour in each mode of its collection (mode name -> #rrggbb), when it has more than one mode */
  modes?: Record<string, string>
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
  /** components only: how many instances of it were met in the pages that were scanned (not usage in other files, which a plugin cannot see) */
  placements?: number
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
  /** the colour in each mode of the variable's collection (e.g. Light / Dark), when the variable has several */
  modes?: Record<string, string>
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
  /** name of the icon whose artwork this one shares (intentional duplicate group); undefined for the icon that owns the drawing */
  aliasOf?: string
  nameOverride: string | null
  category: string[] // slugified path, e.g. ['acessibilidade']
  categoryLabel: string // original names, e.g. 'Acessibilidade'
  usage?: UsageInfo
  /** components only: instances met in the scanned pages (see RawIcon.placements) */
  placements?: number
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

// ---- dev resources (Labs: writes links onto icon components so they show in Dev Mode) ----
export interface DevResourceItem { nodeId: string; url: string; name: string }
/** one component description to write (Labs); `from` is what it was when scanned */
export interface DescriptionItem { nodeId: string; from: string; to: string }
/** one layer rename to write (Labs); `from` is the name it had when scanned */
export interface RenameItem { nodeId: string; from: string; to: string }
