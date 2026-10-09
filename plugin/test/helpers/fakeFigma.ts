/**
 * A tiny in-memory stand-in for the Figma plugin API: enough tree, plugin data and storage behaviour to test src/main/* without Figma.
 * It enforces the rules that bit us in practice: auto-layout children ignore/forbid transforms, HUG is invalid on instances, and
 * the sync getNodeById is not available (dynamic-page access).
 */
let counter = 0

export class FakeNode {
  id: string
  type: string
  name: string
  parent: FakeNode | null = null
  children: FakeNode[] = []
  visible = true
  locked = false
  removed = false
  opacity = 1
  blendMode = 'NORMAL'
  width = 24
  height = 24
  x = 0
  y = 0
  fills: unknown[] = []
  strokes: unknown[] = []
  reactions: unknown[] = []
  exportSettings: unknown[] = []
  layoutMode = 'NONE'
  layoutPositioning = 'AUTO'
  layoutSizingHorizontal = 'FIXED'
  layoutSizingVertical = 'FIXED'
  constraints = { horizontal: 'MIN', vertical: 'MIN' }
  clipsContent = false
  data = new Map<string, string>()
  devResources: { url: string; name?: string }[] = []
  log: string[] = []
  failOn: string | null = null
  key = ''
  remote = false
  description = ''
  main: FakeNode | null = null
  overrides: unknown[] = []
  detachedInfo: unknown = null
  selection: FakeNode[] = []
  componentPropertyReferences: Record<string, string> | null = null
  absoluteBoundingBox: { x: number; y: number; width: number; height: number } | null = null
  absoluteRenderBounds: { x: number; y: number; width: number; height: number } | null = null

  constructor(type: string, name = type) {
    this.type = type
    this.name = name
    this.id = `${++counter}:${counter}`
  }

  get relativeTransform(): number[][] {
    return [[1, 0, this.x], [0, 1, this.y]]
  }
  set relativeTransform(m: number[][]) {
    if (this.parent && this.parent.layoutMode !== 'NONE' && this.layoutPositioning !== 'ABSOLUTE') throw new Error('relativeTransform on an auto-layout child')
    this.x = m[0][2]
    this.y = m[1][2]
  }

  resize(w: number, h: number) {
    this.width = w
    this.height = h
  }
  /** every descendant (not the node itself) that the callback accepts, in tree order */
  findAll(cb: (n: FakeNode) => boolean): FakeNode[] {
    const out: FakeNode[] = []
    const walk = (n: FakeNode) => {
      for (const c of n.children) {
        if (cb(c)) out.push(c)
        walk(c)
      }
    }
    walk(this)
    return out
  }
  appendChild(c: FakeNode) {
    this.insertChild(this.children.length, c)
  }
  insertChild(i: number, c: FakeNode) {
    if (c.parent) c.parent.children = c.parent.children.filter((x) => x !== c)
    c.parent = this
    this.children.splice(i, 0, c)
  }
  remove() {
    this.removed = true
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this)
    this.parent = null
  }
  async setReactionsAsync(r: unknown[]) {
    if (this.failOn === 'reactions') throw new Error('reactions failed')
    this.reactions = r
  }
  getPluginData(k: string) {
    return this.data.get(k) ?? ''
  }
  setPluginData(k: string, v: string) {
    if (v === '') this.data.delete(k)
    else this.data.set(k, v)
  }
  async loadAsync() {}
  async exportAsync(): Promise<string> {
    if (this.failOn === 'export') throw new Error('export failed')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}"><path d="M0 0h${this.width}v${this.height}z" fill="#111111"/></svg>`
  }
  async getMainComponentAsync(): Promise<FakeNode | null> {
    return this.main
  }
  async getDevResourcesAsync() {
    return this.devResources.map((r) => ({ ...r, nodeId: this.id }))
  }
  async addDevResourceAsync(url: string, name?: string) {
    this.devResources.push({ url, name })
  }
  createInstance(): FakeNode {
    const i = new FakeNode('INSTANCE', this.name)
    i.main = this
    i.width = this.width
    i.height = this.height
    i.children = this.children.map((c) => {
      const copy = new FakeNode(c.type, c.name)
      copy.fills = JSON.parse(JSON.stringify(c.fills))
      copy.parent = i
      return copy
    })
    return i
  }
}

export interface FakeFigma {
  root: FakeNode
  page: FakeNode
  nodes: Map<string, FakeNode>
  storage: Map<string, unknown>
  notify: (m: string) => void
  variables: { store: Map<string, { id: string; name: string }> }
  [k: string]: unknown
}

export function installFigma(opts: { fileKey?: string } = {}): FakeFigma {
  const root = new FakeNode('DOCUMENT', 'My file')
  const page = new FakeNode('PAGE', 'Icons')
  root.appendChild(page)
  const storage = new Map<string, unknown>()
  const all = new Map<string, FakeNode>([[root.id, root], [page.id, page]])
  const track = (n: FakeNode) => {
    all.set(n.id, n)
    return n
  }
  const api = {
    root,
    page,
    nodes: all,
    storage,
    notify: () => {},
    fileKey: opts.fileKey,
    currentPage: page,
    mixed: Symbol('mixed'),
    createFrame: () => track(new FakeNode('FRAME')),
    createComponentFromNode: (n: FakeNode) => {
      n.type = 'COMPONENT'
      return n
    },
    getNodeByIdAsync: async (id: string) => all.get(id) ?? null,
    loadAllPagesAsync: async () => {
      throw new Error('loadAllPagesAsync is not used any more: pages load one at a time')
    },
    getNodeById: () => {
      throw new Error('sync getNodeById is not allowed with dynamic-page access')
    },
    commitUndo: () => {},
    variables: {
      store: new Map<string, { id: string; name: string }>(),
      getVariableByIdAsync: async (id: string) => api.variables.store.get(id) ?? null,
      setBoundVariableForPaint: (paint: Record<string, unknown>, field: string, v: { id: string }) => ({ ...paint, boundVariables: { [field]: { type: 'VARIABLE_ALIAS', id: v.id } } })
    },
    clientStorage: {
      getAsync: async (k: string) => storage.get(k),
      setAsync: async (k: string, v: unknown) => void storage.set(k, v),
      deleteAsync: async (k: string) => void storage.delete(k)
    }
  }
  ;(globalThis as unknown as { figma: unknown }).figma = api
  return api as unknown as FakeFigma
}

/** a component with N vector leaves */
export function makeComponent(fig: FakeFigma, name: string, leafFills: string[] = ['#111111']): FakeNode {
  const c = new FakeNode('COMPONENT', name)
  ;(c as unknown as { key: string }).key = 'key-' + name
  leafFills.forEach((hex, i) => {
    const v = new FakeNode('VECTOR', `Vector ${i}`)
    const n = parseInt(hex.slice(1), 16)
    v.fills = [{ type: 'SOLID', color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 } }]
    c.appendChild(v)
  })
  fig.page.appendChild(c)
  fig.nodes.set(c.id, c)
  return c
}

export function makeFrame(fig: FakeFigma, parent: FakeNode, name: string, leafFills: string[] = ['#111111']): FakeNode {
  const f = new FakeNode('FRAME', name)
  leafFills.forEach((hex, i) => {
    const v = new FakeNode('VECTOR', `Vector ${i}`)
    const n = parseInt(hex.slice(1), 16)
    v.fills = [{ type: 'SOLID', color: { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 } }]
    f.appendChild(v)
  })
  parent.appendChild(f)
  fig.nodes.set(f.id, f)
  return f
}
