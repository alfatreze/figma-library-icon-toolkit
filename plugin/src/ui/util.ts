import { emit } from '@create-figma-plugin/utilities'
import { NotifyHandler } from '../types'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export const plural = (n: number, w: string) => `${n} ${n === 1 ? w : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(x|s|ch|sh)$/.test(w) ? w + 'es' : w + 's'}`

/** a toast in Figma (the plugin iframe has no notifications of its own) */
export const notify = (message: string, error = false) => emit<NotifyHandler>('NOTIFY', message, error)

export function download(name: string, data: Uint8Array | string, mime: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** navigator.clipboard is blocked in plugin iframes; the textarea route works everywhere */
export function copyText(text: string): boolean {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.cssText = 'position:fixed;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  document.body.removeChild(ta)
  return ok
}
