import { ComponentChildren, h } from 'preact'
import styles from '../styles'
import { InfoTip } from '../InfoTip'

export function Field(props: { label: string; info?: { title: string; body: ComponentChildren }; children: ComponentChildren }) {
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

export function Row(props: { info?: { title: string; body: ComponentChildren }; children: ComponentChildren }) {
  return (
    <div class={styles.fieldRow}>
      <div class={styles.grow}>{props.children}</div>
      {props.info && <InfoTip title={props.info.title}>{props.info.body}</InfoTip>}
    </div>
  )
}

