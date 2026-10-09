#!/usr/bin/env node
/**
 * Icon Library Toolkit: local companion ("direct export to project").
 *
 * The Figma plugin cannot write to your disk, so it sends the generated files to this small local server,
 * which writes them into a folder of YOUR project and (optionally) commits them with git.
 *
 *   node tools/icon-sync.mjs --dir ../my-app                 # writes into <dir>/<subdir chosen in the plugin>
 *   node tools/icon-sync.mjs --dir ../my-app --git           # allow commits (and branch switching) in that repo
 *   node tools/icon-sync.mjs --dir ../my-app --git --allow-push
 *
 * Safety: listens on 127.0.0.1 only · every request needs the token printed at start · writes only inside --dir ·
 * only deletes files that an earlier sync created (listed in <subdir>/.icon-toolkit.json) · never runs arbitrary commands.
 */
import { execFile } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const MAX_BODY = 200 * 1024 * 1024
const MANAGED = '.icon-toolkit.json'

export function parseArgs(argv) {
  const out = { dir: '', port: 5199, git: false, allowPush: false, token: '' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dir') out.dir = argv[++i] ?? ''
    else if (a === '--port') out.port = Number(argv[++i])
    else if (a === '--git') out.git = true
    else if (a === '--allow-push') out.allowPush = true
    else if (a === '--token') out.token = argv[++i] ?? ''
    else if (a === '--help' || a === '-h') out.help = true
  }
  return out
}

/** relative, forward-slash, no traversal; returns null when unsafe */
export function safeRel(p) {
  if (typeof p !== 'string' || !p || p.includes('\0') || p.includes('\\') || isAbsolute(p) || /^[A-Za-z]:/.test(p)) return null
  const n = normalize(p)
  if (n.startsWith('..') || n.split(sep).includes('..')) return null
  return n.split(sep).join('/')
}

function walk(dir, base = dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, base))
    else out.push(relative(base, full).split(sep).join('/'))
  }
  return out
}

function pruneEmptyDirs(dir, stop) {
  let d = dir
  while (d.startsWith(stop) && d !== stop) {
    try {
      if (readdirSync(d).length) return
      rmdirSync(d)
    } catch {
      return
    }
    d = dirname(d)
  }
}

export function planSync(root, subdir, files) {
  const sub = safeRel(subdir || '.') ?? null
  if (sub === null) throw httpError(400, 'Invalid folder name')
  const target = resolve(root, sub)
  if (target !== root && !target.startsWith(root + sep)) throw httpError(400, 'Folder is outside the project')
  const managedPath = join(target, MANAGED)
  let previous = []
  if (existsSync(managedPath)) {
    try {
      previous = JSON.parse(readFileSync(managedPath, 'utf8')).files ?? []
    } catch {
      previous = []
    }
  }
  const next = new Map()
  for (const [rawPath, content] of Object.entries(files)) {
    const rel = safeRel(rawPath)
    if (!rel) throw httpError(400, `Unsafe path: ${rawPath}`)
    if (rel === MANAGED) throw httpError(400, 'Reserved file name')
    if (typeof content !== 'string') throw httpError(400, `File content must be text: ${rawPath}`)
    next.set(rel, content)
  }
  const added = []
  const changed = []
  const unchanged = []
  for (const [rel, content] of next) {
    const full = join(target, rel)
    if (!existsSync(full)) added.push(rel)
    else if (readFileSync(full, 'utf8') !== content) changed.push(rel)
    else unchanged.push(rel)
  }
  const removed = previous.filter((p) => safeRel(p) && !next.has(p) && existsSync(join(target, p)))
  return { target, sub, next, added, changed, unchanged, removed, managedPath }
}

function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

async function git(root, args) {
  const { stdout } = await run('git', ['-C', root, ...args], { maxBuffer: 10 * 1024 * 1024 })
  return stdout.trim()
}

async function gitInfo(root) {
  try {
    const top = await git(root, ['rev-parse', '--show-toplevel'])
    const branch = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const dirty = (await git(root, ['status', '--porcelain'])).split('\n').filter(Boolean)
    return { repo: true, top, branch, dirtyCount: dirty.length }
  } catch {
    return { repo: false }
  }
}

export function startServer(opts) {
  const root = resolve(opts.dir)
  const token = opts.token || randomBytes(16).toString('hex')
  const server = createServer(async (req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'content-type, x-toolkit-token',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '600'
    }
    const send = (status, body) => {
      res.writeHead(status, { ...cors, 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, cors)
        res.end()
        return
      }
      const given = String(req.headers['x-toolkit-token'] ?? '')
      const a = Buffer.from(given)
      const b = Buffer.from(token)
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw httpError(401, 'Invalid token')

      if (req.method === 'GET' && req.url === '/status') {
        const info = opts.git ? await gitInfo(root) : { repo: false, disabled: true }
        send(200, { ok: true, dir: root, git: info, allowGit: !!opts.git, allowPush: !!opts.allowPush })
        return
      }
      if (req.method === 'POST' && req.url === '/export') {
        let size = 0
        const chunks = []
        for await (const c of req) {
          size += c.length
          if (size > MAX_BODY) throw httpError(413, 'Payload too large')
          chunks.push(c)
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const plan = planSync(root, body.subdir ?? 'icons', body.files ?? {})
        const summary = { added: plan.added, changed: plan.changed, removed: plan.removed, unchanged: plan.unchanged.length }
        if (body.dryRun) {
          send(200, { ok: true, dryRun: true, ...summary })
          return
        }
        for (const [rel, content] of plan.next) {
          const full = join(plan.target, rel)
          mkdirSync(dirname(full), { recursive: true })
          writeFileSync(full, content)
        }
        for (const rel of plan.removed) {
          unlinkSync(join(plan.target, rel))
          pruneEmptyDirs(dirname(join(plan.target, rel)), plan.target)
        }
        writeFileSync(plan.managedPath, JSON.stringify({ files: [...plan.next.keys()], syncedAt: new Date().toISOString() }, null, 2) + '\n')

        let committed = null
        if (body.commit) {
          if (!opts.git) throw httpError(403, 'Git is disabled. Start the companion with --git')
          const info = await gitInfo(root)
          if (!info.repo) throw httpError(400, 'The folder is not a git repository')
          if (body.branch) {
            const branch = String(body.branch)
            if (!/^[\w./-]{1,100}$/.test(branch) || branch.startsWith('-')) throw httpError(400, 'Invalid branch name')
            const others = (await git(root, ['status', '--porcelain'])).split('\n').filter(Boolean).filter((l) => !l.slice(3).startsWith(plan.sub + '/') && l.slice(3) !== plan.sub)
            if (others.length) throw httpError(409, 'The repo has uncommitted changes outside the icons folder; commit or stash them before switching branches')
            const exists = (await git(root, ['branch', '--list', branch])).length > 0
            await git(root, exists ? ['switch', branch] : ['switch', '-c', branch])
          }
          await git(root, ['add', '-A', '--', plan.sub])
          const staged = await git(root, ['diff', '--cached', '--name-only', '--', plan.sub])
          if (staged) {
            await git(root, ['commit', '-m', String(body.message || 'chore(icons): update from Figma'), '--', plan.sub])
            committed = { branch: await git(root, ['rev-parse', '--abbrev-ref', 'HEAD']), sha: await git(root, ['rev-parse', '--short', 'HEAD']), files: staged.split('\n').length }
          } else committed = { branch: info.branch, sha: null, files: 0 }
          if (body.push) {
            if (!opts.allowPush) throw httpError(403, 'Push is disabled. Start the companion with --allow-push')
            await git(root, ['push', '-u', 'origin', committed.branch])
            committed.pushed = true
          }
        }
        send(200, { ok: true, dryRun: false, ...summary, committed })
        return
      }
      throw httpError(404, 'Not found')
    } catch (e) {
      send(e.status ?? 500, { ok: false, error: e.message })
    }
  })
  return new Promise((resolveStart) => {
    server.listen(opts.port, '127.0.0.1', () => resolveStart({ server, token, port: server.address().port, root }))
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help || !opts.dir) {
    console.log('Usage: node tools/icon-sync.mjs --dir <project folder> [--port 5199] [--git] [--allow-push] [--token <fixed token>]')
    process.exit(opts.help ? 0 : 1)
  }
  if (!existsSync(resolve(opts.dir))) {
    console.error(`Folder not found: ${resolve(opts.dir)}`)
    process.exit(1)
  }
  const { port, token, root } = await startServer(opts)
  console.log(`Icon Library Toolkit companion running\n  project : ${root}\n  url     : http://localhost:${port}\n  token   : ${token}\n  git     : ${opts.git ? (opts.allowPush ? 'commits + push allowed' : 'commits allowed, push disabled') : 'disabled (add --git)'}\nPaste the URL and token into the plugin (Settings → Project sync). Ctrl+C to stop.`)
}
