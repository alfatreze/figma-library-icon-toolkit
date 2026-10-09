/** 2x3 affine matrix in Figma's Transform layout: [[a, c, tx], [b, d, ty]] → x' = a·x + c·y + tx, y' = b·x + d·y + ty */
export type Matrix = [[number, number, number], [number, number, number]]

export const IDENTITY: Matrix = [[1, 0, 0], [0, 1, 0]]

export function invert(m: Matrix): Matrix {
  const [[a, c, tx], [b, d, ty]] = m
  const det = a * d - b * c
  if (Math.abs(det) < 1e-12) throw new Error('Singular transform')
  const ia = d / det
  const ib = -b / det
  const ic = -c / det
  const id = a / det
  return [[ia, ic, -(ia * tx + ic * ty)], [ib, id, -(ib * tx + id * ty)]]
}

/** multiply: apply `second` first, then `first` (first ∘ second) */
export function multiply(first: Matrix, second: Matrix): Matrix {
  const [[a1, c1, t1], [b1, d1, u1]] = first
  const [[a2, c2, t2], [b2, d2, u2]] = second
  return [
    [a1 * a2 + c1 * b2, a1 * c2 + c1 * d2, a1 * t2 + c1 * u2 + t1],
    [b1 * a2 + d1 * b2, b1 * c2 + d1 * d2, b1 * t2 + d1 * u2 + u1]
  ]
}

const fmt = (n: number) => {
  const r = Number(n.toFixed(3))
  return String(Object.is(r, -0) ? 0 : r)
}

/**
 * Transform path data that uses Figma's absolute commands (M L C Q Z).
 * Throws on commands it does not understand so callers can fall back to Figma's own SVG export.
 */
export function transformPath(d: string, m: Matrix): string {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const out: string[] = []
  const arity: Record<string, number> = { M: 2, L: 2, C: 6, Q: 4, Z: 0 }
  let i = 0
  while (i < tokens.length) {
    const cmd = tokens[i++]
    if (!/^[A-Za-z]$/.test(cmd)) throw new Error('Unexpected token in path data')
    const upper = cmd.toUpperCase()
    if (cmd !== upper || !(upper in arity)) throw new Error(`Unsupported path command ${cmd}`)
    const n = arity[upper]
    const nums: number[] = []
    for (let k = 0; k < n; k++) nums.push(Number(tokens[i++]))
    if (nums.some((v) => !Number.isFinite(v))) throw new Error('Malformed path data')
    const pts: string[] = []
    for (let k = 0; k < nums.length; k += 2) {
      const x = nums[k]
      const y = nums[k + 1]
      pts.push(fmt(m[0][0] * x + m[0][1] * y + m[0][2]), fmt(m[1][0] * x + m[1][1] * y + m[1][2]))
    }
    out.push(upper + pts.join(' '))
  }
  return out.join('')
}

/** rotation/flip/scale part of a transform, rounded: identical artwork that is mirrored or rotated must NOT match */
export function orientationKey(m: Matrix): string {
  const r = (n: number) => {
    const v = Math.round(n * 100) / 100
    return Object.is(v, -0) ? 0 : v
  }
  return `${r(m[0][0])},${r(m[1][0])},${r(m[0][1])},${r(m[1][1])}`
}
