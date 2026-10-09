import { h } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import styles from './styles'
import { Icon } from '../types'
import { autoTile } from '../core/contrast'

export type PreviewBg = 'auto' | 'light' | 'dark' | 'checker'
/** 'auto' picks light or dark per icon so white artwork is never invisible */
export const bgClass = (bg: PreviewBg, icon?: Icon): string => ((bg === 'auto' && icon ? autoTile(icon.slots) : bg) === 'light' ? styles.bgLight : (bg === 'auto' && icon ? autoTile(icon.slots) : bg) === 'dark' ? styles.bgDark : bg === 'checker' ? styles.bgChecker : '')

/** the exported artwork at a given pixel size (the SVG carries its own viewBox, so width/height just scale it) */
const sized = (svg: string, px: number) => svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="${px}" height="${px}">`)

/**
 * Hover / focus preview: a larger icon, a 16 / 24 / 32 px ladder (how it holds up small) and the preview background switch.
 * It sits below the hovered row (above when there is no room) so it never covers the row you are looking at.
 */
export function IconPreview(props: { icon: Icon; anchor: DOMRect; bg: PreviewBg; onBg: (bg: PreviewBg) => void; onEnter: () => void; onLeave: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const room = window.innerHeight - 72 // keep clear of the footer bar
    const below = props.anchor.bottom + 4
    const top = below + h <= room ? below : Math.max(8, props.anchor.top - h - 4)
    const left = Math.min(Math.max(8, props.anchor.right - w - 8), window.innerWidth - w - 8)
    setPos({ left, top })
  }, [props.anchor, props.icon])
  const { icon } = props
  const dots: { id: PreviewBg; label: string; style: Record<string, string> }[] = [
    { id: 'light', label: 'White background', style: { background: '#fff' } },
    { id: 'dark', label: 'Dark background', style: { background: '#1e1e1e' } },
    { id: 'checker', label: 'Transparent (checkerboard) background', style: { background: 'repeating-conic-gradient(#d8d8d8 0 25%, #fff 0 50%) 0 0 / 8px 8px' } }
  ]
  return (
    <div ref={ref} class={styles.preview} role="tooltip" style={{ left: pos ? pos.left : -9999, top: pos ? pos.top : -9999 }} onMouseEnter={props.onEnter} onMouseLeave={props.onLeave}>
      <div class={`${styles.previewBig} ${bgClass(props.bg, icon)}`}>
        <span class={styles.previewBgs}>
          {dots.map((d) => (
            <button key={d.id} type="button" class={`${styles.bgDot} ${props.bg === d.id ? styles.bgDotOn : ''}`} style={d.style} aria-label={d.label} aria-pressed={props.bg === d.id} onClick={() => props.onBg(props.bg === d.id ? 'auto' : d.id)} />
          ))}
        </span>
        <span dangerouslySetInnerHTML={{ __html: sized(icon.standalone, 56) }} style={{ display: 'contents' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong class={styles.ellipsis} style={{ flex: 1, minWidth: 0, fontSize: 12 }}>{icon.name}</strong>
        <span class={styles.muted}>{icon.width}×{icon.height}</span>
      </div>
      <div class={styles.ladder}>
        {[16, 24, 32].map((px) => (
          <div key={px}>
            <span dangerouslySetInnerHTML={{ __html: sized(icon.standalone, px) }} style={{ display: 'contents' }} />
            {px}
          </div>
        ))}
      </div>
    </div>
  )
}
