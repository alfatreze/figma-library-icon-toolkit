import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '../src/ui/Dialog'

describe('Dialog', () => {
  const setup = (busy = false) => {
    const onClose = vi.fn()
    const outside = document.createElement('button')
    outside.textContent = 'open'
    document.body.appendChild(outside)
    outside.focus()
    const root = document.createElement('div')
    document.body.appendChild(root)
    act(() =>
      render(
        <Dialog label="Export" onClose={onClose} busy={busy}>
          <button>first</button>
          <button>last</button>
        </Dialog>,
        root
      )
    )
    return { onClose, outside, root }
  }
  it('is a labelled modal dialog and moves focus inside', () => {
    const { root } = setup()
    const d = root.querySelector('[role=dialog]')!
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(d.getAttribute('aria-label')).toBe('Export')
    expect(d.contains(document.activeElement)).toBe(true)
    expect(document.activeElement?.textContent).toBe('first')
  })
  it('Esc closes, unless busy', () => {
    const a = setup()
    act(() => void a.root.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(a.onClose).toHaveBeenCalledTimes(1)
    const b = setup(true)
    act(() => void b.root.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(b.onClose).not.toHaveBeenCalled()
  })
  it('gives focus back to the opener when it unmounts', () => {
    const { outside, root } = setup()
    act(() => render(null, root))
    expect(document.activeElement).toBe(outside)
  })
})
