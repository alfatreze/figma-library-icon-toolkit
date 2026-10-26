import { describe, expect, it } from 'vitest'
import { buildFiles, Files } from '../src/core/generators'
import { npmLicense, npmScope } from '../src/core/generators/npm'
import { checkSetting, migrateSettings } from '../src/core/settingsSchema'
import { processIcons } from '../src/core/process'
import { emptyFacts } from '../src/main/facts'
import { DEFAULT_SETTINGS, RawIcon, Settings } from '../src/types'

const raw = (name: string): RawIcon => ({
  key: name, nodeId: '1:' + name, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: name, variantProps: {}, description: '',
  width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 }, facts: { ...emptyFacts(), leafCount: 1 },
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M2 2h20v20H2z" fill="#112233"/></svg>', categoryCtx: {}
})
const all = Object.fromEntries(Object.keys(DEFAULT_SETTINGS.formats).map((k) => [k, true])) as Settings['formats']

function build(npm: Partial<Settings['npm']>, formats: Partial<Settings['formats']> = {}): Files {
  const s: Settings = { ...DEFAULT_SETTINGS, namespace: 'cmn', formats: { ...all, ...formats }, npm: { enabled: true, scope: '@acme', license: 'MIT', ...npm } }
  const p = processIcons([raw('home'), raw('search')], s, {})
  return buildFiles({ allIcons: p.icons, settings: s, grid: p.grid, tier: p.tier, generatedAt: '2026-01-01', release: { version: '2.3.0', deprecated: [], diff: null } })
}
const pkg = (files: Files, dir: string) => JSON.parse(files[`${dir}/package.json`])

describe('npm-ready packages', () => {
  it('adds nothing unless switched on', () => {
    const files = build({ enabled: false })
    expect(Object.keys(files).filter((p) => p.endsWith('package.json'))).toEqual([])
  })

  it('gives every component package and svg/ a publishable package.json: ESM, types, the export version, no side effects', () => {
    const files = build({})
    for (const [dir, suffix] of [['react', 'react'], ['vue', 'vue'], ['svelte', 'svelte'], ['angular', 'angular'], ['web-component', 'web-component'], ['svg', 'svg']]) {
      const p = pkg(files, dir)
      expect(p.name, dir).toBe(`@acme/cmn-icons-${suffix}`)
      expect(p.version, dir).toBe('2.3.0')
      expect(p.license, dir).toBe('MIT')
      expect(p.type, dir).toBe('module')
    }
    for (const dir of ['react', 'vue', 'svelte', 'angular', 'svg']) expect(pkg(files, dir).sideEffects, dir).toBe(false)
    for (const dir of ['react', 'vue']) {
      const p = pkg(files, dir)
      expect(p.exports['.']).toEqual({ types: './dist/index.d.ts', import: './dist/index.js' })
      expect(p.files).toEqual(['dist'])
      expect(JSON.parse(files[`${dir}/tsconfig.build.json`]).compilerOptions).toMatchObject({ declaration: true, outDir: 'dist', moduleResolution: 'Bundler' })
    }
    expect(JSON.parse(files['react/tsconfig.build.json']).compilerOptions.jsx).toBe('react-jsx')
  })

  it('does not call the Web Component side-effect free: importing it registers the element', () => {
    const p = pkg(build({}), 'web-component')
    expect(p.sideEffects).toEqual(['./cmn-icon.js'])
    expect(p.main).toBe('./cmn-icon.js')
    expect(p.types).toBe('./cmn-icon.d.ts')
  })

  it('Svelte is packaged with svelte-package (never reading an earlier dist/), Angular with ng-packagr and published from dist/', () => {
    const files = build({})
    expect(pkg(files, 'svelte').scripts.build).toContain('rmSync')
    expect(pkg(files, 'svelte').scripts.build).toContain('svelte-package -i . -o dist')
    expect(pkg(files, 'svelte').exports['.']).toMatchObject({ svelte: './dist/index.js' })
    expect(files['svelte/tsconfig.json']).toContain('verbatimModuleSyntax')
    expect(pkg(files, 'angular').scripts.release).toBe('npm run build && npm publish ./dist')
    expect(JSON.parse(files['angular/ng-package.json']).lib.entryFile).toBe('index.ts')
    expect(files['angular/README.md']).toContain('npm run release')
  })

  it('leaves Angular 14+ out: ng-packagr 14 cannot bundle the lazy category chunks', () => {
    const files = build({}, { angularModern: false, angularClassic: true })
    expect(files['angular-classic/package.json']).toBeUndefined()
    expect(files['angular/package.json']).toBeUndefined()
  })

  it('only packages what is exported', () => {
    const files = build({}, Object.fromEntries(Object.keys(all).map((k) => [k, k === 'react'])) as Settings['formats'])
    expect(Object.keys(files).filter((p) => p.endsWith('package.json'))).toEqual(['react/package.json'])
  })

  it('writes a README per package with the install line and the right name', () => {
    const files = build({})
    expect(files['react/README.md']).toContain('npm install @acme/cmn-icons-react')
    expect(files['react/README.md']).toContain('<CmnIcon name="home"')
    expect(files['vue/README.md']).toContain(':size="24"')
    expect(files['svelte/README.md']).toContain('<CmnIcon name="home"')
  })

  it('falls back instead of writing a bad scope or licence into package.json', () => {
    const files = build({ scope: '@Evil/../x"', license: 'MIT"; rm -rf' })
    expect(pkg(files, 'react').name).toBe('cmn-icons-react')
    expect(pkg(files, 'react').license).toBe('UNLICENSED')
    expect(npmScope({ settings: { npm: { scope: ' @acme ' } } } as never)).toBe('@acme')
    expect(npmLicense({ settings: { npm: { license: 'MIT OR Apache-2.0' } } } as never)).toBe('MIT OR Apache-2.0')
  })

  it('is a validated team setting, off by default', () => {
    expect(migrateSettings({}).npm).toEqual({ enabled: false, scope: '', license: 'UNLICENSED' })
    expect(checkSetting('npm', { enabled: true, scope: '@acme', license: 'MIT' })).toEqual({ enabled: true, scope: '@acme', license: 'MIT' })
    expect(checkSetting('npm', { enabled: true, scope: 'acme', license: 'MIT' })?.scope).toBe('')
    expect(checkSetting('npm', { enabled: true, scope: '', license: '<script>' })?.license).toBe('UNLICENSED')
  })
})
