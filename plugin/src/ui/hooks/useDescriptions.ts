import { emit, on } from '@create-figma-plugin/utilities'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { buildTemplate, DescriptionPlan, hasOwnDescription, planDescriptions, readTemplate } from '../../core/descriptions'
import { ApplyDescriptionsHandler, DescriptionsAppliedHandler, Icon } from '../../types'
import { download, plural } from '../util'

/**
 * The descriptions helper: download a template, read the filled one back, show what would change, and (Labs) write it.
 * Nothing is written until `apply`; the main thread re-checks Labs and every description against the file.
 */
export function useDescriptions(icons: Icon[], namespace: string) {
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState('')
  const [problems, setProblems] = useState<string[]>([])
  const [rows, setRows] = useState<{ nodeId: string; description: string }[] | null>(null)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    const off = on<DescriptionsAppliedHandler>('DESCRIPTIONS_APPLIED', (ok, skipped, failed, message) => {
      setApplying(false)
      setRows(null)
      setFileName('')
      const parts = [`${plural(ok, 'description')} written`, skipped ? `${skipped} left alone (changed in the file since the scan, or from a library)` : '', failed ? `${failed} failed${message ? ` (${message})` : ''}` : '']
      setResult(parts.filter(Boolean).join('; ') + (ok ? '. Cmd/Ctrl+Z undoes them together. Scan again to refresh the list.' : '.'))
    })
    return () => off()
  }, [])

  const own = useMemo(() => icons.filter(hasOwnDescription), [icons])
  const missing = own.filter((i) => !i.description.trim()).length
  const plan: DescriptionPlan | null = useMemo(() => (rows ? planDescriptions(rows, icons) : null), [rows, icons])

  return {
    open,
    show: () => {
      setOpen(true)
      setResult('')
    },
    close: () => {
      if (!applying) setOpen(false)
    },
    total: own.length,
    missing,
    fileName,
    problems,
    plan,
    applying,
    result,
    downloadTemplate: (onlyMissing: boolean) => download(`${namespace}-descriptions${onlyMissing ? '-missing' : ''}.csv`, buildTemplate(icons, { onlyMissing }), 'text/csv'),
    load: async (file: File) => {
      setResult('')
      const r = readTemplate(await file.text())
      setFileName(file.name)
      setProblems(r.problems)
      setRows(r.rows.length ? r.rows : null)
    },
    clear: () => {
      setRows(null)
      setFileName('')
      setProblems([])
    },
    apply: () => {
      if (!plan || !plan.changes.length) return
      setApplying(true)
      emit<ApplyDescriptionsHandler>('APPLY_DESCRIPTIONS', plan.changes.map((c) => ({ nodeId: c.nodeId, from: c.from, to: c.to })))
    }
  }
}
