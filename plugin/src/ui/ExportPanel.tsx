import { Button, Checkbox, Dropdown, Toggle } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { useState } from 'preact/hooks'
import { BASELINE_LABEL, BaselineSource } from '../core/baseline'
import { CategorySummary } from '../core/categories'
import { Diff, PreviousCatalog } from '../core/changelog'
import styles from '../styles.css'
import { Settings } from '../types'
import { InfoTip } from './InfoTip'
import { BlockIcon, CheckIcon } from './icons'
import { kb, OverviewRow } from './overview'
import { cx, plural } from './util'


export interface ExportPanelProps {
  settings: Settings
  patch: (p: Partial<Settings>) => void
  ready: number
  blocked: number
  excluded: number
  categories: CategorySummary[]
  rows: OverviewRow[] | null
  hasStrokeIcons: boolean
  release: { version: string; deprecated: { name: string; replacedBy: string; since: string }[]; diff: Diff | null }
  prevCatalog: PreviousCatalog | null
  prevError: string
  onLoadPrevious: (file: File) => void
  onClearPrevious: () => void
  baseline: {
    source: BaselineSource | null
    options: { value: BaselineSource; text: string }[]
    message: string
    canRepo: boolean
    canShare: boolean
    onPick: (v: BaselineSource | 'none') => void
    onLoadRepo: () => void
    onSaveShared: () => void
  }
  onDownload: () => void
  onSend: (() => void) | null
  onShowBlocked: () => void
  onClose: () => void
}

function Section(props: { title: string; info?: { title: string; body: preact.ComponentChildren }; children: preact.ComponentChildren }) {
  return (
    <div class={styles.section}>
      <div class={styles.fieldRow}>
        <span class={cx(styles.sectionTitle, styles.grow)}>{props.title}</span>
        {props.info && <InfoTip title={props.info.title}>{props.info.body}</InfoTip>}
      </div>
      {props.children}
    </div>
  )
}

export function ExportPanel(p: ExportPanelProps) {
  const { settings, release } = p
  const [diffOpen, setDiffOpen] = useState<string | null>(null)
  const fmtOn = (id: OverviewRow['id']) => (id === 'meta' ? true : settings.formats[id])
  const enabledRows = (p.rows ?? []).filter((r) => fmtOn(r.id))
  const files = enabledRows.reduce((a, r) => a + r.files, 0)
  const bytes = enabledRows.reduce((a, r) => a + r.bytes, 0)
  const noFormat = !Object.values(settings.formats).some(Boolean)
  const d = release.diff
  const groups: [string, string, string[]][] = d
    ? [
        ['added', 'added', d.added.map((x) => x.name)],
        ['renamed', 'renamed', d.renamed.map((x) => `${x.from} → ${x.to}`)],
        ['removed', 'removed', d.removed.map((x) => x.name)],
        ['changed', 'drawing changed', d.changed.map((x) => x.name)],
        ['recoloured', 'recoloured', d.recoloured.map((x) => x.name)],
        ['relabelled', 'layer renamed, same code name', d.relabelled.map((x) => `${x.name}: “${x.from}” → “${x.to}”`)],
        ['moved', 'moved category', d.moved.map((x) => `${x.name}: ${x.from} → ${x.to}`)]
      ]
    : []

  return (
    <div class={styles.overlay} role="dialog" aria-modal="true" aria-label="Export">
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>Export</strong>
          <Button secondary onClick={p.onClose}>Close</Button>
        </div>
      </div>

      <div class={styles.overlayBody}>
        <div class={styles.exportSummary}>
          <div><strong>{p.ready}</strong><span>icons</span></div>
          <div><strong>{p.categories.length}</strong><span>{p.categories.length === 1 ? 'category' : 'categories'}</span></div>
          <div><strong>{files}</strong><span>files</span></div>
          <div><strong>{kb(bytes)}</strong><span>unzipped</span></div>
        </div>
        {p.blocked > 0 && (
          <button class={cx(styles.iconBtn, styles.sevError)} style={{ height: 'auto', padding: '4px 6px', justifyContent: 'flex-start' }} onClick={p.onShowBlocked}>
            <BlockIcon /> {plural(p.blocked, 'icon')} blocked by errors will be skipped: review
          </button>
        )}
        {p.excluded > 0 && <div class={styles.muted}>{plural(p.excluded, 'icon')} excluded by you.</div>}

        <Section
          title="Formats"
          info={{ title: 'Formats', body: <span>Pick what to generate. Each row shows the real number of files and size for your current icons. Hover the (i) on a row for what it contains. The manifest and guide are always included.</span> }}
        >
          {(p.rows ?? []).map((r) => (
            <div class={cx(styles.ovRow, !fmtOn(r.id) && styles.ovOff)} key={r.id}>
              <div class={styles.fieldRow}>
                {r.id === 'meta' ? (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><CheckIcon /> {r.label}</span>
                ) : (
                  <Checkbox value={settings.formats[r.id]} onValueChange={(v) => p.patch({ formats: { ...settings.formats, [r.id]: v } })}>{r.label}</Checkbox>
                )}
                <InfoTip title={r.label}><span>{r.detail}</span></InfoTip>
              </div>
              <span class={styles.ovMeta}>{r.files} file{r.files === 1 ? '' : 's'} · {kb(r.bytes)}</span>
            </div>
          ))}
          {!p.rows && <div class={styles.muted}>Calculating…</div>}
        </Section>

        {(p.categories.length > 0 || p.hasStrokeIcons) && (
          <Section title="Options">
            {p.categories.length > 0 && (
              <div class={styles.fieldRow}>
                <div class={styles.grow}>
                  <Toggle value={settings.splitByCategory} onValueChange={(v) => p.patch({ splitByCategory: v })}>
                    Split output by category ({p.categories.length})
                  </Toggle>
                </div>
                <InfoTip title="Split by category">
                  <span>Writes <code>svg/&lt;category&gt;/…</code> folders and one extra sprite per category so apps can load only what they need. Categories: {p.categories.map((c) => `${c.label} (${c.count})`).join(', ')}.</span>
                </InfoTip>
              </div>
            )}
            {p.hasStrokeIcons && (
              <div class={styles.fieldRow}>
                <div class={styles.grow}>
                  <Toggle value={settings.outlineStrokes} onValueChange={(v) => p.patch({ outlineStrokes: v })}>
                    Convert strokes to paths
                  </Toggle>
                </div>
                <InfoTip title="Strokes">
                  <span>Stroke weight policy is <strong>{settings.strokePolicy === 'constant' ? 'constant' : settings.strokePolicy === 'table' ? 'weight by size' : 'scale with icon'}</strong> (change it in Settings → Strokes). Converting to paths freezes the look everywhere but removes live stroke-weight control. You can also decide per icon.</span>
                </InfoTip>
              </div>
            )}
          </Section>
        )}

        <Section
          title="Version & identity"
          info={{
            title: 'How icons are identified (and why it matters)',
            body: (
              <span>
                <strong>The problem.</strong> An icon’s <em>name</em> is what your code uses (<code>name="search"</code>). If a designer renames it in Figma, the next export has a different name and code silently breaks.
                <br /><br />
                <strong>The approach (Labs).</strong> The icon’s <em>identity</em> is its Figma <strong>component key</strong>, which survives renames. Load your previous <code>icons.json</code> and the tool matches icons by key: renamed icons get the old name as a <em>deprecated alias</em> (it keeps working for one major version), removed icons are listed, and a version bump is suggested (rename/removal = major, new icon = minor, drawing/colour change = patch). You also get a <code>CHANGELOG.md</code>.
                <br /><br />
                <strong>Limits.</strong> Needs components (frames have no key; they fall back to name matching). Nothing is sent anywhere: the comparison happens here.
              </span>
            )
          }}
        >
          {p.baseline.options.length > 0 && (
            <div class={styles.fieldRow}>
              <div class={styles.grow}>
                <Dropdown
                  value={p.baseline.source ?? 'none'}
                  onValueChange={(v) => p.baseline.onPick(v as BaselineSource | 'none')}
                  options={[{ value: 'none', text: 'Compare with: nothing (version 1.0.0)' }, ...p.baseline.options.map((o) => ({ value: o.value, text: 'Compare with: ' + o.text }))]}
                />
              </div>
            </div>
          )}
          {p.baseline.source && <div class={styles.muted}>Baseline: {BASELINE_LABEL[p.baseline.source]}. Priority is repo, then shared in this file, then this computer, then a loaded file.</div>}
          <div class={styles.fieldRow}>
            {p.baseline.canRepo && <button class={styles.linkBtn} onClick={p.baseline.onLoadRepo}>Read from project repo</button>}
            {p.baseline.canShare && <button class={styles.linkBtn} onClick={p.baseline.onSaveShared} title="Writes one small entry into this Figma file (visible to everyone with access, including Dev Mode)">Save as shared baseline (writes to file)</button>}
          </div>
          {p.baseline.message && <div class={styles.muted}>{p.baseline.message}</div>}
          {!p.prevCatalog && <div class={styles.muted}>Export once and this computer remembers it, so the next scan shows what changed. You can also load an <code>icons.json</code> to get a changelog, a suggested version and deprecated aliases for renamed icons. Without it, this is version <strong>1.0.0</strong>.</div>}
          {p.prevCatalog && d && (
            <div class={styles.release}>
              <div class={styles.releaseChips}>
                {groups.map(([key, label, items]) => (
                  <button key={key} class={cx(styles.chip, diffOpen === key && styles.chipActive)} disabled={items.length === 0} aria-pressed={diffOpen === key} onClick={() => setDiffOpen(diffOpen === key ? null : key)} style={items.length === 0 ? { opacity: 0.45, cursor: 'default' } : undefined}>
                    <strong>{items.length}</strong> {label}
                  </button>
                ))}
              </div>
              {diffOpen && (
                <div class={styles.diffNames}>
                  {(groups.find((g) => g[0] === diffOpen)?.[2] ?? []).slice(0, 80).map((t) => <div key={t} class={styles.mono}>{t}</div>)}
                </div>
              )}
              <div>
                Suggested version <strong>{release.version}</strong> ({d.bump === 'none' ? 'no code-facing changes' : d.bump}). Matched by component key: {d.matchedBy.key}, by name: {d.matchedBy.name}.
              </div>
              {d.renamed.length > 0 && <div class={styles.muted}>Deprecated aliases: {d.renamed.slice(0, 4).map((r) => `${r.from} → ${r.to}`).join(', ')}{d.renamed.length > 4 ? '…' : ''}</div>}
            </div>
          )}
          {p.prevError && <div class={styles.sevError}>{p.prevError}</div>}
          <div class={styles.fieldRow}>
            <label class={styles.fileBtn}>
              {p.prevCatalog ? 'Replace previous icons.json…' : 'Load previous icons.json…'}
              <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) p.onLoadPrevious(f); (e.currentTarget as HTMLInputElement).value = '' }} />
            </label>
            {p.prevCatalog && <button class={styles.iconBtn} onClick={p.onClearPrevious}>Clear</button>}
          </div>
        </Section>
      </div>

      <div class={styles.footer}>
        <Button fullWidth onClick={p.onDownload} disabled={p.ready === 0 || noFormat}>
          {noFormat ? 'Choose at least one format' : `Download ZIP (${plural(p.ready, 'icon')} · ${files} files)`}
        </Button>
        {p.onSend && <Button fullWidth secondary onClick={p.onSend} disabled={p.ready === 0 || noFormat}>Send to project folder…</Button>}
      </div>
    </div>
  )
}
