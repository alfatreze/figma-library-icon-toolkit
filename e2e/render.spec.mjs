// Renders the generated export in Chromium and checks that every output draws the same pixels:
//   inline SVG, sprite <use>, and the Web Component must match each other, honour --cmn-icon-color, and match the golden image.
// Update goldens on purpose with: UPDATE_GOLDEN=1 npx playwright test
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '.export')
const golden = join(here, 'golden')
const NS = 'cmn'
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.css': 'text/css', '.json': 'application/json' }

let server
let base
let names = []

test.beforeAll(async () => {
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  execFileSync('npx', ['vitest', 'run', 'test/dump.test.ts'], { cwd: resolve(here, '../plugin'), env: { ...process.env, DUMP_DIR: out }, stdio: 'ignore' })
  const icons = JSON.parse(readFileSync(join(out, 'icons.json'), 'utf8')).icons
  names = icons.map((i) => i.name)

  const svgs = names.map((n) => readFileSync(join(out, 'svg', `${NS}-${n}.svg`), 'utf8'))
  const cell = (inner, id) => `<div class="cell" id="${id}">${inner}</div>`
  const rows = names
    .map(
      (n, i) => `<div class="row"><span>${n}</span>
      ${cell(svgs[i], `inline-${n}`)}
      ${cell(`<svg width="48" height="48"><use href="sprite/${NS}-sprite.svg#${NS}-${n}"/></svg>`, `sprite-${n}`)}
      ${cell(`<${NS}-icon name="${n}"></${NS}-icon>`, `wc-${n}`)}
    </div>`
    )
    .join('\n')
  writeFileSync(
    join(out, 'harness.html'),
    `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#fff;font:12px sans-serif}
      .row{display:flex;gap:16px;align-items:center;padding:6px}
      .row span{width:160px}
      .cell{width:48px;height:48px;color:#0a7d3b;--${NS}-icon-size:48px;--${NS}-icon-color:#0a7d3b}
      .cell svg{width:48px;height:48px;display:block}
      body.red .cell{color:#e00000;--${NS}-icon-color:#e00000}
    </style>${rows}<script type="module" src="web-component/${NS}-icon.js"></script>`
  )

  server = createServer((req, res) => {
    const file = join(out, decodeURIComponent((req.url ?? '/').split('?')[0]))
    if (!file.startsWith(out) || !existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})

test.afterAll(() => server?.close())

const png = (buf) => PNG.sync.read(buf)
const diffRatio = (a, b) => {
  const A = png(a)
  const B = png(b)
  expect([A.width, A.height]).toEqual([B.width, B.height])
  const mismatched = pixelmatch(A.data, B.data, null, A.width, A.height, { threshold: 0.15 })
  return mismatched / (A.width * A.height)
}

const shot = (page, id) => page.locator('#' + id).screenshot({ omitBackground: false })

test('inline SVG, sprite and Web Component draw the same pixels', async ({ page }) => {
  await page.goto(`${base}/harness.html`)
  await page.waitForFunction((tag) => !!customElements.get(tag), `${NS}-icon`)
  expect(names.length).toBeGreaterThan(0)
  for (const n of names) {
    const inline = await shot(page, `inline-${n}`)
    for (const other of ['sprite', 'wc']) {
      const ratio = diffRatio(inline, await shot(page, `${other}-${n}`))
      expect(ratio, `${n}: inline vs ${other}`).toBeLessThan(0.01)
    }
  }
})

test('every output follows --cmn-icon-color (themeable)', async ({ page }) => {
  await page.goto(`${base}/harness.html`)
  await page.waitForFunction((tag) => !!customElements.get(tag), `${NS}-icon`)
  await page.evaluate(() => document.body.classList.add('red'))
  const single = JSON.parse(readFileSync(join(out, 'icons.json'), 'utf8')).icons.filter((i) => i.kind === 'filled' || i.kind === 'stroked')
  expect(single.length).toBeGreaterThan(0)
  for (const icon of single) {
    for (const fmt of ['inline', 'sprite', 'wc']) {
      const img = png(await shot(page, `${fmt}-${icon.name}`))
      let red = 0
      let green = 0
      for (let i = 0; i < img.data.length; i += 4) {
        const [r, g, b, a] = [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
        if (a < 200) continue
        if (r > 180 && g < 60 && b < 60) red++
        if (g > 100 && r < 40 && b < 90) green++
      }
      expect(red, `${icon.name} (${fmt}) draws in the new colour`).toBeGreaterThan(20)
      expect(green, `${icon.name} (${fmt}) no longer draws in the old colour`).toBe(0)
    }
  }
})

test('inline rendering matches the golden images', async ({ page }) => {
  await page.goto(`${base}/harness.html`)
  mkdirSync(golden, { recursive: true })
  const update = !!process.env.UPDATE_GOLDEN
  for (const n of names) {
    const file = join(golden, `${n}.png`)
    const now = await shot(page, `inline-${n}`)
    if (update || !existsSync(file)) {
      writeFileSync(file, now)
      continue
    }
    // generous: anti-aliasing differs a little between operating systems
    expect(diffRatio(readFileSync(file), now), `${n} differs from golden`).toBeLessThan(0.02)
  }
  expect(readdirSync(golden).filter((f) => f.endsWith('.png')).length).toBeGreaterThan(0)
})
