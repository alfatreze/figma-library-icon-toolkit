import { Button } from '@create-figma-plugin/ui'
import { emit, on } from '@create-figma-plugin/utilities'
import { h } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { buildFiles } from '../core/generators'
import { processIcons, ThemeCache } from '../core/process'
import { angularSnippet, htmlSnippet, reactComponentSnippet, SnippetInput } from '../core/snippets'
import { cleanNamespace } from '../core/naming'
import { zipFiles } from '../core/zip'
import styles from '../styles.css'
import { copyText, download, notify } from './util'
import {
  DEFAULT_SETTINGS, Icon, RawIcon, ScanBatchHandler, ScanDoneHandler, ScanErrorHandler, ScanHandler, ScanStartHandler, SelectionHandler,
  Settings, SettingsLoadedHandler, UiReadyHandler
} from '../types'


function snippetInput(icon: Icon, settings: Settings): SnippetInput {
  return { ns: cleanNamespace(settings.namespace), name: icon.name, spritePath: './icons/sprite/', sizePx: null, sizeUnit: 'px', vars: {} }
}

/**
 * Dev Mode inspect panel (read-only): the icons used in the selection, with the code to use them, and a ZIP of just those icons.
 * Settings come from the config published in the file, so the output matches what the design system exports.
 */
export function InspectPanel() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [raws, setRaws] = useState<RawIcon[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const scanSelection = () => {
    const s = settingsRef.current
    emit<ScanHandler>('SCAN', { mode: 'auto', scope: 'selection', usageOnly: true, maxIconSize: s.maxIconSize, compositeFrames: 'ignore', leafName: s.leafName, leafNameMode: s.leafNameMode })
  }

  useEffect(() => {
    const offs = [
      on<SettingsLoadedHandler>('SETTINGS_LOADED', (s) => setSettings(s)),
      on<ScanStartHandler>('SCAN_START', () => {
        setBusy(true)
        setError('')
        setRaws([])
      }),
      on<ScanBatchHandler>('SCAN_BATCH', (icons) => setRaws((prev) => prev.concat(icons))),
      on<ScanDoneHandler>('SCAN_DONE', () => setBusy(false)),
      on<ScanErrorHandler>('SCAN_ERROR', (m) => {
        setBusy(false)
        setError(m)
      }),
      on<SelectionHandler>('SELECTION', (count) => {
        setSelected(count)
        if (timer.current) clearTimeout(timer.current)
        if (count === 0) {
          setRaws([])
          return
        }
        timer.current = setTimeout(scanSelection, 250) // selection changes in bursts
      })
    ]
    emit<UiReadyHandler>('UI_READY')
    return () => {
      offs.forEach((o) => o())
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const themeCache = useRef<ThemeCache>(new Map())
  const processed = useMemo(() => processIcons(raws, settings, {}, {}, themeCache.current), [raws, settings])
  const icons = processed.icons.filter((i) => i.svgOk)

  const makeZip = () => {
    try {
      const files = buildFiles({ allIcons: processed.icons, settings, grid: processed.grid, tier: processed.tier, generatedAt: new Date().toISOString().slice(0, 10) })
      download(`${cleanNamespace(settings.namespace)}-icons-used.zip`, zipFiles(files), 'application/zip')
      notify(`Downloaded ${icons.length} icons`)
    } catch (e) {
      notify(`Could not build the ZIP: ${e instanceof Error ? e.message : String(e)}`, true)
    }
  }
  const copy = (label: string, text: string) => notify(copyText(text) ? `${label} copied` : 'Copy is blocked here; select the text and copy it', false)

  return (
    <div class={styles.root}>
      <div class={styles.header}>
        <strong>Icons in your selection</strong>
        <span class={styles.muted}>
          {selected === 0 ? 'Select an icon, or a frame that contains icons.' : busy ? 'Reading icons…' : `${icons.length} icon${icons.length === 1 ? '' : 's'} found`}
        </span>
      </div>
      <div class={styles.list}>
        {error && <div class={styles.sevError}>{error}</div>}
        {icons.map((icon) => {
          const input = snippetInput(icon, settings)
          const isOpen = open === icon.key
          return (
            <div key={icon.key} class={styles.row}>
              <div class={styles.fieldRow} style={{ alignItems: 'center', padding: '6px 0' }}>
                <span style={{ width: 28, height: 28, flex: 'none', color: 'var(--figma-color-text)' }} dangerouslySetInnerHTML={{ __html: icon.standalone }} />
                <div class={styles.grow}>
                  <div class={styles.mono}>{icon.name}</div>
                  <div class={styles.muted}>{[icon.categoryLabel, icon.usage ? `×${icon.usage.instances}` : '', icon.kind].filter(Boolean).join(' · ')}</div>
                </div>
                <button class={styles.linkBtn} onClick={() => setOpen(isOpen ? null : icon.key)} aria-expanded={isOpen}>{isOpen ? 'Hide' : 'Code'}</button>
              </div>
              {isOpen && (
                <div class={styles.section}>
                  <div class={styles.fieldRow}>
                    <Button secondary onClick={() => copy('Angular', angularSnippet(input))}>Copy Angular</Button>
                    <Button secondary onClick={() => copy('HTML', htmlSnippet(input))}>Copy HTML</Button>
                    <Button secondary onClick={() => copy('React', reactComponentSnippet(input))}>Copy React</Button>
                    <Button secondary onClick={() => download(`${cleanNamespace(settings.namespace)}-${icon.name}.svg`, icon.standalone, 'image/svg+xml')}>SVG</Button>
                  </div>
                  <pre class={styles.mono} style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 11 }}>{angularSnippet(input)}</pre>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div class={styles.footer}>
        <Button fullWidth onClick={makeZip} disabled={icons.length === 0}>Download ZIP of these {icons.length} icons</Button>
      </div>
    </div>
  )
}
