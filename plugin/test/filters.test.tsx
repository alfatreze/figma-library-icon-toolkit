import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { Filters, filtersReducer, initialFilters } from '../src/ui/hooks/useFilters'
import { TabBar, TabPanel } from '../src/ui/components/TabBar'

const reduce = filtersReducer(50)

describe('filters reducer', () => {
  it('showing a status or rule resets paging and the other one', () => {
    let s: Filters = { ...initialFilters(50), limit: 150, rule: 'off-grid' }
    s = reduce(s, { type: 'show', status: 'blocked' })
    expect(s).toMatchObject({ status: 'blocked', rule: null, limit: 50 })
    s = reduce(s, { type: 'show', rule: 'overflow' })
    expect(s).toMatchObject({ status: 'all', rule: 'overflow' })
  })
  it('a change filter resets paging, a category or search does not', () => {
    const s = { ...initialFilters(50), limit: 100 }
    expect(reduce(s, { type: 'change', value: 'added' })).toMatchObject({ change: 'added', limit: 50 })
    expect(reduce(s, { type: 'category', value: 'x' }).limit).toBe(100)
    expect(reduce(s, { type: 'query', value: 'home' }).limit).toBe(100)
  })
  it('a new scan clears every filter but keeps what was typed in search', () => {
    const s = { status: 'alerts' as const, rule: 'r', category: 'c', query: 'home', change: 'added' as const, limit: 200 }
    expect(reduce(s, { type: 'reset' })).toEqual({ ...initialFilters(50), query: 'home' })
  })
  it('clearRule only drops the rule', () => {
    expect(reduce({ ...initialFilters(50), rule: 'r', status: 'blocked' }, { type: 'clearRule' })).toMatchObject({ rule: null, status: 'blocked' })
  })
})

describe('tabs and panels', () => {
  let root: HTMLDivElement
  afterEach(() => {
    act(() => render(null, root))
    root.remove()
  })
  it('each tab names the panel it controls and the panel names its tab', () => {
    root = document.createElement('div')
    document.body.appendChild(root)
    act(() =>
      render(
        <div>
          <TabBar label="T" value="b" onChange={() => {}} tabs={[{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]} />
          <TabPanel id="b">content</TabPanel>
        </div>,
        root
      )
    )
    const tab = root.querySelector('#tab-b')!
    const panel = root.querySelector('[role="tabpanel"]')!
    expect(tab.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id)
  })
})
