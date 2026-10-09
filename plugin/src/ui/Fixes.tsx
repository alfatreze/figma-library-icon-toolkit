import { Button, Checkbox, RadioButtons } from '@create-figma-plugin/ui'
import { ComponentChildren, Fragment, h } from 'preact'
import { useMemo } from 'preact/hooks'
import { FIX_GROUPS, FIX_INFO } from '../core/fixes'
import { sanitizeSvgString } from '../core/sanitize'
import styles from '../styles.css'
import { FixActionId, FixCandidate, FixResult } from '../types'
import { InfoTip } from './InfoTip'
import { BlockIcon, CheckIcon, InfoIcon, LocateIcon, NextIcon, WarnIcon } from './icons'
import { cx, plural } from './util'


export const CONFIDENCE_INFO = (
  <span>
    How sure the plugin is that the proposed fix is right.
    <ul class={styles.tipList}>
      <li><strong>High</strong>: identical artwork, or a safe structural change.</li>
      <li><strong>Medium</strong>: same shape but a different box, size or colour; those differences are carried as overrides.</li>
      <li><strong>Low</strong>: artwork was edited. Replacing would discard those edits, so review the preview first.</li>
    </ul>
  </span>
)

function Svg({ svg: raw }: { svg: string | null }) {
  const svg = useMemo(() => (raw ? sanitizeSvgString(raw) : null), [raw]) // previews come straight from Figma's exporter: sanitise like everything else that reaches innerHTML
  return svg ? <span class={styles.pvSvg} dangerouslySetInnerHTML={{ __html: svg }} /> : <span class={styles.muted}>no preview</span>
}

export function Preview({ fix, action }: { fix: FixCandidate; action: FixActionId | undefined }) {
  const replace = action === 'replace-with-instance' && fix.target
  const convert = action === 'convert-to-component' || action === 'wrap-and-convert'
  return (
    <div class={styles.pv}>
      <figure class={styles.pvBox}>
        <div class={styles.pvStage}><Svg svg={fix.svg} /></div>
        <figcaption class={styles.pvCap}>Current · {fix.nodeType.toLowerCase().replace('_', ' ')}</figcaption>
      </figure>
      {(replace || convert) && (
        <Fragment>
          <span class={styles.pvArrow} aria-hidden="true"><NextIcon /></span>
          <figure class={styles.pvBox}>
            <div class={cx(styles.pvStage, styles.pvResult)}>
              <Svg svg={replace && fix.target ? fix.target.svg : fix.svg} />
              <span class={styles.pvBadge} title="Component">◆</span>
            </div>
            <figcaption class={styles.pvCap}>
              {replace && fix.target ? `Instance of ${fix.target.name}${fix.target.remote ? ' (library)' : ''}` : 'New component'}
            </figcaption>
          </figure>
        </Fragment>
      )}
    </div>
  )
}

export function FixCard(props: {
  fix: FixCandidate
  selected: boolean
  action: FixActionId | undefined
  result?: FixResult
  onSelect: (v: boolean) => void
  onAction: (a: FixActionId) => void
  onLocate: () => void
  onIgnore?: () => void
}) {
  const { fix, result } = props
  const info = FIX_INFO[fix.kind]
  const actions = fix.actions
  const canApply = actions.length > 0 && !result?.ok
  return (
    <div class={cx(styles.fix, result?.ok && styles.fixDone)}>
      <div class={styles.fixHead}>
        {canApply && <Checkbox value={props.selected} onValueChange={props.onSelect}>{''}</Checkbox>}
        <div class={styles.grow}>
          <div class={styles.issueTitle}>{info.title}</div>
          <div class={cx(styles.muted, styles.ellipsis)} title={fix.name}>{fix.name} · {fix.pageName || 'page'} · {fix.width}×{fix.height}</div>
        </div>
        <span class={cx(styles.conf, styles[`conf_${fix.confidence}`])} title="Confidence">{fix.confidence}</span>
        <button class={styles.iconBtn} onClick={props.onLocate} aria-label={`Locate ${fix.name}`} title="Locate on canvas"><LocateIcon /></button>
      </div>

      {fix.kind !== 'layer-names' && fix.kind !== 'duplicate-component' && <Preview fix={fix} action={props.action} />}

      <div class={styles.muted}>{info.why}</div>

      {fix.diffs.length > 0 && fix.kind !== 'duplicate-component' && (
        <ul class={styles.diffList}>
          {fix.diffs.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}
      {fix.kind === 'duplicate-component' && (
        <div>
          <strong>Identical artwork:</strong> {fix.diffs.join(', ')}. Keep one, swap instances to it, delete the rest.
        </div>
      )}

      {actions.length > 1 && !result?.ok && (
        <RadioButtons
          value={props.action ?? actions[0]}
          onValueChange={(v) => props.onAction(v as FixActionId)}
          options={actions.map((a) => ({ value: a, children: info.actionLabels[a] ?? a }))}
        />
      )}
      {actions.length === 1 && !result?.ok && <div><strong>Fix:</strong> {info.actionLabels[actions[0]]}</div>}
      {actions.length === 0 && (
        <div class={styles.fieldRow}>
          <div class={cx(styles.muted, styles.grow)}>No automatic fix: Figma cannot merge components. Use Locate to review them.</div>
          {fix.kind === 'duplicate-component' && props.onIgnore && <Button secondary onClick={props.onIgnore}>Mark as intentional</Button>}
        </div>
      )}

      {result && (
        <div class={cx(styles.fixResult, result.ok ? styles.sevInfo : styles.sevError)}>
          {result.ok ? <CheckIcon /> : <BlockIcon />} <span>{result.message}</span>
          {result.ok && result.newNodeId && <span class={styles.muted}> · rescan to refresh</span>}
        </div>
      )}
    </div>
  )
}

export function FixSummaryChips(props: { fixes: FixCandidate[]; group: string; onGroup: (g: string) => void }) {
  const count = (kinds: string[]) => props.fixes.filter((f) => kinds.includes(f.kind)).length
  return (
    <div class={styles.chips}>
      <button class={cx(styles.chip, props.group === 'all' && styles.chipActive)} onClick={() => props.onGroup('all')} aria-pressed={props.group === 'all'}>
        All <span class={styles.muted}>{props.fixes.length}</span>
      </button>
      {FIX_GROUPS.map((g) => {
        const n = count(g.kinds)
        return (
          <button key={g.id} class={cx(styles.chip, props.group === g.id && styles.chipActive)} onClick={() => props.onGroup(g.id)} aria-pressed={props.group === g.id} disabled={n === 0} style={n === 0 ? { opacity: 0.45, cursor: 'default' } : undefined}>
            {g.label} <span class={styles.muted}>{n}</span>
          </button>
        )
      })}
      <InfoTip title="What the health scan finds">
        <span>
          Looks for icons that are not set up properly in Figma:
          <ul class={styles.tipList}>
            <li><strong>Detached</strong>: frames that were detached from a component (Figma remembers which one), or that match an existing component’s artwork exactly or nearly.</li>
            <li><strong>Not components</strong>: icon-like frames, groups and loose shapes with no component.</li>
            <li><strong>Layer names</strong>: vector layers inside components whose names differ, which makes overrides reset when swapping icons.</li>
            <li><strong>Duplicates</strong>: several components with identical artwork.</li>
          </ul>
          Nothing is changed until you review and confirm a fix.
        </span>
      </InfoTip>
    </div>
  )
}

export function ConfirmApply(props: {
  items: { fix: FixCandidate; action: FixActionId }[]
  renameLeaves: boolean
  leafName: string
  onRenameLeaves: (v: boolean) => void
  onCancel: () => void
  onApply: () => void
  applying: boolean
}) {
  const by = new Map<FixActionId, number>()
  props.items.forEach((i) => by.set(i.action, (by.get(i.action) ?? 0) + 1))
  const label: Record<FixActionId, string> = {
    'replace-with-instance': 'replaced with instances',
    'convert-to-component': 'converted to components',
    'wrap-and-convert': 'wrapped in a frame and converted',
    'rename-layers': 'have their layers renamed',
    'apply-name': 'renamed'
  }
  const converting = props.items.some((i) => i.action === 'convert-to-component' || i.action === 'wrap-and-convert')
  return (
    <div class={styles.overlay} role="dialog" aria-modal="true" aria-label="Review fixes">
      <div class={styles.header}>
        <div class={styles.scanRow}>
          <strong class={styles.grow} style={{ fontSize: 13 }}>Review {plural(props.items.length, 'fix')}</strong>
          <Button secondary onClick={props.onCancel} disabled={props.applying}>Cancel</Button>
        </div>
      </div>
      <div class={styles.overlayBody}>
        <div class={cx(styles.pill, styles.pillWarn)} style={{ height: 'auto', padding: 8, borderRadius: 8, alignItems: 'flex-start', display: 'flex', gap: 8 }}>
          <WarnIcon /> <span>This edits your Figma file. All fixes are applied as one undo step: press Cmd/Ctrl+Z to revert them together.</span>
        </div>
        <div class={styles.section}>
          <span class={styles.sectionTitle}>What will happen</span>
          {[...by.entries()].map(([a, n]) => <div key={a}><strong>{plural(n, 'layer')}</strong> {label[a]}</div>)}
        </div>
        {converting && (
          <div class={styles.fieldRow}>
            <Checkbox value={props.renameLeaves} onValueChange={props.onRenameLeaves}>
              Also standardise vector layer names (“{props.leafName}”, “{props.leafName} 2”…)
            </Checkbox>
            <InfoTip title="Override-safe layer names">
              <span>Figma keeps fill/stroke overrides when an instance is swapped to another icon only if the layers inside have matching names. Using the same name for the vector layer in every icon makes swapping and overrides work as designers expect.</span>
            </InfoTip>
          </div>
        )}
        <div class={styles.section}>
          <span class={styles.sectionTitle}>Layers</span>
          {props.items.map(({ fix, action }) => (
            <div class={styles.confirmRow} key={fix.id}>
              <span class={styles.thumb}><Svg svg={fix.svg} /></span>
              <div style={{ minWidth: 0 }}>
                <div class={cx(styles.name, styles.ellipsis)}>{fix.name}</div>
                <div class={cx(styles.muted, styles.ellipsis)}>
                  {FIX_INFO[fix.kind].actionLabels[action] ?? action}
                  {action === 'replace-with-instance' && fix.target ? ` → ${fix.target.name}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div class={styles.footer}>
        <Button fullWidth onClick={props.onApply} loading={props.applying} disabled={props.applying}>Apply {plural(props.items.length, 'fix')}</Button>
      </div>
    </div>
  )
}

export function FixesEmpty(props: { scanned: boolean }): ComponentChildren {
  return props.scanned ? (
    <div class={styles.empty}>
      <div class={styles.allClear}><CheckIcon /> No problems found.</div>
      <div>Every icon-like layer in this scope is a component or an instance with override-safe names.</div>
    </div>
  ) : (
    <div class={styles.empty}>
      <InfoIcon />
      <div>Switch the mode to <strong>Find problems</strong> and scan to detect detached, loose and badly named icons.</div>
    </div>
  )
}
