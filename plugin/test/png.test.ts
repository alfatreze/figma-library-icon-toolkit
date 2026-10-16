import { describe, expect, it } from 'vitest'
import { canRecolour, cleanSuffix, colourOptions, constraintText, normaliseHex, parseSize, pixelSize, planPng, resolveColour, rowsFromFigma, svgForPng } from '../src/core/png'
import { DEFAULT_SETTINGS, Icon, PngRow } from '../src/types'
import { checkSetting, migrateSettings } from '../src/core/settingsSchema'

const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">${inner}</svg>`
const icon = (name: string, over: Partial<Icon> = {}): Icon =>
  ({
    name, width: 16, height: 16, svgOk: true, kind: 'filled', slots: [{ index: 1, cssVar: '--c1', hex: '#112233', uses: 1 }],
    standalone: svg('<path d="M0 0h8v8z" fill="var(--c1, currentColor)" fill-opacity="0.5"/><path d="M1 1" stroke="var(--c1, currentColor)" stroke-width="var(--w, 2)" vector-effect="non-scaling-stroke"/>'),
    ...over
  }) as Icon
const multi = icon('multi', { kind: 'multicolor', slots: [{ index: 1, cssVar: '--c1', hex: '#111111', uses: 1 }, { index: 2, cssVar: '--c2', hex: '#ff0000', uses: 1 }] })
const row = (id: string, size: string, suffix = '', colour: PngRow['colour'] = { kind: 'drawn' }): PngRow => ({ id, size, suffix, colour })
const base = (i: Icon) => `cmn-${i.name}`

describe('sizes', () => {
  it('parses 2x, 512w and 512h and rejects the rest', () => {
    expect(parseSize('2x')).toEqual({ type: 'scale', value: 2 })
    expect(parseSize(' 0.5X ')).toEqual({ type: 'scale', value: 0.5 })
    expect(parseSize('512w')).toEqual({ type: 'width', value: 512 })
    expect(parseSize('512H')).toEqual({ type: 'height', value: 512 })
    for (const bad of ['', 'x', '0x', '33x', '512', '512w512h', '512 w', '9999w', '-2x', '1e3w', '12px']) expect(parseSize(bad), bad).toBeNull()
  })
  it('keeps the proportions when only one side is given, and refuses huge or empty results', () => {
    expect(pixelSize(16, 16, { type: 'scale', value: 2 })).toEqual({ w: 32, h: 32 })
    expect(pixelSize(24, 12, { type: 'width', value: 48 })).toEqual({ w: 48, h: 24 })
    expect(pixelSize(24, 12, { type: 'height', value: 48 })).toEqual({ w: 96, h: 48 })
    expect(pixelSize(1000, 1, { type: 'height', value: 4000 })).toBeNull()
    expect(pixelSize(1000, 1, { type: 'scale', value: 0.0001 })).toBeNull()
    expect(pixelSize(0, 16, { type: 'scale', value: 1 })).toBeNull()
  })
  it('turns Figma constraints into the text a person types', () => {
    expect(constraintText({ type: 'SCALE', value: 2 })).toBe('2x')
    expect(constraintText({ type: 'WIDTH', value: 512 })).toBe('512w')
    expect(constraintText({ type: 'HEIGHT', value: 64 })).toBe('64h')
    expect(constraintText({ type: 'SCALE', value: 100 })).toBeNull()
    expect(constraintText({ type: 'OTHER', value: 2 })).toBeNull()
    expect(constraintText({ type: 'SCALE', value: Number.NaN })).toBeNull()
  })
})

describe('text from outside', () => {
  it('keeps only file-name-safe characters in a suffix', () => {
    expect(cleanSuffix('@2x')).toBe('@2x')
    expect(cleanSuffix('-dark/../../x"<>')).toBe('-dark....x')
    expect(cleanSuffix('a'.repeat(100))).toHaveLength(40)
  })
  it('normalises hex colours', () => {
    expect(normaliseHex('#ABC')).toBe('#aabbcc')
    expect(normaliseHex(' #1A2b3C ')).toBe('#1a2b3c')
    for (const bad of ['red', '#12', '#12345', '#gggggg', 'url(#x)', '#112233; fill:red']) expect(normaliseHex(bad), bad).toBeNull()
  })
})

describe('rows from the Figma export settings', () => {
  it('takes the distinct PNG entries in the order met and ignores invalid ones', () => {
    let n = 0
    const r = rowsFromFigma(
      [
        { pngExports: [{ size: '1x', suffix: '' }, { size: '2x', suffix: '@2x' }] },
        {},
        { pngExports: [{ size: '2x', suffix: '@2x' }, { size: '512w', suffix: '-big/..' }, { size: 'huge', suffix: '' }] }
      ],
      () => `r${++n}`
    )
    expect(r.icons).toBe(2)
    expect(r.rows.map((x) => `${x.size}|${x.suffix}`)).toEqual(['1x|', '2x|@2x', '512w|-big..'])
    expect(r.rows.every((x) => x.colour.kind === 'drawn')).toBe(true)
  })
})

describe('colours', () => {
  const vars = [
    { variable: 'icon/default', collection: 'Theme', modes: { Light: '#111111', Dark: '#EEEEEE' } },
    { variable: 'brand', collection: 'Core', hex: '#336699' },
    { variable: 'broken', collection: 'Core', hex: 'nope' }
  ]
  const options = colourOptions(vars)
  it('lists a variable once per mode, or once when it has one mode, and drops unusable values', () => {
    expect(options.map((o) => `${o.colour.collection}/${o.colour.variable}/${o.colour.mode}=${o.hex}`)).toEqual(['Core/brand/=#336699', 'Theme/icon/default/Light=#111111', 'Theme/icon/default/Dark=#eeeeee'])
  })
  it('resolves drawn, hex and variable colours', () => {
    expect(resolveColour({ kind: 'drawn' }, options)).toBeNull()
    expect(resolveColour({ kind: 'hex', hex: '#ABC' }, options)).toBe('#aabbcc')
    expect(resolveColour({ kind: 'hex', hex: 'red' }, options)).toBeUndefined()
    expect(resolveColour({ kind: 'variable', variable: 'icon/default', collection: 'Theme', mode: 'Dark' }, options)).toBe('#eeeeee')
    expect(resolveColour({ kind: 'variable', variable: 'gone', collection: 'Theme', mode: 'Dark' }, options)).toBeUndefined()
  })
  it('counts one colour with several opacities as single-colour, and skips several colours, gradients and non-themeable icons', () => {
    expect(canRecolour(icon('a'))).toBe(true)
    expect(canRecolour(multi)).toBe(false)
    expect(canRecolour(icon('g', { standalone: svg('<path fill="url(#g)"/>') }))).toBe(false)
    expect(canRecolour(icon('o', { standalone: svg('<path fill="#112233"/>') }))).toBe(false)
  })
})

describe('the plan', () => {
  const a = icon('a')
  const b = icon('b', { width: 24, height: 12 })
  it('gives one file per icon and row, named like Figma: name + suffix', () => {
    const p = planPng([a, b], [row('1', '1x'), row('2', '2x', '@2x'), row('3', '64w', '-64')], [], base)
    expect(p.problems).toEqual([])
    expect(p.items.map((i) => `${i.path} ${i.w}x${i.h}`)).toEqual(['png/cmn-a.png 16x16', 'png/cmn-b.png 24x12', 'png/cmn-a@2x.png 32x32', 'png/cmn-b@2x.png 48x24', 'png/cmn-a-64.png 64x64', 'png/cmn-b-64.png 64x32'])
  })
  it('skips multi-colour icons on a coloured row only, and lists them', () => {
    const p = planPng([a, multi], [row('1', '1x'), row('2', '1x', '-red', { kind: 'hex', hex: '#ff0000' })], [], base)
    expect(p.items.map((i) => i.path)).toEqual(['png/cmn-a.png', 'png/cmn-multi.png', 'png/cmn-a-red.png'])
    expect(p.skipped).toEqual([{ name: 'multi', rowId: '2', reason: expect.stringContaining('several colours') }])
    expect(p.items.find((i) => i.path.endsWith('-red.png'))!.hex).toBe('#ff0000')
  })
  it('says why an icon with fixed colours is skipped on a coloured row', () => {
    const fixed = icon('fixed', { standalone: svg('<path fill="#112233"/>') })
    const p = planPng([fixed], [row('1', '1x', '-red', { kind: 'hex', hex: '#ff0000' })], [], base)
    expect(p.skipped[0].reason).toContain('Themeable colours is off')
  })
  it('reports a bad size, an unknown colour and two rows writing the same file, and keeps the rest', () => {
    const p = planPng([a], [row('1', '12px'), row('2', '1x', '', { kind: 'variable', variable: 'x', collection: '', mode: '' }), row('3', '1x'), row('4', '1x')], [], base)
    expect(p.problems.map((x) => x.rowId)).toEqual(['1', '2', '4'])
    expect(p.problems[2].text).toContain('png/cmn-a.png')
    expect(p.items).toHaveLength(1)
  })
  it('refuses a size that is too big for an icon', () => {
    const p = planPng([icon('wide', { width: 1000, height: 1 })], [row('1', '4000h')], [], base)
    expect(p.items).toEqual([])
    expect(p.problems).toHaveLength(1)
  })
  it('leaves out icons without usable artwork', () => {
    expect(planPng([icon('x', { svgOk: false })], [row('1', '1x')], [], base).items).toEqual([])
  })
})

describe('the SVG that is drawn', () => {
  it('sets size and colour, keeps the opacities and lets strokes scale', () => {
    const s = svgForPng(icon('a'), 64, 32, '#ff0000')
    expect(s.startsWith('<svg width="64" height="32" style="color:#ff0000" xmlns=')).toBe(true)
    expect(s).toContain('fill-opacity="0.5"')
    expect(s).not.toContain('vector-effect')
    expect(s.match(/width="/g)).toHaveLength(2) // the root and the stroke-width variable
  })
  it('draws “as drawn” in the first colour slot and never takes markup from the hex', () => {
    expect(svgForPng(icon('a'), 16, 16, null)).toContain('style="color:#112233"')
    const evil = svgForPng(icon('a'), 16, 16, '#fff"><script>')
    expect(evil).toContain('style="color:#000000"')
    expect(evil).not.toContain('script')
  })
})

describe('the setting', () => {
  it('is checked: rows keep their text, bad rows reject the whole value', () => {
    const ok = { enabled: true, rows: [{ id: 'a', size: '2x', suffix: '@2x', colour: { kind: 'hex', hex: '#ABCDEF' } }, { id: 'b', size: '', suffix: '', colour: { kind: 'drawn' } }] }
    expect(checkSetting('png', ok)?.rows[0].colour).toEqual({ kind: 'hex', hex: '#abcdef' })
    expect(checkSetting('png', ok)?.rows).toHaveLength(2)
    for (const bad of [
      { enabled: true, rows: [{ id: 'a b', size: '2x', suffix: '', colour: { kind: 'drawn' } }] },
      { enabled: true, rows: [{ id: 'a', size: '2x', suffix: '', colour: { kind: 'hex', hex: 'red' } }] },
      { enabled: true, rows: [{ id: 'a', size: '2x', suffix: '', colour: { kind: 'drawn' } }, { id: 'a', size: '1x', suffix: '', colour: { kind: 'drawn' } }] },
      { enabled: true, rows: Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, size: '1x', suffix: '', colour: { kind: 'drawn' } })) }
    ]) expect(checkSetting('png', bad)?.rows).toEqual(DEFAULT_SETTINGS.png.rows)
  })
  it('is off with no rows by default', () => {
    expect(migrateSettings({}).png).toEqual({ enabled: false, rows: [] })
  })
})
