import { Button, Checkbox, Dropdown, SegmentedControl, Textbox, TextboxMultiline, Toggle } from '@create-figma-plugin/ui'
import { Dialog } from './Dialog'
import { ComponentChildren, h } from 'preact'
import { cleanNamespace } from '../core/naming'
import { STROKE_POLICY_INFO, validateStrokeTable } from '../core/stroke'
import { suggestMapping, TOKEN_MODES, tokenPreview } from '../core/tokens'
import styles from '../styles.css'
import { CategorySource, ScanMode, Settings, StrokePolicy, TokenMode } from '../types'
import { InfoTip } from './InfoTip'

function Field(props: { label: string; info?: { title: string; body: ComponentChildren }; children: ComponentChildren }) {
  return (
    <div class={styles.field}>
      <span class={styles.fieldLabel}>
        {props.label}
        {props.info && <InfoTip title={props.info.title}>{props.info.body}</InfoTip>}
      </span>
      <div>{props.children}</div>
    </div>
  )
}

function Row(props: { info?: { title: string; body: ComponentChildren }; children: ComponentChildren }) {
  return (
    <div class={styles.fieldRow}>
      <div class={styles.grow}>{props.children}</div>
      {props.info && <InfoTip title={props.info.title}>{props.info.body}</InfoTip>}
    </div>
  )
}

const num = (v: string, fallback: number) => {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export interface SettingsExtras {
  exampleVariable: { variable: string; collection?: string }
  /** every distinct Figma variable bound in the last scan */
  scanVariables: { variable: string; collection?: string }[]
  onAttachDevResources: () => void
  onCopyDiagnostics: () => void
  scannedComponents: number
  onExportConfig: () => void
  onImportConfig: (file: File) => void
  configMessage: string
  shared: { at: string; by: string | null; differs: boolean } | null
  onPublish: () => void
  onUseShared: () => void
  syncStatus: string
  onTestSync: () => void
}

export function SettingsPanel({ settings, patch, onClose, extras }: { settings: Settings; patch: (p: Partial<Settings>) => void; onClose: () => void; extras: SettingsExtras }) {
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
      </div>
      <div class={styles.overlayBody}>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Library</span>
          <Field
            label="Namespace"
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
          <Field label="ZIP name" info={{ title: 'ZIP name', body: <span>File name of the downloaded ZIP. Leave empty to use <code>{ns}-icons.zip</code>.</span> }}>
            <Textbox value={settings.zipName} onValueInput={(v) => patch({ zipName: v })} placeholder={`${ns}-icons`} />
          </Field>
          <Field
            label="Library size"
            info={{
              title: 'Library size (grid)',
              body: (
                <span>
                  The icon box size used to judge consistency. <strong>Auto-detect</strong> uses the most common frame size in the scan (e.g. 24×24) and flags icons that differ. Choose <strong>Manual</strong> to enforce a size such as 20×20.
                </span>
              )
            }}
          >
            <SegmentedControl
              value={settings.libSizeMode}
              onValueChange={(v) => patch({ libSizeMode: v as 'auto' | 'manual' })}
              options={[{ value: 'auto', children: 'Auto-detect' }, { value: 'manual', children: 'Manual' }]}
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
            label="Category from"
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

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Scanning & audit</span>
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
            label="Strictness"
            info={{
              title: 'Strictness',
              body: (
                <span>
                  How hard the audit judges structure. <strong>Lenient</strong>: only unexportable things (text, images, empty) block export. <strong>Standard</strong>: default Figma names also block. <strong>Strict</strong>: design-system grade; loose frames, unbound colours and missing tags escalate to warnings or errors. Blocked icons are skipped on export.
                </span>
              )
            }}
          >
            <SegmentedControl
              value={settings.profile}
              onValueChange={(v) => patch({ profile: v as Settings['profile'] })}
              options={[{ value: 'lenient', children: 'Lenient' }, { value: 'standard', children: 'Standard' }, { value: 'strict', children: 'Strict' }]}
            />
          </Field>
          <Field
            label="Vector layer name"
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
            <SegmentedControl
              value={settings.leafNameMode}
              onValueChange={(v) => patch({ leafNameMode: v as 'auto' | 'fixed' })}
              options={[{ value: 'auto', children: 'Detect from file' }, { value: 'fixed', children: 'Fixed' }]}
            />
          </Field>
          <Field label={settings.leafNameMode === 'auto' ? 'Fallback name' : 'Name'}>
            <Textbox value={settings.leafName} onValueInput={(v) => patch({ leafName: v })} placeholder="Vector" />
          </Field>
          <Field
            label="Duplicate names"
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
            <SegmentedControl
              value={settings.duplicateNames}
              onValueChange={(v) => patch({ duplicateNames: v as Settings['duplicateNames'] })}
              options={[{ value: 'block', children: 'Block' }, { value: 'category', children: 'Category' }, { value: 'suffix', children: 'Number' }]}
            />
          </Field>
          <Row info={{ title: 'Share artwork for intentional duplicates', body: <span>In <em>Issues</em> you can mark a group of components with identical artwork as <strong>intentional</strong> (two names for one drawing, like <code>close</code> and <code>dismiss</code>). With this on, the export stores the drawing once: the shortest name owns it, the others become aliases (<code>aliasOf</code> in <code>icons.json</code>, a <code>&lt;use&gt;</code> in the sprite, a shared object in the Angular/React data). Names keep working. Only icons whose drawing <em>and</em> colours are identical are shared.</span> }}>
            <Toggle value={settings.aliasDuplicates} onValueChange={(v) => patch({ aliasDuplicates: v })}>Share artwork for intentional duplicates</Toggle>
          </Row>
          <Field
            label="Ignore folders"
            info={{ title: 'Ignore folders', body: <span>Comma-separated name segments dropped from icon names and categories. With <code>icon</code> ignored, <code>icon/Audio descricao</code> becomes <code>audio-descricao</code> instead of <code>icon-audio-descricao</code>.</span> }}
          >
            <Textbox
              value={settings.ignoreSegments.join(', ')}
              onValueInput={(v) => patch({ ignoreSegments: v.split(',').map((s) => s.trim()).filter(Boolean) })}
              placeholder="icon, icons"
            />
          </Field>
          <Field
            label="Ignore variant values"
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
          <span class={styles.sectionTitle}>Colour & paths</span>
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
            label="Path precision"
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
          <span class={styles.sectionTitle}>Design tokens (CSS variable names)</span>
          <Field
            label="Naming approach"
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
                <button class={styles.linkBtn} disabled={extras.scanVariables.length === 0} title={extras.scanVariables.length ? '' : 'Scan first: the table is built from the variables your icons use'} onClick={() => patch({ tokenNaming: { ...settings.tokenNaming, mapping: suggestMapping(extras.scanVariables, settings.tokenNaming) } })}>
                  Fill from scan ({extras.scanVariables.length} variable{extras.scanVariables.length === 1 ? '' : 's'})
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

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Support</span>
          <div class={styles.fieldRow}>
            <Button secondary onClick={extras.onCopyDiagnostics}>Copy diagnostics</Button>
            <InfoTip title="Diagnostics">
              <span>Copies a short report for bug reports: Figma mode and API version, your settings (the sync token is hidden) and the recent internal log. It contains no layer names or artwork.</span>
            </InfoTip>
          </div>
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Team config</span>
          <div class={styles.fieldRow}>
            <Button secondary onClick={extras.onExportConfig}>Export config (.json)</Button>
            <label class={styles.fileBtn}>
              Import config…
              <input type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = (e.currentTarget as HTMLInputElement).files?.[0]; if (f) extras.onImportConfig(f); (e.currentTarget as HTMLInputElement).value = '' }} />
            </label>
            <InfoTip title="Team config">
              <span>Saves the library-defining settings (namespace, naming, tokens, strokes, formats, categories…) to <code>toolkit.config.json</code> so every designer and developer exports identical output. Window size, Labs switches and the sync token stay on your computer. The same file is included in every export.</span>
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
          {!settings.labs && <div class={styles.muted}>Enable Labs below to publish.</div>}
          {extras.shared && (
            <div class={styles.release}>
              <div>This file has a published config ({extras.shared.at.slice(0, 10)}{extras.shared.by ? ` by ${extras.shared.by}` : ''}).{extras.shared.differs ? ' It differs from your current settings.' : ' It matches your settings.'}</div>
              {extras.shared.differs && <div class={styles.fieldRow}><Button secondary onClick={extras.onUseShared}>Use the file’s config</Button></div>}
            </div>
          )}
          {extras.configMessage && <div class={styles.muted}>{extras.configMessage}</div>}
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Labs <span class={styles.labsTag}>experimental</span></span>
          <Row
            info={{
              title: 'Labs',
              body: (
                <span>
                  Features that are new and have not been proven on many files. Labs can <strong>edit your Figma file</strong> (the fixes in <em>Find problems</em>) or talk to a program on your own computer (project sync). Everything stays off until you enable it here. Fixes are always previewed first and applied as one undo step.
                </span>
              )
            }}
          >
            <Toggle value={settings.labs} onValueChange={(v) => patch({ labs: v })}>
              Enable Labs
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
              <Row
                info={{
                  title: 'Project sync',
                  body: (
                    <span>
                      Sends the generated files straight into a folder of your project (and can commit them with git) through a small program that runs <strong>on your computer</strong>: <code>node tools/icon-sync.mjs --dir &lt;project&gt; --git</code>. It prints a URL and a token to paste here. It only writes inside that folder, only deletes files it created before, and never pushes unless started with <code>--allow-push</code>. The plugin talks to <code>localhost</code> only.
                    </span>
                  )
                }}
              >
                <Toggle value={settings.sync.enabled} onValueChange={(v) => patch({ sync: { ...settings.sync, enabled: v } })}>
                  Project sync (local companion)
                </Toggle>
              </Row>
              {settings.sync.enabled && (
                <div class={styles.section}>
                  <Field label="Companion URL"><Textbox value={settings.sync.url} onValueInput={(v) => patch({ sync: { ...settings.sync, url: v } })} placeholder="http://localhost:5199" /></Field>
                  <Field label="Token"><Textbox value={settings.sync.token} onValueInput={(v) => patch({ sync: { ...settings.sync, token: v } })} placeholder="printed by the companion" /></Field>
                  <Field label="Folder in project"><Textbox value={settings.sync.subdir} onValueInput={(v) => patch({ sync: { ...settings.sync, subdir: v } })} placeholder="icons" /></Field>
                  <Row info={{ title: 'Commit with git', body: <span>After writing, stage only the icons folder and commit it. Optionally on a branch (created if missing). Needs the companion started with <code>--git</code>. It refuses to switch branches if the repo has other uncommitted changes.</span> }}>
                    <Toggle value={settings.sync.commit} onValueChange={(v) => patch({ sync: { ...settings.sync, commit: v } })}>Commit with git</Toggle>
                  </Row>
                  {settings.sync.commit && (
                    <div class={styles.section}>
                      <Field label="Branch"><Textbox value={settings.sync.branch} onValueInput={(v) => patch({ sync: { ...settings.sync, branch: v } })} placeholder="(current branch)" /></Field>
                      <Field label="Message"><Textbox value={settings.sync.message} onValueInput={(v) => patch({ sync: { ...settings.sync, message: v } })} /></Field>
                    </div>
                  )}
                  <div class={styles.fieldRow}>
                    <Button secondary onClick={extras.onTestSync}>Test connection</Button>
                    <span class={styles.muted}>{extras.syncStatus}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Export formats</span>
          <Row info={{ title: 'SVG files', body: <span>One file per icon. CSS variables only work when the SVG is inlined in the page, not when used as an <code>&lt;img&gt;</code>.</span> }}>
            <Checkbox value={f.svg} onValueChange={(v) => setFormat('svg', v)}>SVG files</Checkbox>
          </Row>
          <Row info={{ title: 'SVG sprite', body: <span>All icons in one file as <code>&lt;symbol&gt;</code>, used with <code>&lt;use href&gt;</code>. Supports multi-colour and live stroke width through CSS variables. Recommended for the web. Loading it from a separate file requires a server (not <code>file://</code>).</span> }}>
            <Checkbox value={f.sprite} onValueChange={(v) => setFormat('sprite', v)}>SVG sprite (&lt;use&gt;)</Checkbox>
          </Row>
          <Row info={{ title: 'HTML', body: <span>Base CSS (sizes, <code>--{ns}-icon-*</code> variables) and a self-contained, searchable <code>index.html</code> preview with category grouping, colour/size/stroke playground and copy-able snippets.</span> }}>
            <Checkbox value={f.html} onValueChange={(v) => setFormat('html', v)}>HTML: base CSS + searchable test page</Checkbox>
          </Row>
          <Row info={{ title: 'CSS mask classes', body: <span>An empty <code>&lt;i&gt;</code> is painted with <code>currentColor</code> and the icon is used as a stencil. Neat class-based markup, but single-colour only, no stroke width control, and invisible to assistive tech. Instance overrides of colour/stroke may be flagged for this format.</span> }}>
            <Checkbox value={f.mask} onValueChange={(v) => setFormat('mask', v)}>HTML: CSS mask classes (single-colour only)</Checkbox>
          </Row>
          <Row info={{ title: 'Angular 17.1+', body: <span>Standalone component with signal inputs (<code>input()</code>), typed icon names and a data file. No FontAwesome or other dependency.</span> }}>
            <Checkbox value={f.angularModern} onValueChange={(v) => setFormat('angularModern', v)}>Angular 17.1+ (signals)</Checkbox>
          </Row>
          <Row info={{ title: 'Angular 14+', body: <span>The same component written with <code>@Input()</code> for projects on Angular 14 to 16 (also fine on newer versions).</span> }}>
            <Checkbox value={f.angularClassic} onValueChange={(v) => setFormat('angularClassic', v)}>Angular 14+ (classic)</Checkbox>
          </Row>
          <Row info={{ title: 'React', body: <span>A typed <code>&lt;{`${ns[0].toUpperCase()}${ns.slice(1)}`}Icon name="…" /&gt;</code> component (React 17+, no dependencies) using the same data file as Angular. Props: size, color, strokeWidth, label.</span> }}>
            <Checkbox value={f.react} onValueChange={(v) => setFormat('react', v)}>React component</Checkbox>
          </Row>
          <Row info={{ title: 'Web Component', body: <span>A framework-free custom element (<code>&lt;{ns}-icon name="…"&gt;</code>) as a plain ES module with typings. Use it in plain HTML, Vue, Svelte, Lit or anywhere else. It contains every icon in one file.</span> }}>
            <Checkbox value={f.webComponent} onValueChange={(v) => setFormat('webComponent', v)}>Web Component (framework-free)</Checkbox>
          </Row>
          <Row info={{ title: 'Code Connect', body: <span>Template files that tell Dev Mode and the Figma MCP server which code each icon component maps to. Needs the Figma file URL (Team config) and, to publish, an Organization or Enterprise plan. Only components get a mapping (instances, frames and loose layers have no component id).</span> }}>
            <Checkbox value={f.codeConnect} onValueChange={(v) => setFormat('codeConnect', v)}>Code Connect templates</Checkbox>
          </Row>
        </div>
        <div class={styles.muted}>Settings are saved on this computer. Nothing is ever written to your Figma file.</div>
      </div>
    </Dialog>
  )
}
