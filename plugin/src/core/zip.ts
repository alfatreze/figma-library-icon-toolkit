import { strToU8, zipSync, Zippable } from 'fflate'
import { Files } from './generators'

/** text files are compressed; `binary` (PNG images) is stored as is, they are compressed already */
export function zipFiles(files: Files, binary: Record<string, Uint8Array> = {}): Uint8Array {
  const data: Zippable = {}
  for (const [path, content] of Object.entries(files)) data[path] = strToU8(content)
  for (const [path, bytes] of Object.entries(binary)) data[path] = [bytes, { level: 0 }]
  return zipSync(data, { level: 6 })
}
