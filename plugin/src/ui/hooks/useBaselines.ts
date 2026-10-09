import { emit, on } from '@create-figma-plugin/utilities'
import { useEffect, useMemo, useState } from 'preact/hooks'
import {
  BaselineSource, catalogToSnapshot, changesByName, decodeSnapshot, encodeSnapshot, makeSnapshot, pickBaseline, Snapshot, snapshotToCatalog
} from '../../core/baseline'
import { bumpVersion, diffCatalogs, nextDeprecated, parseCatalog, PreviousCatalog } from '../../core/changelog'
import { BaselinesHandler, BaselineSavedHandler, Icon, SaveBaselineHandler, Settings } from '../../types'
import { outputReady } from '../../core/outputs'
import { clientFor } from '../repoClient'
import { countChanges } from '../selectors'

/**
 * "Changed since": the baseline sources (repo / shared in file / this computer / loaded file), which one is used, the diff against it
 * and the release (suggested version + deprecated aliases) derived from that diff.
 */
export function useBaselines(exportable: Icon[], settings: Settings) {
  const [fileCatalog, setFileCatalog] = useState<PreviousCatalog | null>(null)
  const [repoCatalog, setRepoCatalog] = useState<PreviousCatalog | null>(null)
  const [localSnap, setLocalSnap] = useState<Snapshot | null>(null)
  const [sharedSnap, setSharedSnap] = useState<Snapshot | null>(null)
  const [choice, setChoice] = useState<BaselineSource | 'none' | null>(null) // null = the most authoritative one available
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    const offs = [
      on<BaselinesHandler>('BASELINES', (local, shared) => {
        setLocalSnap(decodeSnapshot(local))
        setSharedSnap(decodeSnapshot(shared))
      }),
      on<BaselineSavedHandler>('BASELINE_SAVED', (target, ok, msg) => {
        if (target === 'shared' || !ok) setMessage(msg)
      })
    ]
    return () => offs.forEach((o) => o())
  }, [])

  const catalogs = useMemo<Record<BaselineSource, PreviousCatalog | null>>(
    () => ({ repo: repoCatalog, shared: sharedSnap ? snapshotToCatalog(sharedSnap) : null, local: localSnap ? snapshotToCatalog(localSnap) : null, file: fileCatalog }),
    [repoCatalog, sharedSnap, localSnap, fileCatalog]
  )
  const source: BaselineSource | null =
    choice === 'none'
      ? null
      : choice && catalogs[choice]
        ? choice
        : pickBaseline({ repo: repoCatalog && catalogToSnapshot(repoCatalog), shared: sharedSnap, local: localSnap, file: fileCatalog && catalogToSnapshot(fileCatalog) })
  const previous = source ? catalogs[source] : null

  const meta = (src: BaselineSource) => {
    const sn = src === 'local' ? localSnap : src === 'shared' ? sharedSnap : null
    const c = catalogs[src]
    return [c ? `${c.icons.length} icons` : '', c?.libraryVersion ? `v${c.libraryVersion}` : '', sn?.at ? sn.at.slice(0, 10) : ''].filter(Boolean).join(' · ')
  }

  const release = useMemo(() => {
    const catalog = exportable.map((i) => ({ name: i.name, hash: i.hash, colorHash: i.colorHash, category: i.category, figma: { componentKey: i.componentKey, layerName: i.layerName } }))
    const diff = previous ? diffCatalogs(previous, catalog) : null
    const version = previous ? bumpVersion(previous.libraryVersion, diff!.bump) : '1.0.0'
    const deprecated = nextDeprecated(previous, diff, version, new Set(catalog.map((c) => c.name)))
    return { version, deprecated, diff }
  }, [exportable, previous])
  const changes = useMemo(() => changesByName(release.diff), [release.diff])
  const changeCounts = useMemo(() => countChanges(changes), [changes])

  /** the local snapshot is automatic and never touches the file; the shared one is an explicit Labs action */
  const snapshotNow = (target: 'local' | 'shared') => {
    const catalog = exportable.map((i) => ({ name: i.name, hash: i.hash, colorHash: i.colorHash, category: i.category, figma: { componentKey: i.componentKey ?? null, layerName: i.layerName } }))
    emit<SaveBaselineHandler>('SAVE_BASELINE', encodeSnapshot(makeSnapshot(catalog, { at: new Date().toISOString(), version: release.version, namespace: settings.namespace })), target)
  }
  const saveShared = () => {
    setMessage('Saving…')
    snapshotNow('shared')
  }
  const loadRepo = async () => {
    try {
      // every output carries the same icons.json, so the first one that is ready is the baseline
      const out = settings.outputs.find((o) => outputReady(o, settings.tokens))
      if (!out) {
        setMessage('Add a repository and its token in Settings → Output first.')
        return
      }
      const client = clientFor(out, settings.tokens)
      const info = await client.info()
      const folder = out.subdir.replace(/^\/+|\/+$/g, '')
      const text = await client.readFile(info.defaultBranch, `${folder}/icons.json`)
      if (text === null) {
        setMessage(`No icons.json in “${out.subdir}” on ${info.defaultBranch} yet.`)
        return
      }
      setRepoCatalog(parseCatalog(text))
      setChoice('repo')
      setMessage('')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }
  const loadFile = async (file: File) => {
    try {
      setFileCatalog(parseCatalog(await file.text()))
      setChoice('file')
      setLoadError('')
    } catch (e) {
      setFileCatalog(null)
      setLoadError(e instanceof Error ? e.message : 'Could not read the file')
    }
  }

  return { source, previous, catalogs, meta, release, changes, changeCounts, message, loadError, snapshotNow, saveShared, loadRepo, loadFile, pick: setChoice }
}
