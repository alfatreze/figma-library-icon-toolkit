/** Defence in depth: the generator trusts SVG from Figma. Strip anything active or external before it ships. */

const BLOCKED_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'style', 'animate', 'animatetransform', 'animatemotion', 'set', 'a', 'image', 'use', 'audio', 'video'])
const SAFE_URL = /^url\(\s*['"]?#[A-Za-z0-9_.:-]+['"]?\s*\)$/

export interface SanitizeReport {
  removedElements: string[]
  removedAttributes: string[]
}

export function sanitizeSvgTree(root: Element): SanitizeReport {
  const report: SanitizeReport = { removedElements: [], removedAttributes: [] }
  for (const el of Array.from(root.getElementsByTagName('*'))) {
    if (el === root) continue
    const tag = el.localName.toLowerCase()
    // <use> pointing inside the same document is harmless but Figma never emits it for icons: drop it to stay strict
    if (BLOCKED_ELEMENTS.has(tag)) {
      report.removedElements.push(tag)
      el.remove()
    }
  }
  for (const el of [root, ...Array.from(root.getElementsByTagName('*'))]) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const value = attr.value
      let drop = false
      if (name.startsWith('on')) drop = true
      else if (name === 'href' || name === 'xlink:href') drop = !value.trim().startsWith('#')
      else if (name === 'style') drop = /url\(|expression\(|javascript:|@import/i.test(value)
      else if (/^(fill|stroke|clip-path|mask|filter)$/.test(name) && /url\(/i.test(value)) drop = !SAFE_URL.test(value.trim())
      else if (/javascript:|data:text\/html/i.test(value)) drop = true
      if (drop) {
        report.removedAttributes.push(`${el.localName}@${attr.name}`)
        el.removeAttribute(attr.name)
      }
    }
  }
  return report
}
