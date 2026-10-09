import { prefixIds } from '../svg'
import { BuildInput, categoryId, fileBase, Files, ns, symbolId } from './common'

export function svgFiles(b: BuildInput): Files {
  const out: Files = {}
  const split = b.settings.splitByCategory
  for (const icon of b.icons) {
    const dir = split && icon.category.length ? `svg/${categoryId(icon)}/` : 'svg/'
    out[`${dir}${fileBase(b, icon)}.svg`] = prefixIds(icon.standalone, 'i') + '\n'
  }
  return out
}

function spriteOf(b: BuildInput, icons: BuildInput['icons']): string {
  const names = new Set(icons.map((i) => i.name))
  const aliases = (b.release?.deprecated ?? [])
    .filter((d) => names.has(d.replacedBy))
    .map((d) => `<symbol id="${ns(b)}-${d.name}" viewBox="${icons.find((i) => i.name === d.replacedBy)!.viewBox}"><use href="#${ns(b)}-${d.replacedBy}"/></symbol>`)
  const symbols = [
    ...icons.map((icon) => `<symbol id="${symbolId(b, icon)}" viewBox="${icon.viewBox}">${prefixIds(icon.body, symbolId(b, icon))}</symbol>`),
    ...aliases
  ].join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" data-${ns(b)}-sprite="">\n${symbols}\n</svg>\n`
}

export function spriteFile(b: BuildInput): string {
  return spriteOf(b, b.icons)
}

/** One sprite per category (load only what a page needs). Same symbol ids as the full sprite. */
export function categorySprites(b: BuildInput): Files {
  const out: Files = {}
  const by = new Map<string, BuildInput['icons']>()
  for (const i of b.icons) {
    const id = categoryId(i)
    if (!id) continue
    by.set(id, [...(by.get(id) ?? []), i])
  }
  for (const [id, icons] of by) out[`sprite/${ns(b)}-${id.replace(/\//g, '-')}-sprite.svg`] = spriteOf(b, icons)
  return out
}

/** Sprite markup to embed inline in an HTML page (hidden). */
export function inlineSprite(b: BuildInput): string {
  const symbols = b.icons
    .map((icon) => `<symbol id="${symbolId(b, icon)}" viewBox="${icon.viewBox}">${prefixIds(icon.body, symbolId(b, icon))}</symbol>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols}</svg>`
}
