import { Icon } from '../../types'
import { BuildInput, Files } from './common'
import { exportConfig } from '../config'
import { agentsFile, auditFiles, changelogFile, manifestFile } from './manifest'
import { readmeFile } from './readme'
import { TARGETS } from './targets'

export type { BuildInput, Files } from './common'
export { ALL_TARGETS_ON, TARGETS } from './targets'
export type { TargetKey } from './targets'

export function isExportable(icon: Icon): boolean {
  return !icon.findings.some((f) => f.severity === 'error')
}

export function buildFiles(input: Omit<BuildInput, 'icons'>): Files {
  const b: BuildInput = { ...input, icons: input.allIcons.filter(isExportable) }
  let out: Files = {}
  for (const t of TARGETS) if (b.settings.formats[t.key]) out = { ...out, ...t.build(b) }
  out['icons.json'] = manifestFile(b)
  out['toolkit.config.json'] = exportConfig(b.settings)
  out['AGENTS.md'] = agentsFile(b)
  out['README.md'] = readmeFile(b)
  out = { ...out, ...auditFiles(b), ...changelogFile(b) }
  return out
}
