// While there is a connection, quietly fetch the screens a person is likely to open next, so they still work
// with no signal: the accounts and categories, and for the current month and the twelve before it the overview,
// trend, budgets, transactions and reports. What is already fresh is not fetched again.

import type { QueryClient } from '@tanstack/react-query'

import { api } from './api'
import { currentMonth, monthBounds, shiftMonth } from './format'

const MONTHS_BACK = 12
const FRESH = 30 * 60_000 // not fetched again within half an hour
const EVERY = 20 * 60_000 // and the whole round at most this often
let running = false
let lastRun = 0

export async function warmCache(qc: QueryClient, force = false) {
  if (running || !navigator.onLine || !qc.getQueryData(['me'])) return
  if (!force && Date.now() - lastRun < EVERY) return
  running = true
  try {
    const staleTime = FRESH
    await Promise.all([
      qc.prefetchQuery({ queryKey: ['accounts'], queryFn: api.accounts, staleTime }),
      qc.prefetchQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime }),
    ])
    const now = currentMonth()
    const months = [now, shiftMonth(now, 1)]
    for (let i = 1; i <= MONTHS_BACK; i++) months.push(shiftMonth(now, -i))
    for (const month of months) {
      if (!navigator.onLine) break
      const { start, end } = monthBounds(month)
      const filters = { start, end, q: '', kind: '', account_id: '', category_id: '' }
      const ranges = month === now ? [6, 1, 3, 12] : [6]
      await Promise.all([
        qc.prefetchQuery({ queryKey: ['overview', month], queryFn: () => api.overview(month), staleTime }),
        qc.prefetchQuery({ queryKey: ['trend', month], queryFn: () => api.trend(month, 6), staleTime }),
        qc.prefetchQuery({ queryKey: ['budgets', month], queryFn: () => api.budgets(month), staleTime }),
        qc.prefetchQuery({
          queryKey: ['transactions', 'recent', month],
          queryFn: () => api.transactions({ start, end, limit: 6 }),
          staleTime,
        }),
        qc.prefetchInfiniteQuery({
          queryKey: ['transactions', 'list', filters],
          queryFn: ({ pageParam }) => api.transactions({ ...filters, limit: 100, offset: pageParam }),
          initialPageParam: 0,
          staleTime,
        }),
        ...ranges.map((range) =>
          qc.prefetchQuery({ queryKey: ['insights', month, range], queryFn: () => api.insights(month, range), staleTime }),
        ),
      ])
    }
  } catch {
    /* the connection dropped, or a hiccup: the next round continues */
  } finally {
    running = false
    lastRun = Date.now()
  }
}

/** Start warming a little after the app opens, whenever it comes back to the screen, and when the connection returns. */
export function startWarmup(qc: QueryClient) {
  const later = (ms: number) => window.setTimeout(() => void warmCache(qc), ms)
  later(4000)
  window.addEventListener('online', () => later(3000))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && later(1500))
}
