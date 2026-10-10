import { Button, Textbox } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { explicitMapping, normaliseCssVar, setMappingEntry, suggestMapping, tokenVarName, validCssVar } from '../core/tokens'
import { TokenNaming } from '../types'
import { Dialog } from './Dialog'
import styles from './styles'
import { plural } from './util'

export interface MappingVariable {
  variable: string
  collection?: string
  modes?: Record<string, string>
}

/** a colour square with its hex as a tooltip and a text label, so the colour is never the only information */
const Swatch = ({ mode, hex }: { mode: string; hex: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 8 }} data-hint={`${mode}: ${hex}`}>
    <span style={{ width: 12, height: 12, borderRadius: 3, background: hex, border: '1px solid var(--figma-color-border)', display: 'inline-block' }} aria-hidden="true" />
    <span class={styles.muted}>{mode}</span>
  </span>
)

/**
 * The custom token mapping as a table: every variable the icons use, grouped by collection, with its colour in each mode (Light / Dark…),
 * the CSS name it gets now, and a field to name it yourself. The text mapping stays the source of truth: each edit changes one line of it.
 */
export function MappingDialog(props: { naming: TokenNaming; variables: MappingVariable[]; onChange: (mapping: string) => void; onClose: () => void }) {
  const { naming } = props
  const groups = new Map<string, MappingVariable[]>()
  for (const v of props.variables) groups.set(v.collection ?? '', [...(groups.get(v.collection ?? '') ?? []), v])
  const sorted = [...groups].sort((a, b) => a[0].localeCompare(b[0]))
  const named = props.variables.filter((v) => explicitMapping(naming.mapping, v.variable, v.collection)).length
  return (
    <Dialog label="Token mapping" onClose={props.onClose}>
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>Token mapping</strong>
          <Button secondary onClick={props.onClose}>Done</Button>
        </div>
        <div class={styles.muted}>
          {plural(props.variables.length, 'variable')} used by the scanned icons, {named} named by you. Leave a field empty to use the naming rule. Changes are saved in the mapping text of Settings → Style.
        </div>
      </div>
      <div class={styles.overlayBody}>
        <div class={styles.fieldRow} style={{ flexWrap: 'wrap' }}>
          <button class={styles.linkBtn} onClick={() => props.onChange(suggestMapping(props.variables, naming))}>Name every variable by the rule</button>
          <button class={styles.linkBtn} onClick={() => props.onChange('')} disabled={!naming.mapping.trim()}>Clear all names</button>
        </div>
        {sorted.map(([collection, vars]) => (
          <div key={collection} class={styles.section}>
            <span class={styles.sectionTitle}>{collection || '(no collection)'}</span>
            {vars
              .sort((a, b) => a.variable.localeCompare(b.variable))
              .map((v) => {
                const own = explicitMapping(naming.mapping, v.variable, v.collection)
                const byRule = tokenVarName(v.variable, v.collection, { ...naming, mapping: '' }) ?? ''
                const effective = tokenVarName(v.variable, v.collection, naming) ?? ''
                return (
                  <div key={v.variable} style={{ padding: '6px 0', borderBottom: '1px solid var(--figma-color-border)' }}>
                    <div class={styles.name}>{v.variable}</div>
                    <div>{v.modes ? Object.entries(v.modes).map(([m, hex]) => <Swatch key={m} mode={m} hex={hex} />) : <span class={styles.muted}>one colour for every mode</span>}</div>
                    <div class={styles.fieldRow}>
                      <div class={styles.grow}>
                        <Textbox value={own} placeholder={byRule || '(none)'} onValueInput={(x) => props.onChange(setMappingEntry(naming.mapping, v.variable, v.collection, x))} />
                      </div>
                    </div>
                    {own && !validCssVar(normaliseCssVar(own)) && <div class={styles.sevWarn}>Use letters, digits, “-” and “_” only (for example --icon-color).</div>}
                    <div class={styles.muted}>Exported as <code>{effective || '(no token)'}</code></div>
                  </div>
                )
              })}
          </div>
        ))}
        {props.variables.length === 0 && <div class={styles.muted}>Scan icons that use Figma variables first.</div>}
      </div>
    </Dialog>
  )
}
