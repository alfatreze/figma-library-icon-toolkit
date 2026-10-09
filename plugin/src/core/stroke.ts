import { StrokePolicy } from '../types'

export interface StrokeStep {
  size: number
  weight: number
}

export const STROKE_POLICY_INFO: { value: StrokePolicy; label: string; detail: string }[] = [
  { value: 'constant', label: 'Constant weight (recommended)', detail: 'The stroke keeps the weight it was drawn with, in screen pixels, at every icon size (SVG vector-effect: non-scaling-stroke). A 2px line stays 2px at 16, 24 or 64.' },
  { value: 'table', label: 'Weight by size (table)', detail: 'You define the stroke weight per icon size, e.g. 2px at 32 and 3px at 64. Stays constant within a size and follows your table across sizes. Size classes and the Angular component apply the right weight automatically.' },
  { value: 'scale', label: 'Scale with the icon', detail: 'The default SVG behaviour: the stroke grows and shrinks with the icon (a 2px line drawn at 24 is 4px at 48). Use it for filled-style icons or when you want strict proportions.' }
]

/** "16:1.5, 24:2, 32:2, 64:3" → sorted steps */
export function parseStrokeTable(text: string): StrokeStep[] {
  const steps: StrokeStep[] = []
  for (const part of text.split(/[,\n;]+/)) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*[:=@]\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/.exec(part)
    if (m) steps.push({ size: Number(m[1]), weight: Number(m[2]) })
  }
  return steps.sort((a, b) => a.size - b.size)
}

/** weight for a rendered size: the largest step whose size ≤ requested size (first step below the minimum) */
export function weightForSize(size: number, steps: StrokeStep[]): number | null {
  if (!steps.length) return null
  let w = steps[0].weight
  for (const s of steps) if (s.size <= size) w = s.weight
  return w
}

export function validateStrokeTable(text: string): string | null {
  const nonEmpty = text.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean)
  if (!nonEmpty.length) return 'Add at least one "size:weight" pair, e.g. 24:2'
  const bad = nonEmpty.filter((p) => !/^\d+(\.\d+)?\s*(px)?\s*[:=@]\s*\d+(\.\d+)?\s*(px)?$/.test(p))
  return bad.length ? `Cannot read: ${bad.join(', ')}. Use size:weight, e.g. 32:2` : null
}
