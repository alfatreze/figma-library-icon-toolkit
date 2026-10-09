import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8')
const rule = (selector: string) => {
  const m = new RegExp(selector.replace(/[[\]().*+?^$|]/g, '\\$&') + '[^{]*\\{([^}]*)\\}').exec(css)
  return m ? m[1] : ''
}

describe('hint placement', () => {
  it('opens below by default and upward inside the footer, so the window edge never cuts it off', () => {
    expect(rule("[data-hint]:not([data-hint='']):hover::after")).toMatch(/top:\s*calc\(100% \+ 6px\)/)
    expect(rule(".footer [data-hint]:not([data-hint='']):hover::after")).toMatch(/bottom:\s*calc\(100% \+ 6px\)/)
    expect(rule(".footer [data-hint]:not([data-hint='']):hover::after")).toMatch(/top:\s*auto/)
  })
  it('hints on the left side of the footer start at the control, not at its right edge', () => {
    expect(rule(".footerNote [data-hint]:not([data-hint='']):hover::after")).toMatch(/left:\s*0/)
  })
})
