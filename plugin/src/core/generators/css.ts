import { BuildInput, ns, strokeSteps, policyOf } from './common'

export function baseCss(b: BuildInput): string {
  const n = ns(b)
  return `/* ${n} icons — generated ${b.generatedAt} */
/* Customise with CSS variables:
   --${n}-icon-size, --${n}-icon-color, --${n}-icon-color-2 …, --${n}-icon-stroke-width */
.${n}-icon {
  display: inline-block;
  width: var(--${n}-icon-size, 1em);
  height: var(--${n}-icon-size, 1em);
  flex: none;
  fill: none;
  vertical-align: -0.125em;
}
.${n}-icon--xs { --${n}-icon-size: 0.75em; }
.${n}-icon--sm { --${n}-icon-size: 0.875em; }
.${n}-icon--lg { --${n}-icon-size: 1.25em; }
.${n}-icon--xl { --${n}-icon-size: 1.5em; }
.${n}-icon--2xl { --${n}-icon-size: 2em; }

.${n}-icon--fw { width: 1.25em; text-align: center; }
${strokeCss(b)}`
}

function strokeCss(b: BuildInput): string {
  const n = ns(b)
  const policy = policyOf(b)
  if (policy === 'scale') return `/* Stroke policy: scale. Strokes grow and shrink with the icon (default SVG behaviour). */\n`
  if (policy === 'constant') {
    return `/* Stroke policy: constant. Strokes use vector-effect: non-scaling-stroke, so the weight stays the same in screen px at any size.\n   Override with --${n}-icon-stroke-width (px). */\n`
  }
  const rules = strokeSteps(b).map((s) => `.${n}-icon--s${s.size} { --${n}-icon-size: ${s.size}px; --${n}-icon-stroke-width: ${s.weight}; }`).join('\n')
  return `/* Stroke policy: weight by size. Use a size class to get the matching stroke weight (px). */\n${rules}\n`
}

export function maskCss(b: BuildInput): string {
  const n = ns(b)
  const rules = b.icons
    .filter((i) => i.maskSvg)
    .map((i) => {
      const url = `url("data:image/svg+xml,${encodeURIComponent(i.maskSvg!)}")`
      const alias = (b.release?.deprecated ?? []).filter((d) => d.replacedBy === i.name).map((d) => `.${n}-icon--${d.name}`)
      return `${[`.${n}-icon--${i.name}`, ...alias].join(',\n')} { -webkit-mask-image: ${url}; mask-image: ${url}; }`
    })
    .join('\n')
  return `/* ${n} icons (mask technique) — single-colour only, no live stroke width, not multi-colour.
   Usage: <i class="${n}-icon ${n}-icon--NAME" aria-hidden="true"></i>
   Prefer the sprite for multi-colour/stroked icons and for accessibility. */
i.${n}-icon,
span.${n}-icon {
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
}
@media (forced-colors: active) {
  i.${n}-icon,
  span.${n}-icon { forced-color-adjust: none; background-color: CanvasText; }
}
@media print {
  i.${n}-icon,
  span.${n}-icon { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
${rules}
`
}
