/**
 * Defence in depth: SVG from Figma is trusted by the generator, but the output ships to third-party sites and some of it
 * is rendered with innerHTML in the plugin UI. This is an ALLOW-list: anything not known to be a static drawing is removed.
 *  - elements: only SVG-namespace shapes, gradients, clip/mask, filters; no script, style, a, use, image, title/desc, foreign content
 *  - nodes: comments, CDATA, processing instructions and text are removed (the usual mXSS carriers)
 *  - attributes: known presentation/geometry names only; no on*, no style, no class, no data-*
 *  - values: control characters and whitespace are stripped before the scheme check; `url()` may only be `url(#id)`; `href` only `#id`
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask', 'pattern',
  'filter', 'feflood', 'fecolormatrix', 'feoffset', 'fegaussianblur', 'feblend', 'fecomposite', 'femerge', 'femergenode', 'fedropshadow'
])

const ALLOWED_ATTRIBUTES = new Set([
  'xmlns', 'xmlns:xlink', 'version', 'id', 'd', 'points', 'transform', 'viewbox', 'preserveaspectratio',
  'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'fx', 'fy', 'x1', 'y1', 'x2', 'y2',
  'fill', 'fill-rule', 'fill-opacity', 'clip-rule', 'clip-path', 'opacity', 'mask', 'mask-type', 'filter', 'vector-effect', 'display', 'visibility',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'patternunits', 'patterncontentunits', 'patterntransform',
  'maskunits', 'maskcontentunits', 'clippathunits', 'filterunits', 'color-interpolation-filters', 'flood-color', 'flood-opacity',
  'in', 'in2', 'result', 'mode', 'type', 'values', 'stddeviation', 'dx', 'dy', 'operator', 'k1', 'k2', 'k3', 'k4', 'href', 'xlink:href'
])

const SAFE_URL = /^url\(\s*['"]?#[A-Za-z0-9_.:-]+['"]?\s*\)$/

export interface SanitizeReport {
  removedElements: string[]
  removedAttributes: string[]
}

/** value with whitespace and control characters removed, lower-case: what a browser's URL parser effectively sees */
const squash = (v: string) => v.replace(/[\u0000- \u007f-\u009f]+/g, '').toLowerCase()

function badValue(name: string, value: string): boolean {
  const flat = squash(value)
  if (/(javascript|vbscript|data):/.test(flat)) return true
  if (flat.includes('url(')) return !SAFE_URL.test(value.trim())
  if (name === 'href' || name === 'xlink:href') return !value.trim().startsWith('#')
  if (/[<>]/.test(value)) return true
  return false
}

export function sanitizeSvgTree(root: Element): SanitizeReport {
  const report: SanitizeReport = { removedElements: [], removedAttributes: [] }

  const walk = (el: Element) => {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 1) {
        const child = node as Element
        const tag = child.localName.toLowerCase()
        const inSvg = child.namespaceURI === SVG_NS || child.namespaceURI === null // null: parsers that do not resolve a missing xmlns
        if (!inSvg || !ALLOWED_ELEMENTS.has(tag)) {
          report.removedElements.push(tag)
          el.removeChild(child)
          continue
        }
        walk(child)
      } else {
        // text, comments, CDATA and processing instructions carry nothing an icon needs
        el.removeChild(node)
      }
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('xmlns') ? !(name === 'xmlns' || name === 'xmlns:xlink') : !ALLOWED_ATTRIBUTES.has(name) || badValue(name, attr.value)) {
        report.removedAttributes.push(`${el.localName}@${attr.name}`)
        el.removeAttribute(attr.name)
      } else if (name.startsWith('xmlns') && !/^http:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink)$/.test(attr.value)) {
        report.removedAttributes.push(`${el.localName}@${attr.name}`)
        el.removeAttribute(attr.name)
      }
    }
  }
  walk(root)
  return report
}

/** For SVG strings that are rendered with innerHTML (fix previews): parse, sanitise, serialise. Returns null when it is not a usable SVG. */
export function sanitizeSvgString(svg: string): string | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) return null
  sanitizeSvgTree(root)
  return new XMLSerializer().serializeToString(root)
}

/** viewBox="minx miny w h": numbers only, anything else falls back to the caller's default */
export function safeViewBox(value: string | null | undefined, fallback: string): string {
  return value && /^\s*-?\d*\.?\d+(?:e-?\d+)?(?:[\s,]+-?\d*\.?\d+(?:e-?\d+)?){3}\s*$/i.test(value) ? value.trim() : fallback
}
