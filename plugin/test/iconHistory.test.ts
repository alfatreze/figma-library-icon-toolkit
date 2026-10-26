import { describe, expect, it } from 'vitest'
import { CatalogIcon, diffCatalogs, nextHistory, parseCatalog, PreviousCatalog } from '../src/core/changelog'
import { makeSnapshot, snapshotToCatalog } from '../src/core/baseline'
import { buildFiles } from '../src/core/generators'
import { changelogBadge } from '../src/core/repoCatalog'
import { processIcons } from '../src/core/process'
import { emptyFacts } from '../src/main/facts'
import { DEFAULT_SETTINGS, RawIcon, Settings } from '../src/types'

const icon = (name: string, over: Partial<CatalogIcon> = {}): CatalogIcon => ({ name, hash: 'h-' + name, colorHash: 'c-' + name, figma: { componentKey: 'k-' + name }, ...over })
const catalog = (icons: CatalogIcon[], libraryVersion = '1.0.0', deprecated: PreviousCatalog['deprecated'] = []): PreviousCatalog => ({ libraryVersion, icons, deprecated })

describe('per-icon history', () => {
  it('a first export says every icon is since that version', () => {
    expect(nextHistory(null, '1.0.0', ['a', 'b'])).toEqual({ a: { since: '1.0.0' }, b: { since: '1.0.0' } })
  })

  it('carries since forward, stamps new icons and changed or recoloured ones with the new version, leaves the rest alone', () => {
    const prev = catalog([icon('a', { since: '1.0.0' }), icon('b', { since: '1.0.0', changedIn: '1.1.1' }), icon('c', { since: '1.0.0' }), icon('d', { since: '1.2.0' })], '1.2.0')
    const cur = [icon('a'), icon('b'), icon('c', { hash: 'changed' }), icon('d', { colorHash: 'recoloured' }), icon('e')]
    const diff = diffCatalogs(prev, cur)
    expect(nextHistory(diff, '1.2.1', cur.map((c) => c.name))).toEqual({
      a: { since: '1.0.0' },
      b: { since: '1.0.0', changedIn: '1.1.1' },
      c: { since: '1.0.0', changedIn: '1.2.1' },
      d: { since: '1.2.0', changedIn: '1.2.1' },
      e: { since: '1.2.1' }
    })
  })

  it('follows a rename through the component key', () => {
    const prev = catalog([icon('old', { since: '1.0.0', figma: { componentKey: 'k' } })])
    const cur = [icon('new', { hash: 'h-old', colorHash: 'c-old', figma: { componentKey: 'k' } })]
    expect(nextHistory(diffCatalogs(prev, cur), '2.0.0', ['new'])).toEqual({ new: { since: '1.0.0' } })
  })

  it('does not invent a history for an icon whose previous entry had none, and drops values that are not versions', () => {
    const prev = catalog([icon('a'), icon('b', { since: 'oops' as never, changedIn: '<script>' as never })])
    const cur = [icon('a'), icon('b')]
    expect(nextHistory(diffCatalogs(prev, cur), '1.0.1', ['a', 'b'])).toEqual({ a: {}, b: {} })
  })

  it('survives a baseline snapshot and an icons.json round trip, and only real versions are read', () => {
    const snap = makeSnapshot([icon('a', { since: '1.0.0', changedIn: '1.3.0' })], { at: 'now', version: '1.3.0' })
    expect(snapshotToCatalog(snap).icons[0]).toMatchObject({ since: '1.0.0', changedIn: '1.3.0' })
    const text = JSON.stringify({ libraryVersion: '1.3.0', icons: [{ name: 'a', since: '1.0.0', changedIn: '1.3.0' }, { name: 'b', since: 'x"y', changedIn: 7 }] })
    const parsed = parseCatalog(text)
    expect(parsed.icons[0]).toMatchObject({ since: '1.0.0', changedIn: '1.3.0' })
    expect(parsed.icons[1].since).toBeUndefined()
    expect(parsed.icons[1].changedIn).toBeUndefined()
  })
})

describe('icons.json carries the history', () => {
  const raw = (name: string): RawIcon => ({
    key: name, nodeId: '1:' + name, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: name, variantProps: {}, description: '',
    width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: { ...emptyFacts(), leafCount: 1 },
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 2h20v20H2z" fill="#112233"/></svg>', categoryCtx: {}
  })
  it('writes since and changedIn per icon when the release has them, and nothing otherwise', () => {
    const s: Settings = { ...DEFAULT_SETTINGS, namespace: 'cmn', formats: { ...DEFAULT_SETTINGS.formats } }
    const p = processIcons([raw('home'), raw('search')], s, {})
    const base = { allIcons: p.icons, settings: s, grid: p.grid, tier: p.tier, generatedAt: '2026-01-01' }
    const withHistory = JSON.parse(buildFiles({ ...base, release: { version: '1.1.0', deprecated: [], diff: null, history: { home: { since: '1.0.0', changedIn: '1.1.0' }, search: { since: '1.1.0' } } } })['icons.json'])
    expect(withHistory.icons.find((i: { name: string }) => i.name === 'home')).toMatchObject({ since: '1.0.0', changedIn: '1.1.0' })
    expect(withHistory.icons.find((i: { name: string }) => i.name === 'search').changedIn).toBeUndefined()
    const none = JSON.parse(buildFiles(base)['icons.json'])
    expect(none.icons[0].since).toBeUndefined()
  })
})

describe('the badge in the Dev Mode panel', () => {
  const cat = catalog(
    [icon('fresh', { since: '2.0.0' }), icon('tweaked', { since: '1.0.0', changedIn: '2.0.0' }), icon('stale-change', { since: '1.0.0', changedIn: '1.4.0' }), icon('old', { since: '1.1.0' }), icon('bare'), icon('now-named', { since: '1.0.0' })],
    '2.0.0',
    [{ name: 'was-named', replacedBy: 'now-named', since: '2.0.0' }]
  )
  it('highlights what the latest release did, and shows older history plainly', () => {
    expect(changelogBadge('fresh', cat)).toEqual({ text: 'New in v2.0.0', fresh: true })
    expect(changelogBadge('tweaked', cat)).toEqual({ text: 'Updated in v2.0.0', fresh: true })
    expect(changelogBadge('now-named', cat)).toEqual({ text: 'Renamed from was-named in v2.0.0', fresh: true })
    expect(changelogBadge('stale-change', cat)).toEqual({ text: 'Updated in v1.4.0', fresh: false })
    expect(changelogBadge('old', cat)).toEqual({ text: 'Since v1.1.0', fresh: false })
  })
  it('says nothing for an icon with no history or one that is not there', () => {
    expect(changelogBadge('bare', cat)).toBeNull()
    expect(changelogBadge('missing', cat)).toBeNull()
  })
})
