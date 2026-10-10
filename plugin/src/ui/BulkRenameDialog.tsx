import { Button, Checkbox, Dropdown, Textbox } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { CASE_LABEL, CaseStyle, NO_RULES, PROBLEM_TEXT } from '../core/bulkRename'
import { Field } from './components/Field'
import { Segmented } from './components/Segmented'
import { Dialog } from './Dialog'
import { InfoTip } from './InfoTip'
import { WarnIcon } from './icons'
import { useBulkRename } from './hooks/useBulkRename'
import styles from './styles'
import { cx, plural } from './util'

const SHOWN = 40
const CASES = (Object.keys(CASE_LABEL) as CaseStyle[]).map((v) => ({ value: v, text: CASE_LABEL[v] }))

export function BulkRenameDialog(props: { r: ReturnType<typeof useBulkRename>; labsReady: boolean; labsOn: boolean; onOpenSettings: () => void }) {
  const { r } = props
  const { plan, rules } = r
  const dirty = JSON.stringify(rules) !== JSON.stringify(NO_RULES)
  return (
    <Dialog label="Rename layers" onClose={r.close} busy={r.applying}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>Rename layers</strong>
          <Button secondary onClick={r.close} disabled={r.applying}>Close</Button>
        </div>
        <div class={styles.muted}>Set the rules, review the preview, then write. Nothing changes in your file until you press Write.</div>
      </div>
      <div class={styles.overlayBody}>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Which icons</span>
          <Segmented<'all' | 'shown'> label="Scope" value={r.scope} onValueChange={r.setScope} options={[{ value: 'all', children: `All (${r.counts.all})` }, { value: 'shown', children: `Shown in the list (${r.counts.shown})` }]} />
          <div class={styles.muted}>
            Naming check: {r.kebab.off === 0 ? `all ${plural(r.kebab.total, 'name')} are kebab-case.` : `${r.kebab.off} of ${plural(r.kebab.total, 'name')} are not kebab-case (lowercase words joined with “-”).`}{' '}
            <button class={styles.linkBtn} onClick={() => r.set({ caseStyle: 'kebab' })}>Convert to kebab-case</button>
          </div>
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Rules</span>
          <Field label="Find" info={{ title: 'Find and replace', body: <span>Replaces text in the icon name (the last part, after the last “/”). With <em>Regular expression</em> you can use groups in the replacement: <code>(\w+)-old</code> → <code>$1-new</code>.</span> }}>
            <Textbox value={rules.find} onValueInput={(v) => r.set({ find: v })} placeholder="text to find" />
          </Field>
          <Field label="Replace with">
            <Textbox value={rules.replace} onValueInput={(v) => r.set({ replace: v })} placeholder="(empty removes it)" />
          </Field>
          <div class={styles.fieldRow} style={{ flexWrap: 'wrap' }}>
            <Checkbox value={rules.regex} onValueChange={(v) => r.set({ regex: v })}>Regular expression</Checkbox>
            <Checkbox value={rules.caseSensitive} onValueChange={(v) => r.set({ caseSensitive: v })}>Match case</Checkbox>
          </div>
          {r.problem && <div class={styles.sevWarn}>{r.problem}</div>}
          <Field label="Case style">
            <Dropdown value={rules.caseStyle} options={CASES} onValueChange={(v) => r.set({ caseStyle: v as CaseStyle })} />
          </Field>
          <Field label="Remove from start">
            <Textbox value={rules.removePrefix} onValueInput={(v) => r.set({ removePrefix: v })} placeholder="e.g. icon-" />
          </Field>
          <Field label="Remove from end">
            <Textbox value={rules.removeSuffix} onValueInput={(v) => r.set({ removeSuffix: v })} placeholder="e.g. -copy" />
          </Field>
          <Field label="Add to start">
            <Textbox value={rules.addPrefix} onValueInput={(v) => r.set({ addPrefix: v })} placeholder="e.g. nav-" />
          </Field>
          <Field label="Add to end">
            <Textbox value={rules.addSuffix} onValueInput={(v) => r.set({ addSuffix: v })} placeholder="e.g. -filled" />
          </Field>
          <div class={styles.fieldRow}>
            <Checkbox value={rules.wholeName} onValueChange={(v) => r.set({ wholeName: v })}>Change the whole name, including folders (“Category/Name”)</Checkbox>
            <InfoTip title="Folders in names">
              <span>Layer names like <code>Arrows/Left</code> put the icon in a category. By default only the part after the last “/” changes, so categories stay as they are.</span>
            </InfoTip>
          </div>
          {dirty && <button class={styles.linkBtn} onClick={r.reset}>Clear the rules</button>}
        </div>

        <div class={styles.section}>
          <span class={styles.sectionTitle}>Preview</span>
          <div class={styles.releaseGrid}>
            <div class={styles.releaseCell}><strong>{plan.changes.length}</strong>to rename</div>
            <div class={styles.releaseCell}><strong>{plan.unchanged}</strong>same</div>
            <div class={styles.releaseCell}><strong>{plan.blocked.length}</strong>blocked</div>
            <div class={styles.releaseCell}><strong>{plan.skipped}</strong>skipped</div>
          </div>
          {plan.skipped > 0 && <div class={styles.muted}>Skipped: variants of a component set (rename the set) and instances.</div>}
          {plan.blocked.slice(0, 8).map((b) => (
            <div key={b.nodeId} class={styles.sevWarn}>{b.from} → {b.to || '(empty)'}: {b.problem ? PROBLEM_TEXT[b.problem] : ''}</div>
          ))}
          {plan.blocked.length > 8 && <div class={styles.muted}>+{plan.blocked.length - 8} more blocked. Blocked layers are not renamed.</div>}
          {plan.changes.slice(0, SHOWN).map((c) => (
            <div key={c.nodeId} style={{ padding: '2px 0' }}>
              <span class={styles.muted}>{c.from}</span> → <strong>{c.to}</strong>
            </div>
          ))}
          {plan.changes.length > SHOWN && <div class={styles.muted}>+{plan.changes.length - SHOWN} more</div>}
          {!dirty && <div class={styles.muted}>Set at least one rule to see the preview.</div>}
        </div>
        {r.result && <div class={cx(styles.pill, styles.pillInfo)} style={{ height: 'auto', padding: 8, borderRadius: 8 }}>{r.result}</div>}
      </div>
      {plan.changes.length > 0 && (
        <div class={styles.footer}>
          <div class={styles.footerNote}>
            {props.labsReady ? (
              <span class={cx(styles.muted, styles.pillWarn)} style={{ padding: '2px 8px', borderRadius: 6, display: 'inline-flex', gap: 6, alignItems: 'center' }}><WarnIcon /> Edits your Figma file; one undo step.</span>
            ) : (
              <span class={styles.muted}>
                Writing is a Labs feature{props.labsOn ? ': confirm you are working in a branch or a copy.' : ' (off).'}{' '}
                <button class={styles.linkBtn} onClick={props.onOpenSettings}>{props.labsOn ? 'Open Labs settings' : 'Enable Labs…'}</button>
              </span>
            )}
          </div>
          <Button onClick={r.apply} disabled={!props.labsReady || r.applying} loading={r.applying}>
            {`Rename ${plural(plan.changes.length, 'layer')}`}
          </Button>
        </div>
      )}
    </Dialog>
  )
}
