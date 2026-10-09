import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readCatalog, safeRel, startServer } from './icon-sync.mjs'

const post = (s, body, token = s.token) =>
  fetch(`http://127.0.0.1:${s.port}/export`, { method: 'POST', headers: { 'x-toolkit-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, json: await r.json() }))

test('safeRel rejects traversal and absolute paths', () => {
  for (const bad of ['../x', 'a/../../x', '/etc/passwd', 'C:/x', 'a\\b', '']) assert.equal(safeRel(bad), null, bad)
  assert.equal(safeRel('svg/a.svg'), 'svg/a.svg')
})

test('token required, dry run, write, update, stale removal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ilt-'))
  const s = await startServer({ dir, port: 0 })
  try {
    assert.equal((await post(s, { files: {} }, 'wrong')).status, 401)
    assert.equal((await post(s, { files: { '../evil.txt': 'x' } })).status, 400)

    const dry = await post(s, { subdir: 'icons', dryRun: true, files: { 'a.svg': '1', 'b.svg': '2' } })
    assert.deepEqual(dry.json.added.sort(), ['a.svg', 'b.svg'])
    assert.equal(existsSync(join(dir, 'icons', 'a.svg')), false, 'dry run must not write')

    const first = await post(s, { subdir: 'icons', files: { 'a.svg': '1', 'b.svg': '2' } })
    assert.equal(first.json.added.length, 2)
    assert.equal(readFileSync(join(dir, 'icons', 'a.svg'), 'utf8'), '1')

    writeFileSync(join(dir, 'icons', 'mine.txt'), 'not managed')
    const second = await post(s, { subdir: 'icons', files: { 'a.svg': 'changed' } })
    assert.deepEqual(second.json.changed, ['a.svg'])
    assert.deepEqual(second.json.removed, ['b.svg'])
    assert.equal(existsSync(join(dir, 'icons', 'b.svg')), false)
    assert.equal(existsSync(join(dir, 'icons', 'mine.txt')), true, 'unmanaged files are never deleted')
  } finally {
    s.server.close()
  }
})

test('git: commit on a new branch, refuses dirty repo outside the folder, push disabled', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ilt-git-'))
  const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).trim()
  g('init', '-q', '-b', 'main')
  g('config', 'user.email', 't@example.com')
  g('config', 'user.name', 'T')
  writeFileSync(join(dir, 'README.md'), 'x')
  g('add', '.')
  g('commit', '-q', '-m', 'init')
  const s = await startServer({ dir, port: 0, git: true })
  try {
    const ok = await post(s, { subdir: 'icons', commit: true, branch: 'icons/update', message: 'icons', files: { 'a.svg': '1' } })
    assert.equal(ok.status, 200, JSON.stringify(ok.json))
    assert.equal(ok.json.committed.branch, 'icons/update')
    assert.equal(g('log', '-1', '--format=%s'), 'icons')

    writeFileSync(join(dir, 'README.md'), 'dirty')
    const dirty = await post(s, { subdir: 'icons', commit: true, branch: 'other', files: { 'a.svg': '2' } })
    assert.equal(dirty.status, 409)

    g('checkout', '-q', '--', 'README.md')
    const push = await post(s, { subdir: 'icons', commit: true, push: true, files: { 'a.svg': '3' } })
    assert.equal(push.status, 403)
  } finally {
    s.server.close()
  }
})

test('readCatalog reads <subdir>/icons.json and refuses escaping paths', async () => {
  const { mkdirSync } = await import('node:fs')
  const root = mkdtempSync(join(tmpdir(), 'cat-'))
  mkdirSync(join(root, 'icons'))
  writeFileSync(join(root, 'icons', 'icons.json'), '{"icons":[]}')
  assert.equal(readCatalog(root, 'icons'), '{"icons":[]}')
  assert.equal(readCatalog(root, 'nope'), null)
  assert.throws(() => readCatalog(root, '../x'))
})
