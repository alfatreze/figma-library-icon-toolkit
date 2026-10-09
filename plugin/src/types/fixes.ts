// Split from the former types.ts: see types/index.ts for the barrel.

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
