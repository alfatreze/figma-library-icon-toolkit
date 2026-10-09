import { emit, on } from '@create-figma-plugin/utilities'
import { useEffect, useRef, useState } from 'preact/hooks'
import { ApplyFixesHandler, ApplyFixRequest, FixActionId, FixCandidate, FixesAppliedHandler, FixResult, FixResultHandler, Icon, ScanSummary, Settings } from '../../types'
import { plural, notify } from '../util'

/** fixes that are safe enough to be selected without the user asking */
const PRESELECTED = ['detached-identical', 'detached-match', 'layer-names', 'convert-frame']

const toggled = (set: Set<string>, k: string, on: boolean) => {
  const n = new Set(set)
  if (on) n.add(k)
  else n.delete(k)
  return n
}

/**
 * Everything about applying fixes: which are selected, the action chosen for each, the result Figma reported, the confirmation
 * dialog and the apply request. The fixes themselves come from the scan; `reset` clears the state that belongs to the previous scan.
 */
export function useFixes(allFixes: FixCandidate[], summary: ScanSummary | null, settings: Settings, grid: { width: number; height: number }) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [action, setAction] = useState<Record<string, FixActionId>>({})
  const [results, setResults] = useState<Record<string, FixResult>>({})
  const [groupOpen, setGroupOpen] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [renameLeaves, setRenameLeaves] = useState(true)
  const defaultsFor = useRef<ScanSummary | null>(null)

  useEffect(() => {
    const offs = [
      on<FixResultHandler>('FIX_RESULT', (r) => setResults((prev) => ({ ...prev, [r.id]: r }))),
      on<FixesAppliedHandler>('FIXES_APPLIED', (ok, failed) => {
        setApplying(false)
        setConfirmOpen(false)
        setSel(new Set())
        notify(failed ? `${ok} fixed, ${failed} failed` : `${plural(ok, 'fix')} applied. Cmd/Ctrl+Z undoes them.`, failed > 0)
      })
    ]
    return () => offs.forEach((o) => o())
  }, [])

  // sensible default: pre-select the safe, high-confidence fixes once per scan
  useEffect(() => {
    if (!summary || defaultsFor.current === summary) return
    defaultsFor.current = summary
    setSel(new Set(allFixes.filter((f) => f.actions.length && f.confidence === 'high' && PRESELECTED.includes(f.kind)).map((f) => f.id)))
  }, [summary, allFixes])

  const actionOf = (f: FixCandidate): FixActionId => action[f.id] ?? f.actions[0]
  const fixable = (f: FixCandidate) => f.actions.length > 0 && !results[f.id]?.ok
  const selected = allFixes.filter((f) => sel.has(f.id) && fixable(f))
  const forRule = (ruleId: string, list: Icon[]) => {
    const kinds = ruleId === 'not-component' ? ['convert-frame'] : [ruleId]
    return list.flatMap((i) => i.fixes).filter((f) => kinds.includes(f.kind))
  }

  return {
    selected, results, groupOpen, confirmOpen, applying, renameLeaves, actionOf, fixable, forRule,
    isSelected: (id: string) => sel.has(id),
    select: (id: string, v: boolean) => setSel((p) => toggled(p, id, v)),
    selectAll: () => setSel(new Set(allFixes.filter((f) => f.actions.length).map((f) => f.id))),
    setAction: (id: string, a: FixActionId) => setAction((p) => ({ ...p, [id]: a })),
    toggleGroup: (ruleId: string) => setGroupOpen((p) => toggled(p, ruleId, !p.has(ruleId))),
    setRenameLeaves,
    openConfirm: () => setConfirmOpen(true),
    closeConfirm: () => setConfirmOpen(false),
    /** select the (non-low-confidence) fixes of a list and open the confirmation */
    review: (list: FixCandidate[]) => {
      const ids = list.filter((f) => fixable(f) && f.confidence !== 'low').map((f) => f.id)
      if (!ids.length) return
      setSel(new Set(ids))
      setConfirmOpen(true)
    },
    apply: () => {
      setApplying(true)
      const w = grid.width || settings.libWidth
      const h = grid.height || settings.libHeight
      const reqs: ApplyFixRequest[] = selected.map((f) => ({ id: f.id, action: actionOf(f), gridWidth: w, gridHeight: h, leafName: settings.leafName, renameLeaves }))
      emit<ApplyFixesHandler>('APPLY_FIXES', reqs)
    },
    reset: () => {
      setSel(new Set())
      setResults({})
      setAction({})
      setGroupOpen(new Set())
    }
  }
}
