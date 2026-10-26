// Renders the generated export in Chromium and checks that every output draws the same pixels:
//   inline SVG, sprite <use>, the Web Component, and the Vue and Svelte components (bundled here, icons looked up by name so the lazy category chunks load) must match each other, honour --cmn-icon-color, and match the golden image.
// Update goldens on purpose with: UPDATE_GOLDEN=1 npx playwright test
import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import sveltePlugin from 'esbuild-svelte'
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

  // Vue and Svelte: the generated folders are bundled as an app would (code splitting on, so the by-name lookup loads its category chunk lazily)
  const P = 'Cmn'
  writeFileSync(
    join(out, 'vue-app.ts'),
    `import { createApp, h } from 'vue'\nimport { ${P}Icon } from './vue/index'\nfor (const n of ${JSON.stringify(names)}) createApp({ render: () => h(${P}Icon, { name: n as never }) }).mount('#vue-' + n)\n`
  )
  writeFileSync(
    join(out, 'svelte-app.ts'),
    `import { mount } from 'svelte'\nimport { ${P}Icon } from './svelte/index'\nfor (const n of ${JSON.stringify(names)}) mount(${P}Icon, { target: document.getElementById('svelte-' + n)!, props: { name: n as never } })\n`
  )
  const common = { bundle: true, format: 'esm', splitting: true, minify: false, logLevel: 'error', absWorkingDir: here, define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' } }
  await build({ ...common, entryPoints: [join(out, 'vue-app.ts')], outdir: join(out, 'dist-vue') })
  await build({ ...common, entryPoints: [join(out, 'svelte-app.ts')], outdir: join(out, 'dist-svelte'), conditions: ['browser'], plugins: [sveltePlugin()], mainFields: ['svelte', 'browser', 'module', 'main'] })

  const svgs = names.map((n) => readFileSync(join(out, 'svg', `${NS}-${n}.svg`), 'utf8'))
  const cell = (inner, id) => `<div class="cell" id="${id}">${inner}</div>`
  const rows = names
    .map(
      (n, i) => `<div class="row"><span>${n}</span>
      ${cell(svgs[i], `inline-${n}`)}
      ${cell(`<svg width="48" height="48"><use href="sprite/${NS}-sprite.svg#${NS}-${n}"/></svg>`, `sprite-${n}`)}
      ${cell(`<${NS}-icon name="${n}"></${NS}-icon>`, `wc-${n}`)}
      ${cell('', `vue-${n}`)}
      ${cell('', `svelte-${n}`)}
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
    </style>${rows}<script type="module" src="web-component/${NS}-icon.js"></script><script type="module" src="dist-vue/vue-app.js"></script><script type="module" src="dist-svelte/svelte-app.js"></script>`
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

test('inline SVG, sprite, Web Component, Vue and Svelte draw the same pixels', async ({ page }) => {
  await page.goto(`${base}/harness.html`)
  await page.waitForFunction((tag) => !!customElements.get(tag), `${NS}-icon`)
  expect(names.length).toBeGreaterThan(0)
  // by-name lookups load their category as a lazy chunk: wait until Vue and Svelte have drawn every icon
  await page.waitForFunction((ns) => [...document.querySelectorAll('[id^="vue-"],[id^="svelte-"]')].every((c) => c.querySelector('svg')), NS, { timeout: 10000 })
  for (const n of names) {
    const inline = await shot(page, `inline-${n}`)
    for (const other of ['sprite', 'wc', 'vue', 'svelte']) {
      const ratio = diffRatio(inline, await shot(page, `${other}-${n}`))
      expect(ratio, `${n}: inline vs ${other}`).toBeLessThan(0.01)
    }
  }
})

test('every output follows --cmn-icon-color (themeable)', async ({ page }) => {
  await page.goto(`${base}/harness.html`)
  await page.waitForFunction((tag) => !!customElements.get(tag), `${NS}-icon`)
  await page.waitForFunction(() => [...document.querySelectorAll('[id^="vue-"],[id^="svelte-"]')].every((c) => c.querySelector('svg')), null, { timeout: 10000 })
  await page.evaluate(() => document.body.classList.add('red'))
  const single = JSON.parse(readFileSync(join(out, 'icons.json'), 'utf8')).icons.filter((i) => i.kind === 'filled' || i.kind === 'stroked')
  expect(single.length).toBeGreaterThan(0)
  for (const icon of single) {
    for (const fmt of ['inline', 'sprite', 'wc', 'vue', 'svelte']) {
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
