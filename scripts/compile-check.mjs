#!/usr/bin/env node
/**
 * Compiles the generated output with the real toolchains.
 *
 *   node scripts/compile-check.mjs --toolchain <dir> --kind angular|angular-classic|react|web-component [--dump <dir>]
 *
 * <dir> is a folder whose node_modules has the toolchain for that kind (CI installs one per kind: see .github/workflows/ci.yml).
 * Without --dump, a sample export is generated first (plugin/test/dump.test.ts).
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
  console.error('usage: compile-check.mjs --toolchain <dir> --kind angular|angular-classic|react|web-component [--dump <dir>]')
  process.exit(2)
}
const root = resolve(fileURLToPath(import.meta.url), '../..')
let dump = args.dump ? resolve(args.dump) : null
if (!dump) {
  dump = mkdtempSync(join(tmpdir(), 'icon-export-'))
  execFileSync('npx', ['vitest', 'run', 'test/dump.test.ts'], { cwd: join(root, 'plugin'), env: { ...process.env, DUMP_DIR: dump }, stdio: 'inherit' })
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
  ts({ experimentalDecorators: true, useDefineForClassFields: false }, ['src/**/*.ts'])
  const cfg = JSON.parse(execFileSync('cat', [join(work, 'tsconfig.json')]))
  cfg.angularCompilerOptions = { strictTemplates: true, strictInjectionParameters: true }
  writeFileSync(join(work, 'tsconfig.json'), JSON.stringify(cfg, null, 2))
  execFileSync(bin('ngc'), ['-p', join(work, 'tsconfig.json')], { stdio: 'inherit', cwd: work })
} else if (kind === 'react') {
  ts({ jsx: 'react-jsx', moduleResolution: tsMajor >= 5 ? 'bundler' : 'node' }, ['src/**/*.ts', 'src/**/*.tsx'])
  execFileSync(bin('tsc'), ['-p', join(work, 'tsconfig.json')], { stdio: 'inherit', cwd: work })
} else if (kind === 'web-component') {
  ts({ allowJs: true, checkJs: true, strict: false }, ['src/**/*.js', 'src/**/*.d.ts'])
  execFileSync(bin('tsc'), ['-p', join(work, 'tsconfig.json')], { stdio: 'inherit', cwd: work })
} else {
  console.error('unknown kind ' + kind)
  process.exit(2)
}
console.log(`ok: ${kind} compiles (${readdirSync(src).length} top-level entries)`)
