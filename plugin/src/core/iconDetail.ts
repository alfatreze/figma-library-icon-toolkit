import { Icon, SlotInfo } from '../types'

/**
 * Helpers of the icon detail panel: the modes (Light / Dark…) an icon's colour variables have, and how to show the icon in one of them.
 * The artwork is themeable, so a mode is shown by setting the slot variables on a wrapper element; nothing in the SVG changes.
 */

/** every mode name used by any colour slot of the icon, in the order they first appear */
export function modeNames(icon: Pick<Icon, 'slots'>): string[] {
  const out: string[] = []
  for (const s of icon.slots) for (const m of Object.keys(s.modes ?? {})) if (!out.includes(m)) out.push(m)
  return out
}

/** the colour of a slot in a mode; a slot without that mode keeps the colour it is drawn with */
export const slotColour = (s: Pick<SlotInfo, 'hex' | 'modes'>, mode: string | null): string => (mode && s.modes?.[mode]) || s.hex

/** an inline style that sets every slot variable to its colour in `mode` (empty when no mode is chosen) */
export function modeStyle(icon: Pick<Icon, 'slots'>, mode: string | null): string {
  if (!mode) return ''
  return icon.slots.map((s) => `${s.cssVar}:${slotColour(s, mode)}`).join(';')
}

/** a readable contrast ratio between two #rrggbb colours (1 to 21); used to pick a background that shows the icon in a mode */
const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
export function luminanceOf(hex: string): number {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  if (!Number.isFinite(n)) return 0
  return 0.2126 * channel(((n >> 16) & 255) / 255) + 0.7152 * channel(((n >> 8) & 255) / 255) + 0.0722 * channel((n & 255) / 255)
}

/** the tile that shows an icon best in a mode: a dark tile when the icon's colours in that mode are light, else a light one */
export function tileForMode(icon: Pick<Icon, 'slots'>, mode: string | null): 'light' | 'dark' {
  if (!icon.slots.length) return 'light'
  const lum = icon.slots.map((s) => luminanceOf(slotColour(s, mode)))
  return lum.every((l) => l > 0.55) ? 'dark' : 'light'
}
