import { Button, Textbox } from '@create-figma-plugin/ui'
import { h } from 'preact'
import { useState } from 'preact/hooks'
import { MAX_PNG_ROWS } from '../core/settingsSchema'
import { normaliseHex, PngColourOption, PngPlan } from '../core/png'
import { PngColour, PngRow, Settings } from '../types'
import { InfoTip } from './InfoTip'
import styles from './styles'
import { cx, plural } from './util'

export const newPngRowId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const same = (a: PngColour, b: PngColour) => a.kind === 'variable' && b.kind === 'variable' && a.variable === b.variable && a.collection === b.collection && a.mode === b.mode

/** the colour as a small square; “as drawn” is a two-tone square because the icon's own colour differs from icon to icon */
const Swatch = ({ hex, size = 16 }: { hex: string | null; size?: number }) => (
  <span
    aria-hidden="true"
    style={{
      width: size,
      height: size,
      borderRadius: 4,
      flex: 'none',
      display: 'inline-block',
      border: '1px solid var(--figma-color-border)',
      background: hex ?? 'linear-gradient(135deg, #ffffff 50%, #1e1e1e 50%)'
    }}
  />
)

/** what the colour cell of a row says: the hex, the variable, or “As drawn” */
function colourLabel(c: PngColour, options: PngColourOption[]): { hex: string | null; text: string } {
  if (c.kind === 'drawn') return { hex: null, text: 'As drawn' }
  if (c.kind === 'hex') return { hex: normaliseHex(c.hex), text: c.hex.toUpperCase() }
  const o = options.find((x) => same(x.colour, c))
  return { hex: o?.hex ?? null, text: `${c.variable}${c.mode ? ` · ${c.mode}` : ''}${o ? '' : ' (not in the scan)'}` }
}

const listBtn = (active: boolean) => cx(styles.iconBtn, active && styles.iconBtnActive)

/** the colour editor of one row: as drawn, a typed colour, or one of the scanned variables in a mode, as a visual list */
function ColourPicker(props: { colour: PngColour; options: PngColourOption[]; onPick: (c: PngColour) => void }) {
  const { colour, options } = props
  const [draft, setDraft] = useState(colour.kind === 'hex' ? colour.hex : '')
  const bad = draft.trim() !== '' && !normaliseHex(draft)
  const groups = new Map<string, PngColourOption[]>()
  for (const o of options) groups.set(o.colour.collection, [...(groups.get(o.colour.collection) ?? []), o])
  return (
    <div style={{ padding: '6px 0 2px' }}>
      <button class={listBtn(colour.kind === 'drawn')} style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }} aria-pressed={colour.kind === 'drawn'} onClick={() => props.onPick({ kind: 'drawn' })}>
        <Swatch hex={null} /> As drawn in Figma
      </button>
      <div class={styles.fieldRow} style={{ margin: '6px 0' }}>
        <Swatch hex={normaliseHex(draft)} />
        <div class={styles.grow}>
          <Textbox
            value={draft}
            placeholder="Type a colour, e.g. #112233"
            onValueInput={(v) => {
              setDraft(v)
              const hex = normaliseHex(v)
              if (hex) props.onPick({ kind: 'hex', hex })
            }}
          />
        </div>
      </div>
      {bad && <div class={styles.sevWarn}>Use a colour like #112233 or #123.</div>}
      {options.length === 0 ? (
        <div class={styles.muted}>Scan icons that use Figma variables to pick from them here.</div>
      ) : (
        <div style={{ maxHeight: 190, overflowY: 'auto' }}>
          {[...groups].map(([collection, list]) => (
            <div key={collection}>
              <div class={styles.sectionTitle} style={{ padding: '6px 0 2px' }}>{collection || '(no collection)'}</div>
              {list.map((o) => (
                <button
                  key={`${o.colour.variable}|${o.colour.mode}`}
                  class={listBtn(same(o.colour, colour))}
                  style={{ width: '100%', justifyContent: 'flex-start', gap: 8 }}
                  aria-pressed={same(o.colour, colour)}
                  onClick={() => props.onPick(o.colour)}
                >
                  <Swatch hex={o.hex} />
                  <span class={styles.ellipsis}>{o.colour.variable}</span>
                  {o.colour.mode && <span class={styles.muted}>{o.colour.mode}</span>}
                  <span class={styles.muted} style={{ marginLeft: 'auto' }}>{o.hex}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RowEditor(props: { row: PngRow; options: PngColourOption[]; problems: string[]; onChange: (r: PngRow) => void; onRemove: () => void }) {
  const { row, options } = props
  const [open, setOpen] = useState(false)
  const label = colourLabel(row.colour, options)
  return (
    <div style={{ padding: '4px 0', borderBottom: '1px solid var(--figma-color-border)' }}>
      <div class={styles.fieldRow}>
        <button
          class={cx(styles.iconBtn, open && styles.iconBtnActive)}
          style={{ width: 132, justifyContent: 'flex-start', gap: 8, flex: 'none' }}
          aria-expanded={open}
          aria-label={`Colour: ${label.text}`}
          data-hint="Choose the colour"
          onClick={() => setOpen(!open)}
        >
          <Swatch hex={label.hex} />
          <span class={styles.ellipsis}>{label.text}</span>
        </button>
        <div style={{ width: 72, flex: 'none' }}>
          <Textbox value={row.size} placeholder="2x, 512w" onValueInput={(size) => props.onChange({ ...row, size })} />
        </div>
        <div class={styles.grow}>
          <Textbox value={row.suffix} placeholder="Suffix, e.g. @2x" onValueInput={(suffix) => props.onChange({ ...row, suffix })} />
        </div>
        <button class={styles.iconBtn} aria-label="Remove this row" data-hint="Remove this row" onClick={props.onRemove}>×</button>
      </div>
      {open && <ColourPicker colour={row.colour} options={options} onPick={(colour) => props.onChange({ ...row, colour })} />}
      {props.problems.map((p) => <div key={p} class={styles.sevWarn}>{p}</div>)}
    </div>
  )
}

/**
 * The inside of the PNG card, like Figma's export section: size, suffix and colour per row, one file per icon and row.
 * The rows start from the PNG export settings found in the file (seeded once per scan by the shell when there are none).
 */
export function PngBody(props: {
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
      <div class={styles.muted}>
        One PNG per icon and row, drawn from the same themed SVG as the other formats. <code>2x</code> scales the icon, <code>512w</code> or <code>512h</code> sets one side. The file is the icon name plus the suffix, so rows that differ in colour or size need different suffixes. They go in the ZIP and, when you publish, to outputs that receive all packages (GitHub accepts up to 150 changed images per publish; GitLab has no such limit).
      </div>
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
      {png.rows.length === 0 && <div class={styles.muted}>Add a row to export PNG images.</div>}
      {png.rows.length > 0 && plan.problems.every((p) => !p.rowId) && skippedNames.length > 0 && (
        <div class={styles.muted}>
          {plural(skippedNames.length, 'icon')} not drawn on rows with a colour (several colours, a gradient or fixed colours)
          <InfoTip title="Not drawn on coloured rows">
            <span>{skippedNames.slice(0, 40).join(', ')}{skippedNames.length > 40 ? `, and ${skippedNames.length - 40} more` : ''}. They are still drawn on rows set to “as drawn”.</span>
          </InfoTip>
        </div>
      )}
    </div>
  )
}
