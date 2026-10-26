import { describe, expect, it } from 'vitest'
import { hasCategoryPrefix, matchesPattern, patternProblem } from '../src/core/nameRules'
import { checkSetting, migrateSettings } from '../src/core/settingsSchema'
import { processIcons } from '../src/core/process'
import { RULES } from '../src/core/rules'
import { emptyFacts } from '../src/main/facts'
import { DEFAULT_SETTINGS, RawIcon, Settings } from '../src/types'

const raw = (rawName: string): RawIcon => ({
  key: rawName, nodeId: '1:' + rawName, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName, variantProps: {}, description: 'tag',
  width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: { ...emptyFacts(), leafCount: 1 },
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 2h20v20H2z" fill="#112233"/></svg>', categoryCtx: {}
})
const findings = (settings: Partial<Settings>, names: string[]) => {
  const s: Settings = { ...DEFAULT_SETTINGS, ...settings }
  return Object.fromEntries(processIcons(names.map(raw), s, {}).icons.map((i) => [i.name, i.findings.filter((f) => f.ruleId.startsWith('name-')).map((f) => f.ruleId)]))
}

describe('naming pattern', () => {
  it('accepts a verb-noun pattern a team writes itself', () => {
    const p = '^(add|remove|edit)-[a-z-]+$'
    expect(matchesPattern('add-user', p)).toBe(true)
    expect(matchesPattern('user-add', p)).toBe(false)
    expect(matchesPattern('anything', '')).toBe(true)
  })
  it('refuses a pattern that is invalid, too long or can run for a very long time, and then skips the check', () => {
    expect(patternProblem('(')).toMatch(/not a valid/)
    expect(patternProblem('a'.repeat(201))).toMatch(/longer than 200/)
    expect(patternProblem('(a+)+$')).toMatch(/very long time/)
    expect(patternProblem('^[a-z-]+$')).toBeNull()
    expect(matchesPattern('whatever', '(a+)+$')).toBe(true)
    expect(matchesPattern('whatever', '(')).toBe(true)
  })
})

describe('category prefix', () => {
  it('wants the last category folder in front of the name; no category, no check', () => {
    expect(hasCategoryPrefix('arrows-left', ['arrows'])).toBe(true)
    expect(hasCategoryPrefix('arrows', ['arrows'])).toBe(true)
    expect(hasCategoryPrefix('left', ['arrows'])).toBe(false)
    expect(hasCategoryPrefix('arrows-left', ['ui', 'arrows'])).toBe(true)
    expect(hasCategoryPrefix('left', [])).toBe(true)
    expect(hasCategoryPrefix('arrowsleft', ['arrows'])).toBe(false)
  })
})

describe('as audit findings', () => {
  it('are off by default', () => {
    expect(findings({}, ['nav/Home'])).toEqual({ home: [] })
  })
  it('warn about a name that does not match the pattern, and about one that does not start with its category', () => {
    const r = findings({ nameRules: { pattern: '^(add|open)-[a-z-]+$', categoryPrefix: true } }, ['nav/Home', 'nav/nav-back', 'nav/open-menu'])
    expect(r.home).toEqual(['name-pattern', 'name-category-prefix'])
    expect(r['nav-back']).toEqual(['name-pattern'])
    expect(r['open-menu']).toEqual(['name-category-prefix'])
  })
  it('are warnings, never errors, so they do not block the export', () => {
    const icons = processIcons([raw('nav/Home')], { ...DEFAULT_SETTINGS, nameRules: { pattern: '^zzz$', categoryPrefix: true } }, {}).icons
    expect(icons[0].findings.filter((f) => f.ruleId.startsWith('name-')).every((f) => f.severity === 'warn')).toBe(true)
  })
  it('have a rule description in the fix plan, in the naming step', () => {
    expect(RULES['name-pattern'].step).toBe(2)
    expect(RULES['name-category-prefix'].step).toBe(2)
  })
})

describe('the setting', () => {
  it('is a validated team setting, off by default', () => {
    expect(migrateSettings({}).nameRules).toEqual({ pattern: '', categoryPrefix: false })
    expect(checkSetting('nameRules', { pattern: '^a$', categoryPrefix: true })).toEqual({ pattern: '^a$', categoryPrefix: true })
    expect(checkSetting('nameRules', { pattern: 'x'.repeat(201), categoryPrefix: true })?.pattern).toBe('')
  })
})
