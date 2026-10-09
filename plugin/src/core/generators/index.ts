import { Icon } from '../../types'
import { angularFiles } from './angular'
import { reactFiles } from './react'
import { BuildInput, Files, ns } from './common'
import { exportConfig } from '../config'
import { baseCss, maskCss } from './css'
import { agentsFile, auditFiles, changelogFile, manifestFile } from './manifest'
import { readmeFile } from './readme'
import { categorySprites, spriteFile, svgFiles } from './svg-files'
import { testPage } from './testpage'

export type { BuildInput, Files } from './common'

export function isExportable(icon: Icon): boolean {
  return !icon.findings.some((f) => f.severity === 'error')
}

export function buildFiles(input: Omit<BuildInput, 'icons'>): Files {
  const b: BuildInput = { ...input, icons: input.allIcons.filter(isExportable) }
  const f = b.settings.formats
  const n = ns(b)
  let out: Files = {}
  if (f.svg) out = { ...out, ...svgFiles(b) }
  if (f.sprite) {
    out[`sprite/${n}-sprite.svg`] = spriteFile(b)
    if (b.settings.splitByCategory) out = { ...out, ...categorySprites(b) }
  }
  if (f.html) {
    out[`html/${n}-icons.css`] = baseCss(b)
    out['html/index.html'] = testPage(b)
  }
  if (f.mask) out[`html/${n}-icons-mask.css`] = maskCss(b)
  if (f.angularModern) out = { ...out, ...angularFiles(b, 'modern') }
  if (f.angularClassic) out = { ...out, ...angularFiles(b, 'classic') }
  if (f.react) out = { ...out, ...reactFiles(b) }
  out['icons.json'] = manifestFile(b)
  out['toolkit.config.json'] = exportConfig(b.settings)
  out['AGENTS.md'] = agentsFile(b)
  out['README.md'] = readmeFile(b)
  out = { ...out, ...auditFiles(b), ...changelogFile(b) }
  return out
}
