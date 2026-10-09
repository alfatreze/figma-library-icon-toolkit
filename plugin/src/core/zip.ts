import { strToU8, zipSync } from 'fflate'
import { Files } from './generators'

export function zipFiles(files: Files): Uint8Array {
  const data: Record<string, Uint8Array> = {}
  for (const [path, content] of Object.entries(files)) data[path] = strToU8(content)
  return zipSync(data, { level: 6 })
}
