/** WCAG relative luminance of a #rgb / #rrggbb colour; null when it is not a plain hex */
export function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1]
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two hex colours (1 to 21); null when either is not a plain hex */
export function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a)
  const lb = luminance(b)
  if (la === null || lb === null) return null
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** the preview tile that keeps an icon readable: dark when every colour it draws would fade into white, otherwise light */
export function autoTile(slots: { hex: string }[]): 'light' | 'dark' {
  const colours = slots.map((s) => s.hex).filter((h) => luminance(h) !== null)
  if (!colours.length) return 'light'
  return colours.every((h) => (contrastRatio(h, '#ffffff') as number) < 1.5) ? 'dark' : 'light'
}
