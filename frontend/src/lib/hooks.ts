import { onlineManager, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useContext, useMemo } from 'react'

import { api, ApiError, type Category, type Kind, type Transaction, type User } from './api'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.me()
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: Infinity,
  })
}

/** The signed-in user. Only call inside the authenticated layout. */
export function useUser(): User {
  const { data } = useMe()
  if (!data) throw new Error('useUser() outside authenticated area')
  return data
}

export const useAccounts = () => useQuery({ queryKey: ['accounts'], queryFn: api.accounts })

export function useCategories() {
  const query = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const byId = useMemo(() => new Map((query.data ?? []).map((c) => [c.id, c])), [query.data])
  return { ...query, byId }
}

export const UNCATEGORIZED: Category = { id: 0, name: 'Uncategorized', kind: 'expense', color: '#8d8b82' }

/** Refetch these queries. Offline, only mark them stale: a paused refetch would never finish,
 *  and the screen already shows the change (see lib/offline.ts). They refresh on reconnect. */
export function refreshKeys(qc: QueryClient, keys: string[]) {
  const refetchType = onlineManager.isOnline() ? 'active' : 'none'
  return Promise.all(keys.map((key) => qc.invalidateQueries({ queryKey: [key], refetchType })))
}

/** Invalidate everything derived from transactions after a write. */
export function useRefreshMoney() {
  const qc = useQueryClient()
  return () => refreshKeys(qc, ['transactions', 'overview', 'trend', 'budgets', 'accounts'])
}

// ---- selected month, shared by Overview / Transactions / Budgets ---------------

export interface MonthState {
  month: string
  setMonth: (m: string) => void
}

export const MonthContext = createContext<MonthState | null>(null)

export function useMonth() {
  const ctx = useContext(MonthContext)
  if (!ctx) throw new Error('useMonth() outside MonthContext')
  return ctx
}

// ---- global "new transaction" sheet --------------------------------------------

export type OpenComposer = (preset?: { kind?: Kind; editing?: Transaction }) => void
export const ComposerContext = createContext<OpenComposer>(() => {})
export const useComposer = () => useContext(ComposerContext)
