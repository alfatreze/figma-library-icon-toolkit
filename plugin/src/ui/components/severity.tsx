import { h } from 'preact'
import { BlockIcon, InfoIcon, WarnIcon } from '../icons'
import styles from '../styles'
import { Finding, Severity } from '../../types'

export const worst = (fs: Finding[]): Severity | null =>
  fs.some((f) => f.severity === 'error') ? 'error' : fs.some((f) => f.severity === 'warn') ? 'warn' : fs.length ? 'info' : null
export const SevIcon = ({ s }: { s: Severity }) => (s === 'error' ? <BlockIcon /> : s === 'warn' ? <WarnIcon /> : <InfoIcon />)
export const sevClass = (s: Severity) => (s === 'error' ? styles.sevError : s === 'warn' ? styles.sevWarn : styles.sevInfo)
