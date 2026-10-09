import { GridInfo, Icon, Settings } from '../../types'
import { Diff } from '../changelog'
import { Tier } from '../library'
import { camel, cleanNamespace, pascal } from '../naming'
import { parseStrokeTable } from '../stroke'

export type Files = Record<string, string>

export interface BuildInput {
  icons: Icon[] // only exportable icons
  allIcons: Icon[]
  settings: Settings
  grid: GridInfo
  tier: Tier
  generatedAt: string
  /** library version + identity history (from comparing with a previous icons.json) */
  release?: { version: string; deprecated: { name: string; replacedBy: string; since: string }[]; diff: Diff | null }
}

export const ns = (b: BuildInput) => cleanNamespace(b.settings.namespace)
export const symbolId = (b: BuildInput, icon: Icon) => `${ns(b)}-${icon.name}`
export const fileBase = (b: BuildInput, icon: Icon) => `${ns(b)}-${icon.name}`
export const constName = (b: BuildInput, icon: Icon) => camel(`${ns(b)}-${icon.name}`)
export const componentName = (b: BuildInput) => `${pascal(ns(b))}Icon`

export const categoryId = (icon: Icon) => icon.category.join('/')
export const hasCategories = (b: BuildInput) => b.icons.some((i) => i.category.length > 0)

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function esc(s: string): string {
  return JSON.stringify(s)
}

export const strokeSteps = (b: BuildInput) => parseStrokeTable(b.settings.strokeTable)

/** Generators interpolate this into code: never trust the settings object to hold a valid value. */
export const policyOf = (b: BuildInput): 'constant' | 'scale' | 'table' => (b.settings.strokePolicy === 'scale' || b.settings.strokePolicy === 'table' ? b.settings.strokePolicy : 'constant')
