import { useReducer } from 'preact/hooks'
import { ChangeKind } from '../../core/baseline'
import { Status } from '../panels/IconsPanel'

/** what narrows the icon list, and how much of it is shown */
export interface Filters {
  status: Status
  rule: string | null
  category: string
  query: string
  change: ChangeKind | null
  limit: number
}

export type FilterAction =
  | { type: 'show'; status?: Status; rule?: string | null }
  | { type: 'category'; value: string }
  | { type: 'query'; value: string }
  | { type: 'change'; value: ChangeKind | null }
  | { type: 'clearRule' }
  | { type: 'limit'; value: number }
  | { type: 'reset' }

export const initialFilters = (pageSize: number): Filters => ({ status: 'all', rule: null, category: '', query: '', change: null, limit: pageSize })

/** every transition in one place; a new scan resets everything but the search text, which the user typed on purpose */
export function filtersReducer(pageSize: number) {
  return (s: Filters, a: FilterAction): Filters => {
    switch (a.type) {
      case 'show':
        return { ...s, status: a.status ?? 'all', rule: a.rule ?? null, limit: pageSize }
      case 'category':
        return { ...s, category: a.value }
      case 'query':
        return { ...s, query: a.value }
      case 'change':
        return { ...s, change: a.value, limit: pageSize }
      case 'clearRule':
        return { ...s, rule: null }
      case 'limit':
        return { ...s, limit: a.value }
      case 'reset':
        return { ...initialFilters(pageSize), query: s.query }
    }
  }
}

export function useFilters(pageSize: number) {
  const [filters, dispatch] = useReducer(filtersReducer(pageSize), initialFilters(pageSize))
  return { filters, dispatch }
}
