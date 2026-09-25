// Offline support: every change is written to an "outbox" kept on the phone, shown on
// screen straight away, and sent to the server in order as soon as there's a connection.
//
// - Online and nothing waiting: the change goes straight to the server (normal behaviour).
// - Offline, or older changes still waiting: the change joins the outbox, the React Query
//   cache is updated so the screen shows it, and the result is a stand-in object.
// - New items made offline get a temporary negative id. When the server creates them,
//   later outbox entries that mention that id are rewritten to the real one.
// - Balances, budgets and monthly totals are worked out on the server; until the sync brings
//   the real numbers, the cached copies are adjusted here so the screen adds up.

import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import type { Account, Budget, Category, MonthTotal, Overview, Transaction, TransactionPage } from './api'
import { ApiError, NetworkError, send } from './http'

interface Entry {
  id: string
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
  tempId?: number // for POSTs made offline
  at: number
}

export interface SyncState {
  online: boolean
  pending: number
  syncing: boolean
  failed: number // changes the server rejected (e.g. invalid after a conflict)
}

const KEY = 'tally.outbox'
const FAILED_KEY = 'tally.outbox.failed'
let client: QueryClient | null = null
let syncing = false
const listeners = new Set<() => void>()

// ---- storage ---------------------------------------------------------------------

function load(key = KEY): Entry[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]') as Entry[]
  } catch {
    return []
  }
}

function save(entries: Entry[], key = KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(entries))
  } catch {
    /* storage full or unavailable: keep going in memory */
  }
  emit()
}

let snapshot: SyncState = computeState()
function computeState(): SyncState {
  return { online: navigator.onLine, pending: load().length, syncing, failed: load(FAILED_KEY).length }
}
function emit() {
  snapshot = computeState()
  listeners.forEach((fn) => fn())
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => snapshot,
  )
}

export function clearFailed() {
  save([], FAILED_KEY)
}

export const pendingCount = () => load().length

/** Forget everything queued (signing out, deleting the account). */
export function clearOutbox() {
  save([])
  save([], FAILED_KEY)
}

/** Server unreachable or restarting behind the proxy: worth trying again later. */
const retryable = (e: unknown) => e instanceof NetworkError || (e instanceof ApiError && [502, 503, 504].includes(e.status))

// ---- writing ---------------------------------------------------------------------

let nextTemp = -Date.now()

export async function write<T>(method: string, path: string, body?: unknown): Promise<T> {
  const m = method as Entry['method']
  if (load().length === 0 && navigator.onLine) {
    try {
      return await send<T>(m, path, body)
    } catch (e) {
      if (!retryable(e)) throw e // a real error from the server: show it
    }
  }
  // Offline (or earlier changes still queued): keep it on the phone.
  const entry: Entry = { id: crypto.randomUUID(), method: m, path, body, at: Date.now() }
  // Creating something (POST, or PUT /budgets for a category without a budget yet) needs an id.
  if (m === 'POST' || (m === 'PUT' && path === '/budgets')) entry.tempId = nextTemp--
  save([...load(), entry])
  const result = applyToCache(entry)
  void syncNow()
  return result as T
}

// ---- optimistic cache updates -------------------------------------------------------

type Page = TransactionPage
type TxList = Page | InfiniteData<Page>

const monthOf = (iso: string) => iso.slice(0, 7)
const signed = (tx: Transaction) => (tx.kind === 'income' ? tx.amount : -tx.amount)

function lastDay(month: string) {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

function cached<T>(key: QueryKey) {
  return client!.getQueriesData<T>({ queryKey: key })
}

/** The newest copy of a transaction in any cached list. */
function findTransaction(id: number): Transaction | undefined {
  for (const [, data] of cached<TxList>(['transactions'])) {
    const pages = data ? ('pages' in data ? data.pages : [data]) : []
    for (const page of pages) {
      const hit = page.items.find((x) => x.id === id)
      if (hit) return hit
    }
  }
  return undefined
}

function categoryName(id: number | null) {
  const list = client!.getQueryData<Category[]>(['categories']) ?? []
  return list.find((c) => c.id === id)?.name ?? ''
}

/** Does a transaction show up in the list cached under `key`? Mirrors the API's filters. */
function inList(key: QueryKey, tx: Transaction): boolean {
  if (key[1] === 'recent') {
    const month = key[2] as string
    return monthOf(tx.occurred_on) === month
  }
  const f = (key[2] ?? {}) as Record<string, string>
  if (f.start && tx.occurred_on < f.start) return false
  if (f.end && tx.occurred_on > f.end) return false
  if (f.kind && tx.kind !== f.kind) return false
  if (f.account_id && tx.account_id !== Number(f.account_id)) return false
  if (f.category_id === '0' && tx.category_id !== null) return false
  if (f.category_id && f.category_id !== '0' && tx.category_id !== Number(f.category_id)) return false
  if (f.q) {
    const q = f.q.toLowerCase()
    if (!tx.note.toLowerCase().includes(q) && !categoryName(tx.category_id).toLowerCase().includes(q)) return false
  }
  return true
}

// Newest first, like the API; items made offline go first within their day.
const order = (a: Transaction, b: Transaction) =>
  b.occurred_on.localeCompare(a.occurred_on) || (b.id < 0 ? Infinity : b.id) - (a.id < 0 ? Infinity : a.id)

function totals(page: Page, tx: Transaction, sign: 1 | -1): Page {
  return {
    ...page,
    total: page.total + sign,
    income: page.income + (tx.kind === 'income' ? tx.amount * sign : 0),
    expense: page.expense + (tx.kind === 'expense' ? tx.amount * sign : 0),
  }
}

function updateLists(before: Transaction | undefined, after: Transaction | undefined) {
  for (const [key, data] of cached<TxList>(['transactions'])) {
    if (!data) continue
    const wasIn = before ? inList(key, before) : false
    const isIn = after ? inList(key, after) : false
    const fix = (page: Page, first: boolean): Page => {
      let items = page.items.filter((x) => x.id !== (before ?? after)!.id)
      if (isIn && first) items = [...items, after!].sort(order)
      if (key[1] === 'recent') items = items.slice(0, 6)
      let next = { ...page, items }
      if (wasIn) next = totals(next, before!, -1)
      if (isIn) next = totals(next, after!, 1)
      return next
    }
    if ('pages' in data) {
      client!.setQueryData(key, { ...data, pages: data.pages.map((p, i) => fix(p, i === 0)) })
    } else {
      client!.setQueryData(key, fix(data, true))
    }
  }
}

/** Add (sign 1) or take away (sign -1) one transaction's effect on balances and summaries. */
function applyMoney(tx: Transaction, sign: 1 | -1) {
  const month = monthOf(tx.occurred_on)
  const amount = tx.amount * sign
  const expense = tx.kind === 'expense'

  client!.setQueryData<Account[]>(['accounts'], (list) =>
    list?.map((a) => (a.id === tx.account_id ? { ...a, balance: a.balance + signed(tx) * sign } : a)),
  )
  if (expense) {
    client!.setQueryData<Budget[]>(['budgets', month], (list) =>
      list?.map((b) => (b.category_id === tx.category_id ? { ...b, spent: b.spent + amount } : b)),
    )
  }
  for (const [key, o] of cached<Overview>(['overview'])) {
    if (!o) continue
    const m = key[1] as string
    // Net worth counts everything up to the end of the month shown.
    const next = { ...o, net_worth: tx.occurred_on <= lastDay(m) ? o.net_worth + signed(tx) * sign : o.net_worth }
    if (m === month) {
      next.income = o.income + (expense ? 0 : amount)
      next.expense = o.expense + (expense ? amount : 0)
      if (expense) {
        const rows = [...o.by_category]
        const row = rows.find((r) => r.category_id === tx.category_id)
        if (row) row.amount += amount
        else rows.push({ category_id: tx.category_id, amount })
        next.by_category = rows
          .map((r) => ({ ...r }))
          .filter((r) => r.amount > 0)
          .sort((a, b) => b.amount - a.amount)
        next.daily = o.daily.map((d) => (d.day === tx.occurred_on ? { ...d, expense: d.expense + amount } : d))
      }
    }
    client!.setQueryData(key, next)
  }
  for (const [key, list] of cached<MonthTotal[]>(['trend'])) {
    client!.setQueryData(
      key,
      list?.map((row) =>
        row.month === month
          ? { ...row, income: row.income + (expense ? 0 : amount), expense: row.expense + (expense ? amount : 0) }
          : row,
      ),
    )
  }
}

/** Replace or add an item in a flat list cache; `undefined` removes it. */
function upsert<T extends { id: number }>(key: QueryKey, id: number, item: T | undefined) {
  client!.setQueryData<T[]>(key, (list) => {
    if (!list) return list
    const at = list.findIndex((x) => x.id === id)
    if (!item) return list.filter((x) => x.id !== id)
    if (at < 0) return [...list, item]
    return list.map((x, i) => (i === at ? item : x))
  })
}

/** Show a queued change on screen and return what the server would probably answer. */
function applyToCache(entry: Entry): unknown {
  if (!client) return entry.body
  const [, resource, rawId] = entry.path.split('/')
  const body = (entry.body ?? {}) as Record<string, unknown>
  const id = entry.tempId ?? Number(rawId)
  const removing = entry.method === 'DELETE'

  switch (resource) {
    case 'transactions': {
      const before = entry.method === 'POST' ? undefined : findTransaction(id)
      const after = removing ? undefined : ({ ...before, ...body, id } as Transaction)
      if (before) applyMoney(before, -1)
      if (after) applyMoney(after, 1)
      updateLists(before, after)
      return after
    }
    case 'accounts': {
      const list = client.getQueryData<Account[]>(['accounts']) ?? []
      const before = list.find((a) => a.id === id)
      const opening = (body.opening_balance as number) ?? before?.opening_balance ?? 0
      const after = removing
        ? undefined
        : ({ ...before, ...body, id, balance: (before?.balance ?? 0) + opening - (before?.opening_balance ?? 0) } as Account)
      upsert(['accounts'], id, after)
      return after
    }
    case 'categories': {
      const after = removing ? undefined : ({ ...body, id } as Category)
      upsert(['categories'], id, after)
      return after
    }
    case 'budgets': {
      if (removing) {
        for (const [key] of cached<Budget[]>(['budgets'])) upsert<Budget>(key, id, undefined)
        return undefined
      }
      let result: Budget | undefined
      for (const [key, list] of cached<Budget[]>(['budgets'])) {
        const existing = list?.find((b) => b.category_id === body.category_id)
        const spent =
          existing?.spent ??
          client.getQueryData<Overview>(['overview', key[1]])?.by_category.find((r) => r.category_id === body.category_id)
            ?.amount ??
          0
        const item = { ...existing, id: existing?.id ?? id, category_id: body.category_id, amount: body.amount, spent } as Budget
        upsert(key, item.id, item)
        result ??= item
      }
      return result ?? { id, ...body, spent: 0 }
    }
  }
  return removing ? undefined : { ...body, id }
}

// ---- syncing ---------------------------------------------------------------------

/** Replace temporary ids with real ones in a later entry's path and body. */
function remap(entry: Entry, ids: Map<number, number>): Entry {
  if (!ids.size) return entry
  const path = entry.path.replace(/\/(-\d+)(?=\/|$)/g, (m, id) => (ids.has(Number(id)) ? `/${ids.get(Number(id))}` : m))
  const body = entry.body
    ? JSON.parse(JSON.stringify(entry.body), (k, v) =>
        typeof v === 'number' && v < 0 && k.endsWith('_id') && ids.has(v) ? ids.get(v) : v,
      )
    : entry.body
  return { ...entry, path, body }
}

let running: Promise<number> | null = null

/** Send queued changes in order. Callers during a run share it, so a read can wait for it. */
export function syncNow(): Promise<number> {
  if (running) return running
  if (!navigator.onLine || load().length === 0) return Promise.resolve(0)
  running = replay().finally(() => {
    running = null
    syncing = false
    emit()
  })
  return running
}

async function replay(): Promise<number> {
  syncing = true
  emit()
  const ids = new Map<number, number>()
  let sent = 0
  for (;;) {
    const [head, ...rest] = load()
    if (!head) break
    const entry = remap(head, ids)
    try {
      const res = await send<{ id?: number } | undefined>(entry.method, entry.path, entry.body)
      if (entry.tempId && res?.id) ids.set(entry.tempId, res.id)
      sent++
    } catch (e) {
      if (retryable(e)) break // still offline: try again later
      if (e instanceof ApiError && e.status === 401) break // signed out: keep it until they sign in
      // The server refused this one (e.g. its course was deleted elsewhere): set it aside.
      const note = { ...(entry.body as object), error: (e as Error).message }
      save([...load(FAILED_KEY), { ...entry, body: note }], FAILED_KEY)
    }
    save(rest.map((x) => remap(x, ids)))
  }
  // Refetch in the background (not awaited: those reads would wait on this very run).
  if (sent && client) void client.invalidateQueries()
  return sent
}

/** Wire the outbox to the app: remember the query cache and sync whenever a connection appears. */
export function startOfflineSync(qc: QueryClient) {
  client = qc
  const kick = () => {
    emit()
    void syncNow()
  }
  // Back online: send the outbox (which refreshes everything afterwards); with nothing to
  // send, still refresh whatever was marked stale while offline.
  window.addEventListener('online', () => {
    emit()
    void syncNow().then((sent) => {
      if (!sent) void qc.invalidateQueries()
    })
  })
  window.addEventListener('offline', emit)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick())
  setInterval(() => load().length && kick(), 30_000)
  kick()
}

export type { Entry }
