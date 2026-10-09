const AUTO_NAME = /^(frame|group|vector|rectangle|ellipse|union|subtract|intersect|exclude|component|instance|line|polygon|star|boolean|image|section|slice)\s*\d*$/i
const COPY_NAME = /\b(copy of|copy)\b|\bcopy\s*\d*$/i
const RESERVED = new Set([
  'abstract', 'arguments', 'await', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'debugger', 'default', 'delete', 'do', 'double', 'else', 'enum', 'eval', 'export', 'extends',
  'false', 'final', 'finally', 'float', 'for', 'function', 'goto', 'if', 'implements', 'import', 'in',
  'instanceof', 'int', 'interface', 'let', 'long', 'native', 'new', 'null', 'package', 'private', 'protected',
  'public', 'return', 'short', 'static', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'true', 'try', 'typeof', 'var', 'void', 'volatile', 'while', 'with', 'yield'
])

/** "Deficiência Visual" -> "deficiencia-visual" (ASCII fold, kebab-case, [a-z0-9-]) */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[øØ]/g, 'o')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isAutoName(name: string): boolean {
  const last = name.split('/').pop()!.trim()
  return AUTO_NAME.test(last)
}

export function hasCopyMarker(name: string): boolean {
  return COPY_NAME.test(name)
}

/** "Style=Filled, Size=24" -> { Style: 'Filled', Size: '24' } */
export function parseVariantName(name: string): Record<string, string> | null {
  if (!name.includes('=')) return null
  const out: Record<string, string> = {}
  for (const part of name.split(',')) {
    const i = part.indexOf('=')
    if (i < 0) return null
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return Object.keys(out).length ? out : null
}

export interface NameInput {
  rawName: string
  setName?: string
  variantProps: Record<string, string>
  ignoreSegments: string[]
  ignoreVariantValues: string[]
}

export interface NameResult {
  name: string
  category: string[]
}

/**
 * Canonical icon name. `icon/Audio descricao` -> name `audio-descricao`, category [].
 * Variants append their values: set `Home` + Style=Filled -> `home-filled`.
 */
export function buildName(input: NameInput): NameResult {
  const base = input.setName ?? input.rawName
  const segments = base.split('/').map((s) => s.trim()).filter(Boolean)
  const ignore = new Set(input.ignoreSegments.map((s) => slugify(s)))
  const last = segments.length ? segments[segments.length - 1] : ''
  const category = segments
    .slice(0, -1)
    .filter((s) => !ignore.has(slugify(s)))
    .map((s) => slugify(s))
    .filter(Boolean)
  const ignoreValues = new Set(input.ignoreVariantValues.map((v) => slugify(v)))
  const values = Object.values(input.variantProps)
    .map((v) => slugify(v))
    .filter((v) => v && !ignoreValues.has(v))
  const name = [slugify(last), ...values].filter(Boolean).join('-')
  return { name, category }
}

export function validateName(name: string): string | null {
  if (!name) return 'Name is empty'
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return 'Must start with a letter and contain only a-z, 0-9 and "-"'
  if (RESERVED.has(name)) return `"${name}" is a reserved word`
  return null
}

export function pascal(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join('')
}

export function camel(name: string): string {
  const p = pascal(name)
  return p ? p[0].toLowerCase() + p.slice(1) : p
}

export function snake(name: string): string {
  return name.replace(/-/g, '_')
}

export function cleanNamespace(ns: string): string {
  const s = slugify(ns)
  return s || 'icon'
}

export interface NameSlot {
  name: string
  /** category slug segments (used by the 'category' policy) */
  category: string[]
  /** stable tie-break so numbering does not depend on scan order (component key, else node id) */
  stable: string
  /** the user typed this name in the plugin: never rewritten */
  locked: boolean
}

/**
 * Resolves two icons with the same name according to the policy.
 * - block: names stay; the audit reports every duplicate as an error.
 * - category: a duplicate gets its category prepended ("arrows-home"); still-duplicate names stay (and are blocked).
 * - suffix: the first (by stable key) keeps the name, the others become name-2, name-3…
 * Returns the final names and the indexes that were rewritten.
 */
export function resolveDuplicates(slots: NameSlot[], policy: 'block' | 'category' | 'suffix'): { names: string[]; rewritten: Map<number, string> } {
  const names = slots.map((s) => s.name)
  const rewritten = new Map<number, string>()
  if (policy === 'block') return { names, rewritten }
  const groups = new Map<string, number[]>()
  names.forEach((n, i) => groups.set(n, [...(groups.get(n) ?? []), i]))
  const taken = new Set(names)
  for (const [name, idx] of groups) {
    if (idx.length < 2) continue
    const movable = idx.filter((i) => !slots[i].locked)
    if (policy === 'category') {
      for (const i of movable) {
        const cat = slots[i].category.join('-')
        if (!cat || name.startsWith(cat + '-')) continue
        const next = `${cat}-${name}`
        if (taken.has(next)) continue
        taken.add(next)
        names[i] = next
        rewritten.set(i, name)
      }
    } else {
      // suffix: locked names and the first movable keep the plain name
      const order = [...movable].sort((a, b) => slots[a].stable.localeCompare(slots[b].stable))
      const keepsPlain = idx.some((i) => slots[i].locked) ? null : order[0]
      let n = 2
      for (const i of order) {
        if (i === keepsPlain) continue
        let next = `${name}-${n++}`
        while (taken.has(next)) next = `${name}-${n++}`
        taken.add(next)
        names[i] = next
        rewritten.set(i, name)
      }
    }
  }
  return { names, rewritten }
}

/** Makes names unique by suffixing -2, -3… Returns the final names and which were changed. */
export function dedupeNames(names: string[]): { names: string[]; duplicates: Set<number> } {
  const seen = new Map<string, number>()
  const out: string[] = []
  const duplicates = new Set<number>()
  names.forEach((n, i) => {
    const count = (seen.get(n) ?? 0) + 1
    seen.set(n, count)
    if (count === 1) out.push(n)
    else {
      out.push(`${n}-${count}`)
      duplicates.add(i)
    }
  })
  return { names: out, duplicates }
}
