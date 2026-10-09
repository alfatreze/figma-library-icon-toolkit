import { describe, expect, it } from 'vitest'
import { allIconsDoc, hostCss, loadCategoryOfName, preloadDoc, resolveName } from '../src/core/generators/runtime-text'
import { BuildInput } from '../src/core/generators/common'
import { DEFAULT_SETTINGS } from '../src/types'

const b = { settings: { ...DEFAULT_SETTINGS, namespace: 'acme' } } as unknown as BuildInput

describe('shared generated-code fragments', () => {
  it('resolve a renamed icon through the deprecated map', () => {
    expect(resolveName(b, 'requested')).toBe('(ACME_DEPRECATED as Record<string, string>)[requested] ?? requested')
  })
  it('start the category load only when the category is known', () => {
    expect(loadCategoryOfName(b, 'this.loadCategory', '    ')).toBe('    const category = ACME_CATEGORY_OF[name];\n    if (category !== undefined) void this.loadCategory(category);')
  })
  it('word the docs the same way in every framework', () => {
    expect(preloadDoc("preload('arrows')")).toBe("Warm categories ahead of use, e.g. preload('arrows').")
    expect(allIconsDoc('provideAcmeIcons')).toContain('Puts ALL icons in your main bundle; prefer provideAcmeIcons(…)')
  })
  it('size every element from the same CSS variable', () => {
    expect(hostCss('acme')).toContain('width:var(--acme-icon-size,1em);height:var(--acme-icon-size,1em)')
  })
})
