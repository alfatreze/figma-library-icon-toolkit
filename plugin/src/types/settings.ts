// Split from the former types.ts: see types/index.ts for the barrel.

export type ScanMode = 'auto' | 'components' | 'frames' | 'loose'

export type ScanScope = 'selection' | 'page' | 'document'

export type CategorySource = 'auto' | 'path' | 'section' | 'frame' | 'page' | 'none'

export type StrokePolicy = 'constant' | 'scale' | 'table'

export type DuplicatePolicy = 'block' | 'category' | 'suffix'

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
  /** icons in an intentional duplicate group with identical artwork share one drawing: the others export as aliases (aliasOf) */
  aliasDuplicates: boolean
  /** only icons placed as instances (library usage); aggregates usage + overrides */
  usageOnly: boolean
  /** what to do when two icons resolve to the same name: block the export, prefix with the category, or number them (-2, -3) */
  duplicateNames: DuplicatePolicy
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
  aliasDuplicates: true,
  usageOnly: false,
  duplicateNames: 'block',
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
