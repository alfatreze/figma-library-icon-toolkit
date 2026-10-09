#!/usr/bin/env node
/**
 * Size budgets: fails when a generated format or the plugin bundle grows past its budget.
 *
 *   node scripts/size-budget.mjs [--dump <dir>] [--print]
 *
 * Export budgets are measured on the sample export of plugin/test/dump.test.ts (6 fixture icons), raw bytes summed per top-level
 * folder, so they catch template bloat (a bigger component, an extra file per icon). Plugin budgets use plugin/build/*.js.
 * Raise a budget on purpose in scripts/size-budgets.json, in the same commit that explains why.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const args = process.argv.slice(2)
const flag = (n) => args.includes('--' + n)
const val = (n) => args[args.indexOf('--' + n) + 1]
let dump = flag('dump') ? resolve(val('dump')) : null
if (!dump) {
  dump = mkdtempSync(join(tmpdir(), 'icon-size-'))
  execFileSync('npx', ['vitest', 'run', 'test/dump.test.ts'], { cwd: join(root, 'plugin'), env: { ...process.env, DUMP_DIR: dump }, stdio: 'ignore' })
}

const sizeOf = (dir) => {
  let total = 0
  let files = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      const r = sizeOf(p)
      total += r.total
      files += r.files
    } else {
      total += statSync(p).size
      files++
    }
  }
  return { total, files }
}

const measured = { export: {}, files: {}, plugin: {} }
for (const e of readdirSync(dump, { withFileTypes: true })) {
  if (e.isDirectory()) {
    const r = sizeOf(join(dump, e.name))
    measured.export[e.name] = r.total
    measured.files[e.name] = r.files
  }
}
for (const f of ['main.js', 'ui.js']) {
  try {
    measured.plugin[f] = statSync(join(root, 'plugin', 'build', f)).size
  } catch {
    /* plugin not built: those budgets are skipped */
  }
}

if (flag('print')) {
  console.log(JSON.stringify(measured, null, 2))
  process.exit(0)
}

const budgets = JSON.parse(readFileSync(join(root, 'scripts', 'size-budgets.json'), 'utf8'))
const failures = []
const check = (group, label, actual, limit) => {
  const unit = group === 'files' ? 'files' : 'B'
  const status = actual <= limit ? 'ok  ' : 'FAIL'
  console.log(`${status} ${group}/${label}: ${actual} ${unit} (budget ${limit} ${unit}, ${Math.round((actual / limit) * 100)}%)`)
  if (actual > limit) failures.push(`${group}/${label}: ${actual} ${unit} > ${limit} ${unit}`)
}
for (const [k, limit] of Object.entries(budgets.export)) if (k in measured.export) check('export', k, measured.export[k], limit)
for (const [k, limit] of Object.entries(budgets.files)) if (k in measured.files) check('files', k, measured.files[k], limit)
for (const [k, limit] of Object.entries(budgets.plugin)) if (k in measured.plugin) check('plugin', k, measured.plugin[k], limit)
const unbudgeted = Object.keys(measured.export).filter((k) => !(k in budgets.export))
if (unbudgeted.length) {
  console.error(`No budget for: ${unbudgeted.join(', ')} (add them to scripts/size-budgets.json)`)
  process.exit(1)
}
if (failures.length) {
  console.error(`\n${failures.length} budget(s) exceeded:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
