import { emit, on } from '@create-figma-plugin/utilities'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { NO_RULES, patternCheck, planRename, regexProblem, RenamePlan, RenameRules } from '../../core/bulkRename'
import { ApplyRenamesHandler, Icon, RenamesAppliedHandler } from '../../types'
import { plural } from '../util'

export type RenameScope = 'all' | 'shown'

/**
 * Bulk rename: the rules, what they would do to the icons (computed live, never written), and the Labs write.
 * `shown` is the list the user is looking at (filtered), `all` every scanned icon.
 */
export function useBulkRename(all: Icon[], shown: Icon[]) {
  const [open, setOpen] = useState(false)
  const [rules, setRules] = useState<RenameRules>(NO_RULES)
  const [scope, setScope] = useState<RenameScope>('all')
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    const off = on<RenamesAppliedHandler>('RENAMES_APPLIED', (ok, skipped, failed, message) => {
      setApplying(false)
      setRules(NO_RULES)
      const parts = [`${plural(ok, 'layer')} renamed`, skipped ? `${skipped} left alone (renamed in the file since the scan, a variant or an instance)` : '', failed ? `${failed} failed${message ? ` (${message})` : ''}` : '']
      setResult(parts.filter(Boolean).join('; ') + (ok ? '. Cmd/Ctrl+Z undoes them together. Scan again to refresh the list.' : '.'))
    })
    return () => off()
  }, [])

  const targets = scope === 'all' ? all : shown
  const problem = regexProblem(rules)
  const plan: RenamePlan = useMemo(() => (problem ? { changes: [], blocked: [], unchanged: 0, skipped: 0 } : planRename(targets, all, rules)), [targets, all, rules, problem])
  const kebab = useMemo(() => patternCheck(targets, 'kebab'), [targets])

  return {
    open,
    show: () => {
      setOpen(true)
      setResult('')
    },
    close: () => {
      if (!applying) setOpen(false)
    },
    rules,
    set: (p: Partial<RenameRules>) => setRules((r) => ({ ...r, ...p })),
    reset: () => setRules(NO_RULES),
    scope,
    setScope,
    counts: { all: all.length, shown: shown.length },
    problem,
    plan,
    kebab,
    applying,
    result,
    apply: () => {
      if (!plan.changes.length) return
      setApplying(true)
      setResult('')
      emit<ApplyRenamesHandler>('APPLY_RENAMES', plan.changes.map((c) => ({ nodeId: c.nodeId, from: c.from, to: c.to })))
    }
  }
}
