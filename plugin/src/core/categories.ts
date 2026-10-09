import { CategoryContext, CategorySource } from '../types'
import { isAutoName, slugify } from './naming'

export interface CategoryResult {
  slug: string[]
  label: string
}

const NONE: CategoryResult = { slug: [], label: '' }

function tidy(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/^[\s↳→›>\-–—·•]+/u, '').trim()
}

/** category segments from the layer name ("Acessibilidade/Audio" → ["Acessibilidade"]), minus ignored folders */
export function pathSegments(base: string, ignore: string[]): string[] {
  const skip = new Set(ignore.map((s) => slugify(s)))
  return base
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, -1)
    .filter((s) => !skip.has(slugify(s)))
}

function fromNames(names: string[]): CategoryResult {
  const clean = names.map(tidy).filter((n) => n && !isAutoName(n))
  const slug = clean.map((n) => slugify(n)).filter(Boolean)
  if (!slug.length) return NONE
  return { slug, label: clean.join(' / ') }
}

/**
 * Resolve an icon's category from the usual Figma organisation levels.
 * auto: layer-name path → section → parent frame → page. Auto/default names ("Frame 12") are ignored.
 */
export function resolveCategory(
  source: CategorySource,
  input: { pathNames: string[]; ctx: CategoryContext; page: string }
): CategoryResult {
  const byPath = () => fromNames(input.pathNames)
  const bySection = () => fromNames(input.ctx.section ? [input.ctx.section] : [])
  const byFrame = () => fromNames(input.ctx.frame ? [input.ctx.frame] : [])
  const byPage = () => fromNames([input.page])
  switch (source) {
    case 'none':
      return NONE
    case 'path':
      return byPath()
    case 'section':
      return bySection()
    case 'frame':
      return byFrame()
    case 'page':
      return byPage()
    default: {
      for (const f of [byPath, bySection, byFrame, byPage]) {
        const r = f()
        if (r.slug.length) return r
      }
      return NONE
    }
  }
}

export interface CategorySummary {
  id: string
  label: string
  count: number
}

export function summariseCategories(items: { category: string[]; categoryLabel: string }[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>()
  for (const i of items) {
    const id = i.category.join('/')
    if (!id) continue
    const e = map.get(id)
    if (e) e.count++
    else map.set(id, { id, label: i.categoryLabel, count: 1 })
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/** filesystem-safe folder for a category ("a/b" → "a/b") */
export const categoryDir = (slug: string[]) => slug.join('/')
