import { beforeEach, describe, expect, it } from 'vitest'
import { applyFix } from '../src/main/apply'
import { fileIdentity, readLocalBaseline, readSharedBaseline, writeLocalBaseline, writeSharedBaseline } from '../src/main/baseline'
import { effectiveSettings } from '../src/main/effective'
import { serializeShared } from '../src/core/config'
import { DEFAULT_SETTINGS, ApplyFixRequest, FixCandidate } from '../src/types'
import { FakeFigma, FakeNode, installFigma, makeComponent, makeFrame } from './helpers/fakeFigma'

let fig: FakeFigma
beforeEach(() => {
  fig = installFigma()
})

const fixFor = (node: FakeNode, comp: FakeNode): FixCandidate =>
  ({ id: 'f1', kind: 'detached-identical', nodeId: node.id, nodeType: 'FRAME', nodeName: node.name, confidence: 'high', diffs: [], actions: ['replace-with-instance'], target: { componentId: comp.id, componentName: comp.name } }) as unknown as FixCandidate
const req = (over: Partial<ApplyFixRequest> = {}): ApplyFixRequest => ({ id: 'f1', action: 'replace-with-instance', gridWidth: 24, gridHeight: 24, renameLeaves: false, leafName: 'Vector', ...over }) as ApplyFixRequest

describe('apply: replace with instance', () => {
  it('keeps the layer name, visibility, opacity and prototype reactions', async () => {
    const comp = makeComponent(fig, 'icon/Home')
    const detached = makeFrame(fig, fig.page, 'my home button icon')
    detached.opacity = 0.5
    detached.locked = true
    detached.reactions = [{ trigger: { type: 'ON_CLICK' } }]
    const res = await applyFix(req(), fixFor(detached, comp))
    expect(res.ok).toBe(true)
    const inst = fig.nodes.get(res.newNodeId!) ?? fig.page.children.find((c) => c.type === 'INSTANCE')!
    const created = fig.page.children.find((c) => c.type === 'INSTANCE')!
    expect(created.name).toBe('my home button icon')
    expect(created.opacity).toBe(0.5)
    expect(created.locked).toBe(true)
    expect(created.reactions).toHaveLength(1)
    expect(detached.removed).toBe(true)
    void inst
  })

  it('places the instance at the same index and position outside auto-layout', async () => {
    const comp = makeComponent(fig, 'icon/Home')
    const before = makeFrame(fig, fig.page, 'a')
    const detached = makeFrame(fig, fig.page, 'b')
    detached.x = 40
    detached.y = 8
    const res = await applyFix(req(), fixFor(detached, comp))
    expect(res.ok).toBe(true)
    const idx = fig.page.children.findIndex((c) => c.type === 'INSTANCE')
    expect(fig.page.children[idx - 1]).toBe(before)
    expect(fig.page.children[idx].x).toBe(40)
    expect(fig.page.children[idx].y).toBe(8)
  })

  it('does not touch the transform in an auto-layout parent, and turns HUG into FIXED', async () => {
    const comp = makeComponent(fig, 'icon/Home')
    const row = makeFrame(fig, fig.page, 'row', [])
    row.layoutMode = 'HORIZONTAL'
    const detached = makeFrame(fig, row, 'icon')
    detached.layoutSizingHorizontal = 'HUG'
    detached.layoutSizingVertical = 'FILL'
    const res = await applyFix(req(), fixFor(detached, comp))
    expect(res.ok).toBe(true)
    const inst = row.children.find((c) => c.type === 'INSTANCE')!
    expect(inst.layoutSizingHorizontal).toBe('FIXED')
    expect(inst.layoutSizingVertical).toBe('FILL')
  })

  it('keeps an absolute-positioned child absolute (and in place) inside auto-layout', async () => {
    const comp = makeComponent(fig, 'icon/Home')
    const row = makeFrame(fig, fig.page, 'row', [])
    row.layoutMode = 'VERTICAL'
    const detached = makeFrame(fig, row, 'badge')
    detached.layoutPositioning = 'ABSOLUTE'
    detached.x = 12
    const res = await applyFix(req(), fixFor(detached, comp))
    expect(res.ok).toBe(true)
    const inst = row.children.find((c) => c.type === 'INSTANCE')!
    expect(inst.layoutPositioning).toBe('ABSOLUTE')
    expect(inst.x).toBe(12)
  })

  it('rolls back completely when a step fails: no stray instance, original kept', async () => {
    const comp = makeComponent(fig, 'icon/Home')
    const detached = makeFrame(fig, fig.page, 'icon')
    detached.reactions = [{ x: 1 }]
    const create = (comp as unknown as { createInstance: () => FakeNode }).createInstance.bind(comp)
    ;(comp as unknown as { createInstance: () => FakeNode }).createInstance = () => {
      const i = create()
      i.failOn = 'reactions'
      return i
    }
    const res = await applyFix(req(), fixFor(detached, comp))
    expect(res.ok).toBe(false)
    expect(fig.page.children.some((c) => c.type === 'INSTANCE')).toBe(false)
    expect(detached.removed).toBe(false)
  })

  it('carries a colour override when leaf counts match', async () => {
    const comp = makeComponent(fig, 'icon/Home', ['#111111'])
    const detached = makeFrame(fig, fig.page, 'icon', ['#ff0000'])
    const res = await applyFix(req(), fixFor(detached, comp))
    expect(res.message).toContain('1 colour override')
  })

  it('refuses stale or missing layers', async () => {
    const comp = makeComponent(fig, 'icon/Home')
    const detached = makeFrame(fig, fig.page, 'icon')
    const fix = fixFor(detached, comp)
    detached.type = 'GROUP'
    expect((await applyFix(req(), fix)).message).toMatch(/changed since the scan/)
    detached.remove()
    expect((await applyFix(req(), fix)).message).toMatch(/no longer exists/)
  })
})

describe('apply: wrap and convert', () => {
  it('wraps a loose layer into a component and centres it', async () => {
    const v = new FakeNode('VECTOR', 'shape')
    v.width = 10
    v.height = 10
    fig.page.appendChild(v)
    fig.nodes.set(v.id, v)
    const fix = { id: 'f1', kind: 'convert-frame', nodeId: v.id, nodeType: 'VECTOR', actions: ['wrap-and-convert'], diffs: [] } as unknown as FixCandidate
    const res = await applyFix(req({ action: 'wrap-and-convert', name: 'icon/Shape' }), fix)
    expect(res.ok).toBe(true)
    const comp = fig.nodes.get(res.newNodeId!)!
    expect(comp.type).toBe('COMPONENT')
    expect(comp.name).toBe('icon/Shape')
    expect(comp.width).toBe(24)
    expect(v.x).toBe(7)
  })

  it('puts the layer back when creating the component fails', async () => {
    const v = new FakeNode('VECTOR', 'shape')
    v.width = 10
    v.height = 10
    v.x = 3
    fig.page.appendChild(v)
    fig.nodes.set(v.id, v)
    ;(fig as unknown as { createComponentFromNode: () => never }).createComponentFromNode = () => {
      throw new Error('boom')
    }
    const fix = { id: 'f1', kind: 'convert-frame', nodeId: v.id, nodeType: 'VECTOR', actions: ['wrap-and-convert'], diffs: [] } as unknown as FixCandidate
    const res = await applyFix(req({ action: 'wrap-and-convert' }), fix)
    expect(res.ok).toBe(false)
    expect(v.parent).toBe(fig.page)
    expect(v.x).toBe(3)
    expect(fig.page.children.filter((c) => c.type === 'FRAME')).toHaveLength(0)
  })
})

describe('baseline storage', () => {
  it('local baseline is keyed by file identity and never writes to the file', async () => {
    await writeLocalBaseline('abc')
    expect(await readLocalBaseline()).toBe('abc')
    expect(fig.root.data.size).toBe(0)
    const other = installFigma()
    other.root.name = 'Other file'
    expect(await readLocalBaseline()).toBeNull()
  })

  it('shared baseline round-trips in chunks and shrinks cleanly', async () => {
    const big = 'x'.repeat(200000)
    expect((await writeSharedBaseline(big)).ok).toBe(true)
    expect(await readSharedBaseline()).toBe(big)
    await writeSharedBaseline('small')
    expect(await readSharedBaseline()).toBe('small')
    expect([...fig.root.data.keys()].filter((k) => k.startsWith('ilt:baseline:v1:') && k !== 'ilt:baseline:v1:n')).toEqual(['ilt:baseline:v1:0'])
  })

  it('reports a write failure instead of throwing', async () => {
    fig.root.setPluginData = () => {
      throw new Error('no edit access')
    }
    const res = await writeSharedBaseline('x')
    expect(res.ok).toBe(false)
    expect(res.message).toMatch(/view-only/)
  })

  it('uses the file key when the plugin can read it, else the stored id', () => {
    installFigma({ fileKey: 'KEY123' })
    expect(fileIdentity()).toBe('KEY123')
    const f = installFigma()
    f.root.setPluginData('ilt:fileid:v1', 'stored-id')
    expect(fileIdentity()).toBe('stored-id')
  })
})

describe('effective settings (what Dev Mode uses)', () => {
  it('prefers the config published in the file over the viewer’s own settings', async () => {
    fig.storage.set('ilt:settings:v1', { ...DEFAULT_SETTINGS, namespace: 'mine' })
    fig.root.setPluginData('ilt:config:v1', serializeShared({ ...DEFAULT_SETTINGS, namespace: 'team' }, '2026-10-09T00:00:00Z', 'Ana'))
    const r = await effectiveSettings()
    expect(r.source).toBe('file')
    expect(r.settings.namespace).toBe('team')
  })
  it('falls back to local settings, then defaults, and says which', async () => {
    expect((await effectiveSettings()).source).toBe('defaults')
    fig.storage.set('ilt:settings:v1', { ...DEFAULT_SETTINGS, namespace: 'mine' })
    const r = await effectiveSettings()
    expect(r.source).toBe('local')
    expect(r.settings.namespace).toBe('mine')
  })
})

describe('baseline housekeeping', () => {
  it('keeps at most 20 local baselines (oldest dropped)', async () => {
    for (let i = 0; i < 25; i++) {
      const f = installFigma()
      f.root.children[0].id = `9:${i}`
      f.storage = fig.storage // one shared clientStorage across "files"
      ;(globalThis as unknown as { figma: { clientStorage: unknown } }).figma.clientStorage = (fig as unknown as { clientStorage: unknown }).clientStorage
      await writeLocalBaseline(`b${i}`)
    }
    const keys = [...fig.storage.keys()].filter((k) => k.startsWith('ilt:baseline:local:'))
    expect(keys.length).toBe(20)
  })
  it('identity survives renaming the file and adding pages', () => {
    const a = fileIdentity()
    fig.root.name = 'Renamed'
    fig.root.appendChild(new FakeNode('PAGE', 'Another'))
    expect(fileIdentity()).toBe(a)
  })
})
