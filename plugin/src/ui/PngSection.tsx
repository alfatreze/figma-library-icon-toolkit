import { Button, Dropdown, Textbox, Toggle } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { useState } from 'preact/hooks'
import { MAX_PNG_ROWS } from '../core/settingsSchema'
import { normaliseHex, PngColourOption, PngPlan } from '../core/png'
import { PngColour, PngRow, Settings } from '../types'
import { InfoTip } from './InfoTip'
import styles from './styles'
import { plural } from './util'

export const newPngRowId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const same = (a: PngColour, b: PngColour) => a.kind === 'variable' && b.kind === 'variable' && a.variable === b.variable && a.collection === b.collection && a.mode === b.mode

const optionText = (o: PngColourOption) => `${o.colour.variable}${o.colour.mode ? ` · ${o.colour.mode}` : ''}  ${o.hex}`

function RowEditor(props: { row: PngRow; options: PngColourOption[]; problems: string[]; onChange: (r: PngRow) => void; onRemove: () => void }) {
  const { row, options } = props
  const [hexDraft, setHexDraft] = useState(row.colour.kind === 'hex' ? row.colour.hex : '')
  const index = row.colour.kind === 'variable' ? options.findIndex((o) => same(o.colour, row.colour)) : -1
  const value = row.colour.kind === 'drawn' ? 'drawn' : row.colour.kind === 'hex' ? 'hex' : index >= 0 ? `v${index}` : 'stale'
  const choices = [
    { value: 'drawn', text: 'Colour: as drawn in Figma' },
    { value: 'hex', text: 'Colour: custom…' },
    ...options.map((o, i) => ({ value: `v${i}`, text: `Colour: ${optionText(o)}` })),
    ...(value === 'stale' && row.colour.kind === 'variable' ? [{ value: 'stale', text: `Colour: ${row.colour.variable} (not in the scan)` }] : [])
  ]
  const pick = (v: string) => {
    if (v === 'drawn') props.onChange({ ...row, colour: { kind: 'drawn' } })
    else if (v === 'hex') {
      const hex = normaliseHex(hexDraft) ?? '#000000'
      setHexDraft(hex)
      props.onChange({ ...row, colour: { kind: 'hex', hex } })
    } else if (v.startsWith('v')) {
      const o = options[Number(v.slice(1))]
      if (o) props.onChange({ ...row, colour: o.colour })
    }
  }
  const draftBad = row.colour.kind === 'hex' && !normaliseHex(hexDraft)
  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--figma-color-border)' }}>
      <div class={styles.fieldRow}>
        <div style={{ width: 84 }}>
          <Textbox value={row.size} placeholder="2x, 512w" onValueInput={(size) => props.onChange({ ...row, size })} />
        </div>
        <div class={styles.grow}>
          <Textbox value={row.suffix} placeholder="Suffix, e.g. @2x" onValueInput={(suffix) => props.onChange({ ...row, suffix })} />
        </div>
        <button class={styles.iconBtn} aria-label="Remove this row" data-hint="Remove this row" onClick={props.onRemove}>×</button>
      </div>
      <div class={styles.fieldRow} style={{ marginTop: 6 }}>
        <div class={styles.grow}>
          <Dropdown value={value} options={choices} onValueChange={pick} />
        </div>
        {row.colour.kind === 'hex' && (
          <div style={{ width: 96 }}>
            <Textbox
              value={hexDraft}
              placeholder="#112233"
              onValueInput={(v) => {
                setHexDraft(v)
                const hex = normaliseHex(v)
                if (hex) props.onChange({ ...row, colour: { kind: 'hex', hex } })
              }}
            />
          </div>
        )}
      </div>
      {draftBad && <div class={styles.sevWarn}>Use a colour like #112233 or #123.</div>}
      {props.problems.map((p) => <div key={p} class={styles.sevWarn}>{p}</div>)}
    </div>
  )
}

/**
 * PNG export rows, like Figma's export section: size, suffix and colour per row, one file per icon and row. Off until switched on.
 * The rows start from the PNG export settings found in the file (seeded once per scan by the shell when there are none).
 */
export function PngSection(props: {
  png: Settings['png']
  options: PngColourOption[]
  plan: PngPlan
  figmaNote: string
  onChange: (png: Settings['png']) => void
}) {
  const { png, plan } = props
  const setRow = (r: PngRow) => props.onChange({ ...png, rows: png.rows.map((x) => (x.id === r.id ? r : x)) })
  const skippedNames = [...new Set(plan.skipped.map((s) => s.name))]
  return (
    <div class={styles.section}>
      <div class={styles.fieldRow}>
        <span class={`${styles.sectionTitle} ${styles.grow}`}>PNG images</span>
        <InfoTip title="PNG images">
          <span>
            One PNG per icon and row, drawn here from the same themed SVG as the other formats, so a colour you choose is applied exactly. A row is a Figma-style export: <code>2x</code> scales the icon, <code>512w</code> or <code>512h</code> sets one side and keeps the proportions. The file is the icon name plus the suffix, so give rows that differ in colour or size different suffixes. PNG files are in the ZIP only, not in repository publishing. Icons with several colours or a gradient are drawn only on rows set to “as drawn”.
          </span>
        </InfoTip>
      </div>
      <Toggle value={png.enabled} onValueChange={(enabled) => props.onChange({ ...png, enabled })}>
        Include PNG images in the ZIP
      </Toggle>
      {props.figmaNote && <div class={styles.muted}>{props.figmaNote}</div>}
      {png.rows.map((r) => (
        <RowEditor
          key={r.id}
          row={r}
          options={props.options}
          problems={plan.problems.filter((p) => p.rowId === r.id).map((p) => p.text)}
          onChange={setRow}
          onRemove={() => props.onChange({ ...png, rows: png.rows.filter((x) => x.id !== r.id) })}
        />
      ))}
      <div class={styles.fieldRow}>
        <Button
          secondary
          disabled={png.rows.length >= MAX_PNG_ROWS}
          onClick={() => props.onChange({ ...png, rows: [...png.rows, { id: newPngRowId(), size: '1x', suffix: '', colour: { kind: 'drawn' } }] })}
        >
          Add row
        </Button>
      </div>
      {png.enabled && png.rows.length === 0 && <div class={styles.muted}>Add a row to export PNG images.</div>}
      {png.enabled && png.rows.length > 0 && plan.problems.every((p) => !p.rowId) && (
        <div class={styles.muted}>
          {plural(plan.items.length, 'PNG file')}
          {skippedNames.length > 0 && <span> · {plural(skippedNames.length, 'icon')} not drawn on rows with a colour (several colours, a gradient or fixed colours)</span>}
          {skippedNames.length > 0 && (
            <InfoTip title="Not drawn on coloured rows">
              <span>{skippedNames.slice(0, 40).join(', ')}{skippedNames.length > 40 ? `, and ${skippedNames.length - 40} more` : ''}. They are still drawn on rows set to “as drawn”.</span>
            </InfoTip>
          )}
        </div>
      )}
    </div>
  )
}
