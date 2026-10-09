import { Icon } from '../types'
import { parseTags } from './process'

/**
 * Descriptions and tags: the component description is what the export turns into search tags (comma-separated aliases). This file is
 * the pure half of the helper: a CSV template to fill in (or send to someone who knows the icons), reading it back, and planning
 * what would change. Nothing here touches the Figma file.
 */

export const MAX_CSV_CHARS = 5_000_000
export const MAX_ROWS = 20_000
export const MAX_DESCRIPTION = 1000

export interface DescriptionChange {
  nodeId: string
  /** the description when it was scanned: a change is skipped when the file has a different one now */
  from: string
  to: string
}

export interface DescriptionPlan {
  changes: (DescriptionChange & { name: string; tags: string[] })[]
  /** rows that match what the file already has */
  unchanged: number
  /** rows with an empty description cell: left alone, never used to clear a description */
  empty: number
  /** node ids that are not components of the current scan */
  unknown: string[]
}

/** components whose own description can be written: instances and loose frames have none of their own */
export const hasOwnDescription = (i: Icon): boolean => i.sourceKind === 'component' || i.sourceKind === 'component-set'

const needsQuotes = /[",\n\r;\t]/
export const csvCell = (v: string): string => (needsQuotes.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export const csvLine = (cells: string[]): string => cells.map(csvCell).join(',')

/** spreadsheet programs treat a cell that starts with = + - @ as a formula: prefix it so a name or description never runs as one */
const safeCell = (v: string): string => (/^[=+\-@]/.test(v) ? `'${v}` : v)

export function buildTemplate(icons: Icon[], opts: { onlyMissing: boolean }): string {
  const rows = icons
    .filter(hasOwnDescription)
    .filter((i) => !opts.onlyMissing || !i.description.trim())
    .map((i) => [i.nodeId, i.name, i.categoryLabel, safeCell(i.description)])
  return '﻿' + [csvLine(['nodeId', 'name', 'category', 'description']), ...rows.map(csvLine)].join('\r\n') + '\r\n'
}

/** RFC 4180 style: quoted cells may hold the delimiter, quotes ("") and line breaks */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === delimiter) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

/** the delimiter of the header line: a comma, or a semicolon / tab (what spreadsheet programs in many locales write) */
const delimiterOf = (header: string): string => {
  const count = (d: string) => header.split(d).length
  return [';', '\t'].reduce((best, d) => (count(d) > count(best) ? d : best), ',')
}

export interface ReadResult {
  rows: { nodeId: string; description: string }[]
  problems: string[]
}

export function readTemplate(raw: string): ReadResult {
  const problems: string[] = []
  if (raw.length > MAX_CSV_CHARS) return { rows: [], problems: ['The file is too large.'] }
  const text = raw.replace(/^﻿/, '')
  const rows = parseCsv(text, delimiterOf(text.split(/\r?\n/, 1)[0] ?? ''))
  if (!rows.length) return { rows: [], problems: ['The file is empty.'] }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const idCol = head.indexOf('nodeid')
  const descCol = head.indexOf('description')
  if (idCol < 0 || descCol < 0) return { rows: [], problems: ['The first line must have the columns “nodeId” and “description” (use the template from this dialog).'] }
  if (rows.length - 1 > MAX_ROWS) problems.push(`Only the first ${MAX_ROWS} rows are used.`)
  const out: ReadResult['rows'] = []
  for (const r of rows.slice(1, MAX_ROWS + 1)) {
    const nodeId = (r[idCol] ?? '').trim()
    if (!nodeId) continue
    let description = (r[descCol] ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
    if (description.startsWith("'") && /^'[=+\-@]/.test(description)) description = description.slice(1) // undo the formula guard of the template
    out.push({ nodeId, description })
  }
  return { rows: out, problems }
}

/** what applying a filled template would change, against the icons of the current scan */
export function planDescriptions(rows: ReadResult['rows'], icons: Icon[]): DescriptionPlan {
  const byId = new Map(icons.filter(hasOwnDescription).map((i) => [i.nodeId, i]))
  const plan: DescriptionPlan = { changes: [], unchanged: 0, empty: 0, unknown: [] }
  const seen = new Set<string>()
  for (const r of rows) {
    const icon = byId.get(r.nodeId)
    if (!icon) {
      plan.unknown.push(r.nodeId)
      continue
    }
    if (seen.has(r.nodeId)) continue // a duplicated row: the first one wins
    seen.add(r.nodeId)
    if (!r.description) {
      plan.empty++
      continue
    }
    const to = r.description.slice(0, MAX_DESCRIPTION)
    if (to === icon.description.trim()) {
      plan.unchanged++
      continue
    }
    plan.changes.push({ nodeId: icon.nodeId, name: icon.name, from: icon.description, to, tags: parseTags(to) })
  }
  return plan
}
