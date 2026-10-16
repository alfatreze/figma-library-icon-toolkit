import { PngItem, svgForPng } from '../core/png'

/**
 * Draws PNG files in the plugin window: the themed SVG of each icon is loaded as an image and painted onto a canvas at the target size.
 * Nothing goes through Figma's exportAsync, which can only draw a layer as it is in the file (a recolour would mean editing it).
 */
const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('the browser could not draw the SVG'))
    img.src = src
  })
}

export async function rasterise(item: PngItem): Promise<Uint8Array> {
  const img = await loadImage(dataUrl(svgForPng(item.icon, item.w, item.h, item.hex)))
  const canvas = document.createElement('canvas')
  canvas.width = item.w
  canvas.height = item.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas available')
  ctx.drawImage(img, 0, 0, item.w, item.h)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('the canvas gave no PNG')
  return new Uint8Array(await blob.arrayBuffer())
}

/** all files of a plan, one after the other (memory stays flat), reporting progress; an icon that cannot be drawn is named in `failed` */
export async function buildPngFiles(items: PngItem[], onProgress?: (done: number, total: number) => void): Promise<{ files: Record<string, Uint8Array>; failed: string[] }> {
  const files: Record<string, Uint8Array> = {}
  const failed: string[] = []
  for (const [i, item] of items.entries()) {
    try {
      files[item.path] = await rasterise(item)
    } catch (e) {
      failed.push(`${item.path}: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (i % 100 === 99 || i === items.length - 1) {
      onProgress?.(i + 1, items.length)
      await new Promise((r) => setTimeout(r, 0)) // let the window paint and stay responsive
    }
  }
  return { files, failed }
}
