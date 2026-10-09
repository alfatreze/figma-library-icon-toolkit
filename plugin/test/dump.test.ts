// Dev utility: DUMP_DIR=/some/dir npx vitest run test/dump.test.ts  → writes a sample export for manual inspection / compile checks.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describe, it } from 'vitest'
import { buildFiles } from '../src/core/generators'
import { processIcons } from '../src/core/process'
import { DEFAULT_SETTINGS, Facts, RawIcon } from '../src/types'

const facts: Facts = {
  paints: [], leafCount: 1, hasText: false, hasImage: false, hasGradient: false, hasEffects: false, hasHidden: false,
  hasLocked: false, emptyContainers: false, hasMask: false, hasBlend: false, hasOpacity: false, hasRotation: false,
  nonCenterStroke: false, dashedStroke: false, rootBackground: false, clipsContent: true, hasNestedInstance: false
}

describe.skipIf(!process.env.DUMP_DIR)('dump', () => {
  it('writes a sample export', () => {
    const dir = process.env.DUMP_DIR!
    const raws: RawIcon[] = readdirSync('test/fixtures')
      .filter((f) => f.endsWith('.svg'))
      .map((f) => ({
        key: f, nodeId: '1:' + f, pageId: 'p', pageName: 'Icons', sourceKind: 'component', rawName: 'icon/' + f.replace('.svg', '').replace(/_/g, ' '),
        variantProps: {}, description: 'sample, test', width: 24, height: 24, padding: { left: 1, top: 1, right: 1, bottom: 1 },
        facts, categoryCtx: {}, svg: readFileSync(join('test/fixtures', f), 'utf8')
      }))
    const p = processIcons(raws, DEFAULT_SETTINGS, {})
    const files = buildFiles({ allIcons: p.icons, settings: { ...DEFAULT_SETTINGS, formats: { ...DEFAULT_SETTINGS.formats, mask: true, react: true } }, grid: p.grid, tier: p.tier, generatedAt: '2026-10-09' })
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
  })
})
