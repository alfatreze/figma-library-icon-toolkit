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
 * only deletes files that an earlier sync created (listed in <subdir>/.icon-toolkit.json) · never runs arbitrary commands ·
 * the folder must be a real subfolder (never the project root, never a dot-folder such as .git, .github or .husky) · symlinks are refused ·
 * requests must carry a localhost Host header (DNS-rebinding defence).
 *
 * Tip: --token shows up in `ps`; prefer the ICON_SYNC_TOKEN environment variable.
 */
import { execFile } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const MAX_BODY = 20 * 1024 * 1024 // a 700-icon export with every format is a few MB
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

/** a folder inside the project that tools do not treat as code: no dot-segments (.git, .github, .husky…), no node_modules, not the root */
export function safeSubdir(p) {
  const rel = safeRel(p)
  if (!rel || rel === '.') return null
  const parts = rel.split('/')
  if (parts.some((x) => x.startsWith('.') || x === 'node_modules')) return null
  return rel
}

/** generated files are plain text assets: no dot-files, no executables, no package manifests */
const ALLOWED_EXT = new Set(['.svg', '.ts', '.js', '.css', '.html', '.json', '.md', '.png'])
export function safeGeneratedPath(rel) {
  if (!rel) return false
  const parts = rel.split('/')
  if (parts.some((x) => x.startsWith('.'))) return false
  const base = parts[parts.length - 1]
  if (['package.json', 'package-lock.json', 'tsconfig.json'].includes(base)) return false
  const dot = base.lastIndexOf('.')
  return dot > 0 && ALLOWED_EXT.has(base.slice(dot).toLowerCase())
}

/** refuses a path that is, or passes through, a symlink (a link inside the folder could point anywhere on disk) */
export function assertNoSymlinks(root, full) {
  const rootReal = realpathSync(root)
  const rel = relative(root, full)
  if (rel.startsWith('..') || isAbsolute(rel)) throw httpError(400, 'Path is outside the project')
  let cur = root
  for (const part of rel.split(sep).filter(Boolean)) {
    cur = join(cur, part)
    let st
    try {
      st = lstatSync(cur)
    } catch {
      return // the rest does not exist yet
    }
    if (st.isSymbolicLink()) throw httpError(400, `Refusing to follow a symbolic link: ${relative(root, cur)}`)
  }
  const real = existsSync(full) ? realpathSync(full) : full
  if (existsSync(full) && real !== rootReal && !real.startsWith(rootReal + sep)) throw httpError(400, 'Path resolves outside the project')
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

/** Reads <subdir>/icons.json (the catalogue developers actually ship) as the change-detection baseline. */
export function readCatalog(root, subdir) {
  const sub = safeSubdir(subdir || 'icons')
  if (sub === null) throw httpError(400, 'Invalid folder name')
  const target = resolve(root, sub)
  if (target !== root && !target.startsWith(root + sep)) throw httpError(400, 'Folder is outside the project')
  const file = join(target, 'icons.json')
  assertNoSymlinks(root, file)
  if (!existsSync(file)) return null
  if (statSync(file).size > MAX_BODY) throw httpError(413, 'icons.json is too large')
  return readFileSync(file, 'utf8')
}

export function planSync(root, subdir, files) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw httpError(400, 'files must be an object')
  const sub = safeSubdir(subdir || 'icons')
  if (sub === null) throw httpError(400, 'Invalid folder name: use a plain subfolder such as "icons" (not the project root, and not a dot-folder)')
  const target = resolve(root, sub)
  if (target !== root && !target.startsWith(root + sep)) throw httpError(400, 'Folder is outside the project')
  const managedPath = join(target, MANAGED)
  assertNoSymlinks(root, target)
  assertNoSymlinks(root, managedPath)
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
    if (!safeGeneratedPath(rel)) throw httpError(400, `Not an allowed file: ${rawPath}`)
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
  // only files this tool plausibly created: the managed list is data in the repo and may have been edited
  const removed = previous.filter((p) => typeof p === 'string' && safeRel(p) === p && safeGeneratedPath(p) && !next.has(p) && existsSync(join(target, p)))
  for (const rel of next.keys()) assertNoSymlinks(root, join(target, rel))
  for (const rel of removed) assertNoSymlinks(root, join(target, rel))
  return { target, sub, next, added, changed, unchanged, removed, managedPath }
}

function httpError(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

async function git(root, args, extra = {}) {
  const { stdout } = await run('git', ['-C', root, ...args], { maxBuffer: 10 * 1024 * 1024, ...extra })
  return stdout.trim()
}

// ---- remotes: where "origin" lives and how to get to a pull / merge request page ----

/** { host, path, provider } from an https or ssh remote URL; credentials in the URL are dropped. Provider is 'github', 'gitlab' or null. */
export function parseRemote(url) {
  if (typeof url !== 'string') return null
  const u = url.trim()
  let host
  let path
  let m = /^(?:ssh:\/\/)?(?:[^@/\s]+@)?([^:/\s]+)(?::\d+)?[:/](.+?)(?:\.git)?\/?$/.exec(u)
  const web = /^https?:\/\/(?:[^@/\s]+@)?([^/\s:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/.exec(u)
  if (web) m = web
  if (!m) return null
  host = m[1].toLowerCase()
  path = m[2].replace(/^\/+/, '')
  if (!/^[a-z0-9.-]+$/.test(host) || !/^[\w.\-/]+$/.test(path) || !path.includes('/')) return null
  const provider = host.includes('github') ? 'github' : host.includes('gitlab') ? 'gitlab' : null
  return { host, path, provider }
}

const seg = (v) => v.split('/').map(encodeURIComponent).join('/')
const MAX_LINK_TEXT = 3000 // keep the link under browser and server limits; the full text is returned separately

/** URL of the "open a pull / merge request" page with title and description prefilled, or null for unknown hosts */
export function compareLink(remote, base, branch, title = '', body = '') {
  if (!remote || !remote.provider || !base || !branch) return null
  const t = String(title).slice(0, 200)
  const b = String(body).length > MAX_LINK_TEXT ? String(body).slice(0, MAX_LINK_TEXT) + '\n\n…(description shortened; paste the full text from the plugin)' : String(body)
  const root = `https://${remote.host}/${seg(remote.path)}`
  if (remote.provider === 'github') return `${root}/compare/${seg(base)}...${seg(branch)}?expand=1&title=${encodeURIComponent(t)}&body=${encodeURIComponent(b)}`
  return `${root}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(branch)}&merge_request%5Btarget_branch%5D=${encodeURIComponent(base)}&merge_request%5Btitle%5D=${encodeURIComponent(t)}&merge_request%5Bdescription%5D=${encodeURIComponent(b)}`
}

async function remoteInfo(root) {
  try {
    return parseRemote(await git(root, ['remote', 'get-url', 'origin']))
  } catch {
    return null
  }
}

/** the branch pull requests target: origin's HEAD, else main / master, else "main" */
async function defaultBranch(root) {
  try {
    return (await git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])).replace(/^origin\//, '')
  } catch {
    for (const b of ['main', 'master']) {
      try {
        await git(root, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${b}`])
        return b
      } catch {
        /* try the next one */
      }
    }
    return 'main'
  }
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
  const token = opts.token || process.env.ICON_SYNC_TOKEN || randomBytes(16).toString('hex')
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
      const host = String(req.headers.host ?? '').toLowerCase()
      const port = server.address()?.port
      if (![`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(host)) throw httpError(403, 'Unexpected Host header')
      const given = String(req.headers['x-toolkit-token'] ?? '')
      const a = Buffer.from(given)
      const b = Buffer.from(token)
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw httpError(401, 'Invalid token')

      if (req.method === 'GET' && req.url === '/status') {
        const info = opts.git ? await gitInfo(root) : { repo: false, disabled: true }
        const remote = opts.git && info.repo ? await remoteInfo(root) : null
        send(200, { ok: true, dir: root, git: info, allowGit: !!opts.git, allowPush: !!opts.allowPush, remote: remote ? { host: remote.host, repo: remote.path, provider: remote.provider } : null, defaultBranch: opts.git && info.repo ? await defaultBranch(root) : null })
        return
      }
      if (req.method === 'GET' && req.url.startsWith('/catalog')) {
        const subdir = new URL(req.url, 'http://x').searchParams.get('subdir') ?? 'icons'
        const text = readCatalog(root, subdir)
        send(200, { ok: true, found: text !== null, catalog: text })
        return
      }
      if (req.method === 'POST' && req.url === '/export') {
        if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) throw httpError(413, 'Payload too large')
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
        // Refuse a push that cannot be allowed BEFORE anything is written or committed (no stray local commit on main).
        if (body.push) {
          if (!body.commit) throw httpError(400, 'Push needs "commit" to be on')
          if (!opts.git) throw httpError(403, 'Git is disabled. Start the companion with --git')
          if (!opts.allowPush) throw httpError(403, 'Push is disabled. Start the companion with --allow-push')
          const info = await gitInfo(root)
          if (!info.repo) throw httpError(400, 'The folder is not a git repository')
          const base = await defaultBranch(root)
          const target = body.branch ? String(body.branch) : info.branch
          if (target === base || target === 'HEAD') {
            throw httpError(400, `Not pushing to ${target === 'HEAD' ? 'a detached HEAD' : `"${base}"`}: choose a branch such as icons/update so the change can be reviewed.`)
          }
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
            try {
              await git(root, ['check-ref-format', '--branch', branch])
            } catch {
              throw httpError(400, 'Invalid branch name')
            }
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
            const base = await defaultBranch(root)
            if (committed.branch === base || committed.branch === 'HEAD') throw httpError(400, `Not pushing to "${base}"`) // belt and braces: the check above already ran
            try {
              // never force; never prompt (a hidden credential prompt would hang the request); credentials are the user's own git setup
              await git(root, ['push', '-u', 'origin', committed.branch], { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 60000 })
            } catch (e) {
              const detail = String(e.stderr || e.message || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(-2).join(' ')
              throw httpError(502, `Push failed: ${detail || 'unknown error'}. Check that "origin" exists and that git can sign in to it from a terminal.`)
            }
            committed.pushed = true
            const remote = await remoteInfo(root)
            const title = String(body.prTitle ?? body.message ?? '')
            committed.links = {
              provider: remote ? remote.provider : null,
              base,
              branch: committed.branch,
              compare: compareLink(remote, base, committed.branch, title, String(body.prBody ?? ''))
            }
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
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
