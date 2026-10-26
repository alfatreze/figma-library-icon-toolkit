/**
 * Optional naming rules for icon names, off by default: a pattern every name must match (this is how a team writes "verb-noun",
 * e.g. ^(add|remove|edit)-[a-z-]+$) and "a name starts with its category" (arrows → arrows-left). Both only produce warnings.
 * The pattern comes from settings (and from a team config file), so it is length-limited and checked before it is ever run.
 */

export const MAX_NAME_PATTERN = 200

/** why a pattern cannot be used, or null; a repeated group with a repeat inside can run for a very long time and is refused */
export function patternProblem(pattern: string): string | null {
  if (!pattern) return null
  if (pattern.length > MAX_NAME_PATTERN) return `The pattern is longer than ${MAX_NAME_PATTERN} characters.`
  if (/(\([^)]*[+*][^)]*\))[+*{]/.test(pattern)) return 'A repeated group with a repeat inside can run for a very long time here: simplify the pattern.'
  try {
    new RegExp(pattern)
  } catch {
    return 'This is not a valid regular expression.'
  }
  return null
}

/** the name matches the pattern; an empty or unusable pattern accepts everything (the settings field says what is wrong with it) */
export function matchesPattern(name: string, pattern: string): boolean {
  if (!pattern || patternProblem(pattern)) return true
  return new RegExp(pattern).test(name)
}

/** the name starts with its category (the last category folder), e.g. "arrows-left" in "arrows"; icons without a category pass */
export function hasCategoryPrefix(name: string, category: string[]): boolean {
  const last = category[category.length - 1]
  return !last || name === last || name.startsWith(`${last}-`)
}
