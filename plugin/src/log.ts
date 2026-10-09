/**
 * Tiny ring-buffered logger shared by the main thread and the UI.
 * Failures that are handled (an unreadable layer, a variable that could not be resolved) are not errors for the user, but they are the
 * first thing needed to understand a bug report: they are kept in memory and shown by Settings → Copy diagnostics.
 */

export type Level = 'debug' | 'warn' | 'error'
const MAX = 200
const entries: string[] = []

const describe = (e: unknown): string => (e instanceof Error ? e.message : e === undefined ? '' : String(e))

function write(level: Level, scope: string, message: string, err?: unknown): void {
  const detail = describe(err)
  entries.push(`${new Date().toISOString().slice(11, 23)} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${detail ? ': ' + detail : ''}`)
  if (entries.length > MAX) entries.shift()
  if (level !== 'debug') (level === 'error' ? console.error : console.warn)(`[icon-toolkit] [${scope}] ${message}`, err ?? '')
}

export const log = {
  debug: (scope: string, message: string, err?: unknown) => write('debug', scope, message, err),
  warn: (scope: string, message: string, err?: unknown) => write('warn', scope, message, err),
  error: (scope: string, message: string, err?: unknown) => write('error', scope, message, err)
}

export const recentLog = (): string[] => entries.slice()

/** run something that may throw and keep going with a fallback; the failure is logged instead of vanishing */
export function tryOr<T>(scope: string, what: string, fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch (e) {
    log.debug(scope, what, e)
    return fallback
  }
}

export async function tryOrAsync<T>(scope: string, what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    log.debug(scope, what, e)
    return fallback
  }
}
