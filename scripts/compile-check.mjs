#!/usr/bin/env node
/**
 * Compiles the generated output with the real toolchains.
 *
 *   node scripts/compile-check.mjs --toolchain <dir> --kind angular|angular-classic|react|vue|svelte|web-component [--dump <dir>]
 *
 * <dir> is a folder whose node_modules has the toolchain for that kind (CI installs one per kind: see .github/workflows/ci.yml).
 * Without --dump, a sample export is generated first (plugin/test/dump.test.ts) with npm packages on, so each package is also built with its own script.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []))
const kind = args.kind
const toolchain = resolve(args.toolchain ?? '')
if (!kind || !args.toolchain) {
  console.error('usage: compile-check.mjs --toolchain <dir> --kind angular|angular-classic|react|vue|svelte|web-component [--dump <dir>]')
  process.exit(2)
}
const root = resolve(fileURLToPath(import.meta.url), '../..')
let dump = args.dump ? resolve(args.dump) : null
if (!dump) {
  dump = mkdtempSync(join(tmpdir(), 'icon-export-'))
  execFileSync('npx', ['vitest', 'run', 'test/dump.test.ts'], { cwd: join(root, 'plugin'), env: { ...process.env, DUMP_DIR: dump, DUMP_NPM: '1' }, stdio: 'inherit' })
}
const dir = join(dump, kind)
if (!existsSync(dir)) {
  console.error(`No ${kind}/ folder in ${dump}`)
  process.exit(2)
}

// the project under test sits in a sibling folder so it can see the toolchain's node_modules
const work = mkdtempSync(join(tmpdir(), `compile-${kind}-`))
symlinkSync(join(toolchain, 'node_modules'), join(work, 'node_modules'))
const src = join(work, 'src')
execFileSync('cp', ['-R', dir, src])
const bin = (name) => join(toolchain, 'node_modules', '.bin', name)

// TypeScript 5+ wants "bundler" resolution (and TypeScript 6 drops "node10" entirely); 4.x only knows "node"
const tsMajor = Number(JSON.parse(readFileSync(join(toolchain, 'node_modules', 'typescript', 'package.json'), 'utf8')).version.split('.')[0])
const base = { strict: true, skipLibCheck: true, noEmit: false, outDir: join(work, 'out'), rootDir: src, target: 'ES2022', module: 'ES2022', moduleResolution: tsMajor >= 5 ? 'bundler' : 'node', lib: ['ES2022', 'DOM'], declaration: false }
const ts = (extra, files) => writeFileSync(join(work, 'tsconfig.json'), JSON.stringify({ compilerOptions: { ...base, ...extra }, include: files ?? ['src/**/*.ts', 'src/**/*.tsx'] }, null, 2))

if (kind.startsWith('angular')) {
  // a consumer written the way the README tells you to (a closing tag, bound inputs) must pass the strict template check of this Angular version:
  // Angular before 15.1 rejects a self-closing component tag, so the snippets must not use one
  writeFileSync(
    join(src, 'zz-consumer.ts'),
    `import { Component } from '@angular/core';\nimport { CmnIcon } from './cmn-icon.component';\n\n@Component({ selector: 'app-consumer', standalone: true, imports: [CmnIcon], template: '<cmn-icon name="bars-multipath" [size]="24" color="red" label="x"></cmn-icon>' })\nexport class AppConsumer {}\n`
  )
  ts({ experimentalDecorators: true, useDefineForClassFields: false }, ['src/**/*.ts'])
  const cfg = JSON.parse(execFileSync('cat', [join(work, 'tsconfig.json')]))
  cfg.angularCompilerOptions = { strictTemplates: true, strictInjectionParameters: true }
  writeFileSync(join(work, 'tsconfig.json'), JSON.stringify(cfg, null, 2))
  execFileSync(bin('ngc'), ['-p', join(work, 'tsconfig.json')], { stdio: 'inherit', cwd: work })
} else if (kind === 'react') {
  ts({ jsx: 'react-jsx', moduleResolution: tsMajor >= 5 ? 'bundler' : 'node', verbatimModuleSyntax: true, isolatedModules: true }, ['src/**/*.ts', 'src/**/*.tsx'])
  execFileSync(bin('tsc'), ['-p', join(work, 'tsconfig.json')], { stdio: 'inherit', cwd: work })
} else if (kind === 'vue') {
  ts({ moduleResolution: tsMajor >= 5 ? 'bundler' : 'node', verbatimModuleSyntax: true, isolatedModules: true }, ['src/**/*.ts'])
  execFileSync(bin('tsc'), ['-p', join(work, 'tsconfig.json')], { stdio: 'inherit', cwd: work })
} else if (kind === 'svelte') {
  // svelte-check compiles every .svelte file and type-checks the TypeScript around it (and in it) in one run
  ts({ moduleResolution: tsMajor >= 5 ? 'bundler' : 'node', verbatimModuleSyntax: true, isolatedModules: true }, ['src/**/*.ts', 'src/**/*.svelte'])
  execFileSync(bin('svelte-check'), ['--tsconfig', join(work, 'tsconfig.json'), '--workspace', work, '--fail-on-warnings'], { stdio: 'inherit', cwd: work })
} else if (kind === 'web-component') {
  ts({ allowJs: true, checkJs: true, strict: false }, ['src/**/*.js', 'src/**/*.d.ts'])
  execFileSync(bin('tsc'), ['-p', join(work, 'tsconfig.json')], { stdio: 'inherit', cwd: work })
} else {
  console.error('unknown kind ' + kind)
  process.exit(2)
}
// an npm-ready package (the export has "npm packages" switched on) must also build with its own script, the way a publisher would run it
if (existsSync(join(src, 'package.json')) && args.build !== 'false') {
  const pkgJson = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'))
  if (pkgJson.scripts?.build) execFileSync('npm', ['run', 'build', '--silent'], { stdio: 'inherit', cwd: src, env: { ...process.env, PATH: `${join(toolchain, 'node_modules', '.bin')}:${process.env.PATH}` } })
  // every file the package.json points at must exist after the build
  const pkg = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'))
  const refs = new Set([pkg.main, pkg.module, pkg.types, pkg.svelte, pkg.typings].filter(Boolean))
  const walk = (v) => (typeof v === 'string' ? refs.add(v) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : null)
  walk(pkg.exports)
  for (const ref of refs) if (ref.startsWith('./') && !ref.includes('*') && !existsSync(join(src, ref))) throw new Error(`package.json points at ${ref}, which does not exist after the build`)
  console.log(`ok: ${kind} package builds (npm run build)`)
}
// Storybook stories (the export has them switched on): type-checked against the real Storybook types, next to the package they import
const storiesDir = join(dump, 'stories')
const storyFile = { react: /\.react\.stories\.tsx$/, vue: /\.vue\.stories\.ts$/, svelte: /\.svelte\.stories\.ts$|\.svelte$/ }[kind]
// (only in toolchains that have Storybook installed: the Svelte 4 one does not)
const storybookPkg = { react: 'react', vue: 'vue3', svelte: 'svelte' }[kind]
const hasStorybook = !!storybookPkg && existsSync(join(toolchain, 'node_modules', '@storybook', storybookPkg))
if (storyFile && existsSync(storiesDir) && readdirSync(storiesDir).some((f) => storyFile.test(f)) && !hasStorybook) console.log(`skipped: ${kind} Storybook stories (no Storybook in this toolchain)`)
if (storyFile && hasStorybook && existsSync(storiesDir) && readdirSync(storiesDir).some((f) => storyFile.test(f))) {
  const w = mkdtempSync(join(tmpdir(), `stories-${kind}-`))
  symlinkSync(join(toolchain, 'node_modules'), join(w, 'node_modules'))
  execFileSync('cp', ['-R', dir, join(w, kind)])
  mkdirSync(join(w, 'stories'))
  for (const f of readdirSync(storiesDir)) if (storyFile.test(f)) execFileSync('cp', [join(storiesDir, f), join(w, 'stories', f)])
  const cfg = { compilerOptions: { ...base, outDir: join(w, 'out'), rootDir: w, noEmit: true, verbatimModuleSyntax: true, isolatedModules: true, ...(kind === 'react' ? { jsx: 'react-jsx' } : {}) }, include: [`${kind}/**/*.ts`, ...(kind === 'react' ? [`${kind}/**/*.tsx`, 'stories/*.tsx'] : []), 'stories/*.ts', ...(kind === 'svelte' ? ['stories/*.svelte', `${kind}/**/*.svelte`] : [])] }
  writeFileSync(join(w, 'tsconfig.json'), JSON.stringify(cfg, null, 2))
  if (kind === 'svelte') execFileSync(bin('svelte-check'), ['--tsconfig', join(w, 'tsconfig.json'), '--workspace', w, '--fail-on-warnings'], { stdio: 'inherit', cwd: w })
  else execFileSync(bin('tsc'), ['-p', join(w, 'tsconfig.json')], { stdio: 'inherit', cwd: w })
  console.log(`ok: ${kind} Storybook stories type-check`)
}
console.log(`ok: ${kind} compiles (${readdirSync(src).length} top-level entries)`)
