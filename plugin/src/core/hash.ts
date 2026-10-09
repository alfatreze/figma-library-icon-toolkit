/** FNV-1a, 32 bit, base 36. Fine for change detection of small values; not for deduplication of thousands of items (see hash64). */
export function hash32(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * Two independently seeded 32-bit hashes of the same text (64 bits in total): collisions stay negligible even across tens of
 * thousands of icons, which matters when equal hashes are taken to mean "same drawing".
 */
export function hash64(input: string): string {
  return hash32(input) + '.' + hash32(input.length + '|' + input.split('').reverse().join(''))
}
