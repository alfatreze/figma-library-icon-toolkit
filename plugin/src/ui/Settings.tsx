import { Button, Checkbox, Dropdown, Textbox, TextboxMultiline, Toggle } from '@create-figma-plugin/ui'
import { FormatCards } from './components/FormatCards'
import { Segmented } from './components/Segmented'
import { TabBar } from './components/TabBar'
import { HOSTS, parseRepoInput } from '../core/gitHost'
import { OverviewRow } from './overview'
import { Dialog } from './Dialog'
import { ComponentChildren, Fragment, h } from 'preact'
import { useState } from 'preact/hooks'
import { cleanNamespace } from '../core/naming'
import { STROKE_POLICY_INFO, validateStrokeTable } from '../core/stroke'
import { suggestMapping, TOKEN_MODES, tokenPreview } from '../core/tokens'
import styles from './styles'
import { plural } from './util'
import { CategorySource, OutputSettings, ScanMode, Settings, StrokePolicy, TokenMode } from '../types'
import { InfoTip } from './InfoTip'
import { Field, Row } from './components/Field'
import { OutputsTab } from './OutputsTab'

const num = (v: string, fallback: number) => {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export type SettingsTab = 'packages' | 'output' | 'style' | 'scan' | 'team' | 'labs'
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'packages', label: 'Packages' },
  { id: 'output', label: 'Output' },
  { id: 'style', label: 'Style' },
  { id: 'scan', label: 'Scan' },
  { id: 'team', label: 'Team' },
  { id: 'labs', label: 'Labs' }
]

export interface SettingsExtras {
  /** per-format file counts and sizes (computed while Settings or Export is open) */
  overview: OverviewRow[] | null
  exampleVariable: { variable: string; collection?: string }
  /** every distinct Figma variable bound in the last scan */
  scanVariables: { variable: string; collection?: string; modes?: Record<string, string> }[]
  onOpenMapping: () => void
  onAttachDevResources: () => void
  onCopyDiagnostics: () => void
  scannedComponents: number
  onExportConfig: () => void
  onImportConfig: (file: File) => void
  configMessage: string
  shared: { at: string; by: string | null; differs: boolean } | null
  onPublish: () => void
  onUseShared: () => void
  testMessages: Record<string, string>
  outputProblems: Record<string, string[]>
  onTestRepo: (o: OutputSettings) => void
}

export function SettingsPanel({ settings, patch, onClose, extras, initialTab = 'packages' }: { settings: Settings; patch: (p: Partial<Settings>) => void; onClose: () => void; extras: SettingsExtras; initialTab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const f = settings.formats
  const setFormat = (k: keyof Settings['formats'], v: boolean) => patch({ formats: { ...f, [k]: v } })
  const ns = cleanNamespace(settings.namespace)
  return (
    <Dialog label="Settings" onClose={onClose}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>Settings</strong>
          <Button onClick={onClose}>Done</Button>
        </div>
        <div class={styles.muted}>Saved on this computer. Nothing is written to your Figma file.</div>
      </div>
      <TabBar label="Settings sections" tabs={SETTINGS_TABS} value={tab} onChange={setTab} />
      <div class={styles.overlayBody} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'packages' && (
          <Fragment>
            <div class={styles.section}>
              <span class={styles.sectionTitle}>What to export</span>
              <FormatCards formats={f} onToggle={(k, on) => setFormat(k, on)} rows={extras.overview} />
            </div>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Package</span>
          <Field
            label="Name prefix"
            info={{
              title: 'Namespace',
              body: (
                <span>
                  A short lowercase prefix for the whole library (e.g. <code>cmn</code>). It becomes the file prefix (<code>{ns}-home.svg</code>), the CSS class and variable prefix (<code>--{ns}-icon-color</code>) and the Angular tag (<code>&lt;{ns}-icon&gt;</code>). Keep it 2–4 letters and unique to your product.
                </span>
              )
            }}
          >
            <Textbox value={settings.namespace} onValueInput={(v) => patch({ namespace: v })} placeholder="cmn" />
          </Field>
          {settings.namespace.trim() && settings.namespace.trim() !== ns && (
            <div class={styles.muted}>Used as “{ns}”: only lowercase letters, digits and hyphens are kept.</div>
          )}
          <Field
            label="Import path"
            info={{
              title: 'Import path in code snippets',
              body: (
                <span>
                  Where developers import the Angular and React components from in the snippets shown in Dev Mode and in the Inspect panel, e.g. <code>./icons</code> (copy <code>angular/</code> or <code>react/</code> into your app as <code>icons/</code>), <code>@/icons</code> or <code>~/icons</code>. Part of the team config, so everyone sees the same snippet.
                </span>
              )
            }}
          >
            <Textbox value={settings.importPath} onValueInput={(v) => patch({ importPath: v })} placeholder="./icons" />
          </Field>
          {settings.importPath.trim() !== '' && !/^[\w@~./-]{1,80}$/.test(settings.importPath.trim()) && <div class={styles.sevWarn}>Only letters, digits and . / @ ~ _ - are allowed; snippets use ./icons until this is fixed.</div>}
          <Row
            info={{
              title: 'Split output by category',
              body: (
                <span>
                  Writes <code>svg/&lt;category&gt;/…</code> folders and one extra sprite per category (<code>sprite/{ns}-&lt;category&gt;-sprite.svg</code>) next to the full sprite, so an app can load only what a page needs. The manifest, Angular data and test page always include the category either way.
                </span>
              )
            }}
          >
            <Toggle value={settings.splitByCategory} onValueChange={(v) => patch({ splitByCategory: v })}>
              Split output by category
            </Toggle>
          </Row>
        </div>
          </Fragment>
        )}

        {tab === 'output' && <OutputsTab settings={settings} patch={patch} testMessages={extras.testMessages} problems={extras.outputProblems} onTest={extras.onTestRepo} />}

        {tab === 'style' && (
          <Fragment>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Colour and paths</span>
          <Row
            info={{
              title: 'Themeable colours',
              body: (
                <span>
                  Replaces hard-coded colours with CSS variables so developers can recolour icons without editing SVG: the most-used colour becomes <code>--{ns}-icon-color</code> (default <code>currentColor</code>), others become <code>--{ns}-icon-color-2…</code> with their drawn colour as default. Turn off to keep colours exactly as drawn.
                </span>
              )
            }}
          >
            <Toggle value={settings.colorMode === 'themeable'} onValueChange={(v) => patch({ colorMode: v ? 'themeable' : 'original' })}>
              Themeable colours (CSS variables)
            </Toggle>
          </Row>
          <Field
            label="Path detail"
            info={{ title: 'Path precision', body: <span>Decimals kept in path data. Fewer decimals = smaller files; 2–3 is visually lossless for 24px icons. Use 4 for icons that are displayed very large.</span> }}
          >
            <Dropdown
              value={String(settings.precision)}
              onValueChange={(v) => patch({ precision: Number(v) })}
              options={['1', '2', '3', '4'].map((v) => ({ value: v, text: `${v} decimals` }))}
            />
          </Field>
        </div>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>CSS variable names</span>
          <Field
            label="Names from"
            info={{
              title: 'How CSS token names are built',
              body: (
                <span>
                  When an icon colour is bound to a Figma variable, the export adds a fallback to your own CSS token so icons follow your theme: <code>var(--ns-icon-color, var(--your-token, currentColor))</code>. Pick how the token name is derived:
                  <ul class={styles.tipList}>
                    {TOKEN_MODES.map((m) => (
                      <li key={m.value}><strong>{m.label}</strong>: {m.detail} <em>e.g. {m.example}</em></li>
                    ))}
                  </ul>
                  If a token is not defined in the app, the fallback quietly uses the icon’s own colour, so nothing breaks.
                </span>
              )
            }}
          >
            <Dropdown
              value={settings.tokenNaming.mode}
              onValueChange={(v) => patch({ tokenNaming: { ...settings.tokenNaming, mode: v as TokenMode } })}
              options={TOKEN_MODES.map((m) => ({ value: m.value, text: m.label }))}
            />
          </Field>
          {settings.tokenNaming.mode !== 'none' && (
            <Field label="Prefix" info={{ title: 'Token prefix', body: <span>Added in front of every token name, e.g. <code>ds</code> gives <code>--ds-color-neutral-darkest</code>. Match your design-token package prefix. Leave empty for none.</span> }}>
              <Textbox value={settings.tokenNaming.prefix} onValueInput={(v) => patch({ tokenNaming: { ...settings.tokenNaming, prefix: v } })} placeholder="(none)" />
            </Field>
          )}
          {settings.tokenNaming.mode !== 'none' && settings.tokenNaming.mode !== 'custom' && (
            <Field label="Drop leading parts" info={{ title: 'Drop leading path parts', body: <span>Comma-separated segments removed from the start of the variable path. With <code>color</code> dropped, <code>color/neutral/darkest</code> becomes <code>--neutral-darkest</code>. Use it when your CSS tokens omit a top-level group.</span> }}>
              <Textbox value={settings.tokenNaming.stripSegments} onValueInput={(v) => patch({ tokenNaming: { ...settings.tokenNaming, stripSegments: v } })} placeholder="e.g. color" />
            </Field>
          )}
          {settings.tokenNaming.mode === 'custom' && (
            <Field label="Mapping table" info={{ title: 'Custom mapping', body: <span>One mapping per line: <code>figma/variable/name = --css-variable</code>. Lines starting with <code>#</code> are comments. Scope a line to a collection with <code>Collection::name</code>, or map a whole group with a wildcard: <code>color/icon/* = --icon-*</code> (longest match wins). Variables that are not listed use the path rule (with the prefix above).</span> }}>
              <div class={styles.fieldRow}>
                <button class={styles.linkBtn} disabled={extras.scanVariables.length === 0} data-hint={extras.scanVariables.length ? '' : 'Scan first: the table is built from the variables your icons use'} onClick={() => patch({ tokenNaming: { ...settings.tokenNaming, mapping: suggestMapping(extras.scanVariables, settings.tokenNaming) } })}>
                  Fill from scan ({plural(extras.scanVariables.length, 'variable')})
                </button>
                <button class={styles.linkBtn} disabled={extras.scanVariables.length === 0} data-hint={extras.scanVariables.length ? 'See every variable with its colours per mode and name it in a table' : 'Scan first: the table is built from the variables your icons use'} onClick={extras.onOpenMapping}>
                  Open as table…
                </button>
              </div>
              <TextboxMultiline rows={8} value={settings.tokenNaming.mapping} onValueInput={(v) => patch({ tokenNaming: { ...settings.tokenNaming, mapping: v } })} placeholder={'color/icon/default = --icon-color\ncolor/icon/muted = --icon-muted'} />
            </Field>
          )}
          <div class={styles.muted}>
            Preview: <code>{extras.exampleVariable.variable}</code> → <code>{tokenPreview(extras.exampleVariable, settings.tokenNaming)}</code>
          </div>
        </div>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Strokes</span>
          <Field
            label="Stroke weight"
            info={{
              title: 'Stroke weight policy',
              body: (
                <span>
                  How line icons keep their stroke weight when shown at different sizes:
                  <ul class={styles.tipList}>
                    {STROKE_POLICY_INFO.map((m) => (
                      <li key={m.value}><strong>{m.label}</strong>: {m.detail}</li>
                    ))}
                  </ul>
                  Applies to icons with live strokes. Developers can still override it with <code>--{ns}-icon-stroke-width</code>.
                </span>
              )
            }}
          >
            <Dropdown
              value={settings.strokePolicy}
              onValueChange={(v) => patch({ strokePolicy: v as StrokePolicy })}
              options={STROKE_POLICY_INFO.map((m) => ({ value: m.value, text: m.label }))}
            />
          </Field>
          {settings.strokePolicy === 'table' && (
            <Field
              label="Weight by size"
              info={{ title: 'Weight by size', body: <span>Comma-separated <code>size:weight</code> pairs in px. Example <code>16:1.5, 24:2, 32:2, 64:3</code>: 2px at 32, 3px at 64. A size uses the largest listed size that is not bigger than it. Size classes (<code>{ns}-icon--s32</code>) and the Angular component apply the right weight automatically.</span> }}
            >
              <Textbox value={settings.strokeTable} onValueInput={(v) => patch({ strokeTable: v })} placeholder="16:1.5, 24:2, 32:2, 64:3" />
            </Field>
          )}
          {settings.strokePolicy === 'table' && validateStrokeTable(settings.strokeTable) && <div class={styles.sevError}>{validateStrokeTable(settings.strokeTable)}</div>}
          <Row
            info={{
              title: 'Convert strokes to paths',
              body: (
                <span>
                  Exports line icons with their strokes converted to filled shapes (read from Figma’s own stroke outline; your file is not touched). The icon then looks identical everywhere, but the stroke weight can no longer be changed in code, and colour/size stay themeable. You can also switch this per icon in its details. If Figma cannot provide an exact outline (masks, gradients), the normal export is used instead.
                </span>
              )
            }}
          >
            <Toggle value={settings.outlineStrokes} onValueChange={(v) => patch({ outlineStrokes: v })}>
              Convert strokes to paths on export
            </Toggle>
          </Row>
        </div>
          </Fragment>
        )}

        {tab === 'scan' && (
          <Fragment>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>What counts as an icon</span>
          <Row info={{ title: 'Only icons used in designs', body: <span>Finds the icons that are actually <em>placed</em> as instances in your designs, including components from a linked library, instead of every icon that exists. Each icon is listed once with how often it is used, which sizes are used and which overrides designers applied. Use it on an app file to export just the subset in use.</span> }}>
            <Toggle value={settings.usageOnly} onValueChange={(v) => patch({ usageOnly: v })}>Only icons used in designs (instances)</Toggle>
          </Row>
          <Field
            label="Scan mode"
            info={{
              title: 'Scan mode',
              body: (
                <span>
                  What counts as an icon. <strong>Auto</strong>: components, instances and small frames made of vectors. <strong>Components only</strong>: ignore plain frames. <strong>Frames only</strong>: treat frames (and instances) as icons. <strong>Include loose layers</strong>: also lone vectors/shapes (names are usually unreliable).
                </span>
              )
            }}
          >
            <Dropdown
              value={settings.scanMode}
              onValueChange={(v) => patch({ scanMode: v as ScanMode })}
              options={[
                { value: 'auto', text: 'Auto (components, instances, frames)' },
                { value: 'components', text: 'Components only' },
                { value: 'frames', text: 'Frames only' },
                { value: 'loose', text: 'Include loose layers' }
              ]}
            />
          </Field>
          <Field label="Max icon size" info={{ title: 'Max icon size', body: <span>Layers larger than this (in px, either side) are not treated as icons and show up under <em>Skipped</em>. Raise it for big illustrations.</span> }}>
            <Textbox value={String(settings.maxIconSize)} onValueInput={(v) => patch({ maxIconSize: num(v, 128) })} />
          </Field>
          <Field
            label="Audit level"
            info={{
              title: 'Strictness',
              body: (
                <span>
                  How hard the audit judges structure. <strong>Lenient</strong>: only unexportable things (text, images, empty) block export. <strong>Standard</strong>: default Figma names also block. <strong>Strict</strong>: design-system grade; loose frames, unbound colours and missing tags escalate to warnings or errors. Blocked icons are skipped on export.
                </span>
              )
            }}
          >
            <Segmented
              value={settings.profile}
              onValueChange={(v) => patch({ profile: v as Settings['profile'] })}
              options={[{ value: 'lenient', children: 'Relaxed' }, { value: 'standard', children: 'Standard' }, { value: 'strict', children: 'Strict' }]}
            />
          </Field>
          <Field
            label="Layer name"
            info={{
              title: 'Standard vector layer name',
              body: (
                <span>
                  Figma keeps fill/stroke overrides when you swap an instance to another icon only if the layers inside have <strong>matching names</strong>, so every icon should name its vector layer the same.
                  <ul class={styles.tipList}>
                    <li><strong>Detect from file (recommended)</strong>: uses the name most of your icons already use (e.g. <code>Vector</code>) and flags the exceptions (<code>vector</code>, <code>Union</code>, <code>Path 3</code>…). The scan shows what it found.</li>
                    <li><strong>Fixed</strong>: always use the name below.</li>
                  </ul>
                  Icons with several vector layers get <code>Name</code>, <code>Name 2</code>… ordered by colour then z-order. Whether Figma compares names case-sensitively is not documented, so case-only differences are flagged and labelled as such.
                </span>
              )
            }}
          >
            <Segmented
              value={settings.leafNameMode}
              onValueChange={(v) => patch({ leafNameMode: v as 'auto' | 'fixed' })}
              options={[{ value: 'auto', children: 'Detect from file' }, { value: 'fixed', children: 'Always use…' }]}
            />
          </Field>
          <Field label={settings.leafNameMode === 'auto' ? 'Fallback name' : 'Name'}>
            <Textbox value={settings.leafName} onValueInput={(v) => patch({ leafName: v })} placeholder="Vector" />
          </Field>
          <Field
            label="Same name twice"
            info={{
              title: 'Duplicate names',
              body: (
                <span>
                  What happens when two icons resolve to the same name (for example <code>home</code> in two folders).
                  <ul class={styles.tipList}>
                    <li><strong>Block</strong> (default): both are blocked until you rename one. Safest: names stay under your control.</li>
                    <li><strong>Prefix with category</strong>: <code>arrows/home</code> and <code>nav/home</code> become <code>arrows-home</code> and <code>nav-home</code>. Still-identical names stay blocked.</li>
                    <li><strong>Number them</strong>: <code>home</code>, <code>home-2</code>, <code>home-3</code>, ordered by component key. The numbers can change when icons are added or removed, so each affected icon gets a note.</li>
                  </ul>
                </span>
              )
            }}
          >
            <Segmented
              value={settings.duplicateNames}
              onValueChange={(v) => patch({ duplicateNames: v as Settings['duplicateNames'] })}
              options={[{ value: 'block', children: 'Stop export' }, { value: 'category', children: 'Add category' }, { value: 'suffix', children: 'Add number' }]}
            />
          </Field>
          <Row info={{ title: 'Share artwork for intentional duplicates', body: <span>In <em>Issues</em> you can mark a group of components with identical artwork as <strong>intentional</strong> (two names for one drawing, like <code>close</code> and <code>dismiss</code>). With this on, the export stores the drawing once: the shortest name owns it, the others become aliases (<code>aliasOf</code> in <code>icons.json</code>, a <code>&lt;use&gt;</code> in the sprite, a shared object in the Angular/React data). Names keep working. Only icons whose drawing <em>and</em> colours are identical are shared.</span> }}>
            <Toggle value={settings.aliasDuplicates} onValueChange={(v) => patch({ aliasDuplicates: v })}>Share artwork for intentional duplicates</Toggle>
          </Row>
          <Field
            label="Folders to ignore"
            info={{ title: 'Ignore folders', body: <span>Comma-separated name segments dropped from icon names and categories. With <code>icon</code> ignored, <code>icon/Audio descricao</code> becomes <code>audio-descricao</code> instead of <code>icon-audio-descricao</code>.</span> }}
          >
            <Textbox
              value={settings.ignoreSegments.join(', ')}
              onValueInput={(v) => patch({ ignoreSegments: v.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="icon, icons"
            />
          </Field>
          <Field
            label="Leave out of names"
            info={{ title: 'Ignore variant values', body: <span>Variants become separate icons named <code>&lt;set&gt;-&lt;values&gt;</code> (e.g. <code>home-filled</code>). Values listed here (like <code>default</code>) are left out so the default variant is just <code>home</code>.</span> }}
          >
            <Textbox
              value={settings.ignoreVariantValues.join(', ')}
              onValueInput={(v) => patch({ ignoreVariantValues: v.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="default"
            />
          </Field>
        </div>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Grid size</span>
          <Field
            label="Grid size"
            info={{
              title: 'Library size (grid)',
              body: (
                <span>
                  The icon box size used to judge consistency. <strong>Auto-detect</strong> uses the most common frame size in the scan (e.g. 24×24) and flags icons that differ. Choose <strong>Manual</strong> to enforce a size such as 20×20.
                </span>
              )
            }}
          >
            <Segmented
              value={settings.libSizeMode}
              onValueChange={(v) => patch({ libSizeMode: v as 'auto' | 'manual' })}
              options={[{ value: 'auto', children: 'Detect' }, { value: 'manual', children: 'Set manually' }]}
            />
          </Field>
          {settings.libSizeMode === 'manual' && (
            <Field label="Width × Height">
              <div class={styles.fieldRow}>
                <Textbox value={String(settings.libWidth)} onValueInput={(v) => patch({ libWidth: num(v, 24) })} />
                <Textbox value={String(settings.libHeight)} onValueInput={(v) => patch({ libHeight: num(v, 24) })} />
              </div>
            </Field>
          )}
        </div>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Categories</span>
          <Field
            label="Categories from"
            info={{
              title: 'Where categories come from',
              body: (
                <span>
                  Groups icons using how your Figma file is organised.
                  <ul class={styles.tipList}>
                    <li><strong>Auto</strong>: layer-name path (<code>Accessibility/Libras</code>), else the Section, else the parent frame, else the page.</li>
                    <li><strong>Name path</strong>: only the folders in the layer name.</li>
                    <li><strong>Section / Frame / Page</strong>: only that level.</li>
                    <li><strong>None</strong>: no categories.</li>
                  </ul>
                  Default frame names like “Frame 12” are ignored. Categories appear in the list, the test page filter, <code>icons.json</code> and (optionally) split the export folders.
                </span>
              )
            }}
          >
            <Dropdown
              value={settings.categorySource}
              onValueChange={(v) => patch({ categorySource: v as CategorySource })}
              options={[
                { value: 'auto', text: 'Auto (name → section → frame → page)' },
                { value: 'path', text: 'Layer-name path (category/name)' },
                { value: 'section', text: 'Section' },
                { value: 'frame', text: 'Parent frame' },
                { value: 'page', text: 'Page' },
                { value: 'none', text: 'None' }
              ]}
            />
          </Field>
        </div>
          </Fragment>
        )}

        {tab === 'team' && (
          <Fragment>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Share settings with your team</span>
          <div class={styles.fieldRow}>
            <Button secondary onClick={extras.onExportConfig}>Export config (.json)</Button>
            <label class={styles.fileBtn}>
              Import config…
              <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) extras.onImportConfig(f); (e.currentTarget as HTMLInputElement).value = '' }} />
            </label>
            <InfoTip title="Team config">
              <span>Saves the library-defining settings (namespace, naming, tokens, strokes, formats, categories…) to <code>toolkit.config.json</code> so every designer and developer exports identical output. Window size, Labs switches and the repository token stay on your computer. The same file is included in every export.</span>
            </InfoTip>
          </div>
          <div class={styles.fieldRow}>
            <Button secondary onClick={extras.onPublish} disabled={!settings.labs}>Publish to this file (Labs)</Button>
            <InfoTip title="Publish config to the file">
              <span>
                Writes the library settings into this Figma file (one small entry, visible in version history; needs edit access). Everyone who opens the file with the plugin, <strong>including developers in Dev Mode</strong>, then uses the same namespace, naming, tokens and stroke policy, so code snippets match your export. Without it, Dev Mode falls back to defaults and says so. Requires Labs. Re-publish after changing settings.
              </span>
            </InfoTip>
          </div>
          <Field label="Figma file URL" info={{ title: 'Figma file URL', body: <span>Used by Code Connect templates, e.g. <code>https://www.figma.com/design/&lt;key&gt;/&lt;name&gt;</code>. Plugins cannot read the file key themselves, so paste it once. Part of the team config.</span> }}>
            <Textbox value={settings.codeConnectUrl} onValueInput={(v) => patch({ codeConnectUrl: v })} placeholder="https://www.figma.com/design/…" />
          </Field>
          {!settings.labs && <div class={styles.muted}>Turn on Labs to publish.</div>}
          {extras.shared && (
            <div class={styles.release}>
              <div>This file has a published config ({extras.shared.at.slice(0, 10)}{extras.shared.by ? ` by ${extras.shared.by}` : ''}).{extras.shared.differs ? ' It differs from your current settings.' : ' It matches your settings.'}</div>
              {extras.shared.differs && <div class={styles.fieldRow}><Button secondary onClick={extras.onUseShared}>Use the file’s config</Button></div>}
            </div>
          )}
          {extras.configMessage && <div class={styles.muted}>{extras.configMessage}</div>}
        </div>
          </Fragment>
        )}

        {tab === 'labs' && (
          <Fragment>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Labs <span class={styles.labsTag}>experimental</span></span>
          <Row
            info={{
              title: 'Labs',
              body: (
                <span>
                  Features that are new and have not been proven on many files. Labs can <strong>edit your Figma file</strong> (the fixes in <em>Find problems</em>). Everything stays off until you enable it here. Fixes are always previewed first and applied as one undo step.
                </span>
              )
            }}
          >
            <Toggle value={settings.labs} onValueChange={(v) => patch({ labs: v })}>
              Turn on Labs (can edit this file)
            </Toggle>
          </Row>
          {settings.labs && (
            <div class={styles.section}>
              <Row
                info={{
                  title: 'Working in a branch',
                  body: <span>Fixes change layers inside components that other files use. The safe workflow is: create a Figma <strong>branch</strong> of the library, apply fixes there, review the branch diff, merge and publish. Ticking this confirms you are doing that (or working on a copy). Apply stays disabled until you do.</span>
                }}
              >
                <Checkbox value={settings.labsBranchAck} onValueChange={(v) => patch({ labsBranchAck: v })}>
                  I’m working in a branch or a copy of the file
                </Checkbox>
              </Row>
              <Row
                info={{
                  title: 'Composite frames',
                  body: <span>Some “icons” are frames built from <em>instances of other components</em> (an icon slot holding an icon, a badge on an icon). By default these are treated as layout, not icons, and appear under <em>Skipped</em>. Turn this on to treat them as icons and export them as one artwork. Labs: tell us if this matches how your library is built.</span>
                }}
              >
                <Toggle value={settings.compositeFrames === 'include'} onValueChange={(v) => patch({ compositeFrames: v ? 'include' : 'ignore' })}>
                  Treat frames made of instances as icons
                </Toggle>
              </Row>
              <Row
                info={{
                  title: 'Dev resources',
                  body: <span>Adds a link to every icon <em>component</em> (Dev Mode shows it under “Dev resources”), pointing at <code>&lt;link&gt;#icon-name</code>, e.g. the <code>icons.json</code> in your repository or a Storybook page. This <strong>writes to your Figma file</strong> (one link per component, skipped when it already exists; one undo step). Scan first: it uses the icons currently listed.</span>
                }}
              >
                <div class={styles.section}>
                  <Field label="Link base"><Textbox value={settings.devResourceUrl} onValueInput={(v) => patch({ devResourceUrl: v })} placeholder="https://github.com/org/repo/blob/main/src/icons/icons.json" /></Field>
                  <div class={styles.fieldRow}>
                    <Button secondary onClick={extras.onAttachDevResources} disabled={!settings.labsBranchAck || extras.scannedComponents === 0}>Attach to {extras.scannedComponents} components</Button>
                  </div>
                  {!settings.labsBranchAck && <div class={styles.muted}>Confirm “I’m working in a branch or a copy” first.</div>}
                </div>
              </Row>
            </div>
          )}
        </div>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Support</span>
          <div class={styles.fieldRow}>
            <Button secondary onClick={extras.onCopyDiagnostics}>Copy diagnostics for a bug report</Button>
            <InfoTip title="Diagnostics">
              <span>Copies a short report for bug reports: Figma mode and API version, your settings (the repository token is hidden) and the recent internal log. It contains no layer names or artwork.</span>
            </InfoTip>
          </div>
        </div>
          </Fragment>
        )}
      </div>
    </Dialog>
  )
}
