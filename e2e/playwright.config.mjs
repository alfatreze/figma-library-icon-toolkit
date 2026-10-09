import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  timeout: 60_000,
  reporter: [['list']],
  use: { browserName: 'chromium', deviceScaleFactor: 2, viewport: { width: 900, height: 700 } }
})
