import { on } from '@create-figma-plugin/utilities'
import { useEffect, useRef, useState } from 'preact/hooks'
import { RawIcon, ScanBatchHandler, ScanDoneHandler, ScanErrorHandler, ScanPhaseHandler, ScanStartHandler, ScanSummary } from '../../types'
import { notify } from '../util'

const FLUSH_MS = 250

/**
 * Everything about the running scan: the rows found so far, progress and the final summary.
 * Batches arrive every few icons; appending each to React state would copy the whole list every time (quadratic on big libraries),
 * so they are collected in a ref and published at most every FLUSH_MS.
 * `onStart` lets the caller reset the state that belongs to the previous scan (filters, selected fixes…) in one place.
 */
export function useScan(onStart: () => void) {
  const [raws, setRaws] = useState<RawIcon[]>([])
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const buf = useRef<RawIcon[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef(onStart)
  start.current = onStart

  useEffect(() => {
    const flush = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      setRaws(buf.current.slice())
    }
    const offs = [
      on<ScanStartHandler>('SCAN_START', () => {
        buf.current = []
        setRaws([])
        setSummary(null)
        setScanning(true)
        setProgress(0)
        setPhase('Starting…')
        setScanError(null)
        start.current()
      }),
      on<ScanPhaseHandler>('SCAN_PHASE', (t) => setPhase(t)),
      on<ScanBatchHandler>('SCAN_BATCH', (icons, p) => {
        buf.current.push(...icons)
        if (!timer.current) timer.current = setTimeout(flush, FLUSH_MS)
        setProgress(p)
      }),
      on<ScanDoneHandler>('SCAN_DONE', (s) => {
        flush()
        setSummary(s)
        setScanning(false)
        setProgress(1)
        setPhase('')
      }),
      on<ScanErrorHandler>('SCAN_ERROR', (m) => {
        if (/already running|being applied/.test(m)) return notify(m, true) // a second request was refused; the running one is unaffected
        flush()
        setScanError(m)
        setScanning(false)
        setPhase('')
      })
    ]
    return () => {
      offs.forEach((o) => o())
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return { raws, summary, scanning, progress, phase, scanError }
}
