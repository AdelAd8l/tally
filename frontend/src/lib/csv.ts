// Importing and exporting transactions without a connection: the same rules as the server (backend/app/routers/
// transactions.py), applied on the phone. The imported rows join the outbox like any other change.

import type { QueryClient } from '@tanstack/react-query'

import type { Account, Category, Kind } from './api'
import { cachedTransactionsBetween, newTempId, writeMany } from './offline'

const MAX_IMPORT_BYTES = 2 * 1024 * 1024
const MAX_IMPORT_ROWS = 20_000
/** Queued changes live in the phone's small storage; a bigger file has to wait for a connection. */
export const MAX_OFFLINE_ROWS = 3000

/** CSV text into rows of cells (quotes, doubled quotes, commas and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      rows.push(row)
      row = []
    } else cell += c
  }
  if (quoted) throw new Error('The file is not a valid CSV (unterminated quote)')
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  // a completely blank line is not a row (the server skips them too)
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/** "1,234.50", "$12", "-3.005" -> cents, rounded half to even like the server. */
export function parseAmount(raw: string): number {
  const cleaned = raw.trim().replace(/[,\s$€£¥]/g, '')
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(cleaned)
  if (!m || (!m[2] && !m[3])) throw new Error(`'${raw}' is not a number`)
  const [, sign, whole, frac = ''] = m
  const digits = (frac + '00').slice(0, 2)
  let cents = Number(whole || '0') * 100 + Number(digits)
  const rest = frac.slice(2)
  if (rest) {
    const half = rest[0] > '5' || (rest[0] === '5' && /[1-9]/.test(rest.slice(1)))
    const exactlyHalf = rest[0] === '5' && !/[1-9]/.test(rest.slice(1))
    if (half || (exactlyHalf && cents % 2 === 1)) cents += 1
  }
  if (!Number.isFinite(cents) || cents > 1e11) throw new Error(`'${raw}' is not a usable amount`)
  return sign === '-' ? -cents : cents
}

const validDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** The import done on the phone (no connection): the file is read here and its rows are queued. */
export function importOffline(qc: QueryClient, accountId: number, text: string, size: number) {
  if (size > MAX_IMPORT_BYTES) throw new Error('File is larger than 2 MB')
  const table = parseCsv(text)
  const headers = (table[0] ?? []).map((h) => h.trim().toLowerCase())
  if (!headers.includes('date') || !headers.includes('amount')) throw new Error("CSV needs at least 'date' and 'amount' columns")
  const body = table.slice(1)
  if (body.length > MAX_IMPORT_ROWS) throw new Error(`The file has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows`)
  if (body.length > MAX_OFFLINE_ROWS) throw new Error('TOO_BIG_OFFLINE')

  const categories = new Map<string, number>()
  for (const c of qc.getQueryData<Category[]>(['categories']) ?? []) categories.set(`${c.name.toLowerCase()}|${c.kind}`, c.id)
  const created: string[] = []
  const items: { method: string; path: string; body?: unknown; tempId?: number }[] = []

  body.forEach((cells, i) => {
    const line = i + 2
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      if (h) row[h] = (cells[j] ?? '').trim()
    })
    if (!validDate(row.date ?? '')) throw new Error(`Line ${line}: Invalid isoformat string: '${row.date ?? ''}'`)
    let amount: number
    try {
      amount = parseAmount(row.amount ?? '')
    } catch (e) {
      throw new Error(`Line ${line}: ${(e as Error).message}`)
    }
    if (amount === 0) return
    const given = (row.kind ?? '').toLowerCase()
    const kind: Kind = given === 'expense' || given === 'income' ? given : amount < 0 ? 'expense' : 'income'

    let categoryId: number | null = null
    const name = (row.category ?? '').slice(0, 40)
    if (name) {
      const key = `${name.toLowerCase()}|${kind}`
      let id = categories.get(key)
      if (id === undefined) {
        id = newTempId()
        categories.set(key, id)
        created.push(name)
        items.push({ method: 'POST', path: '/categories', body: { name, kind, color: '#8A8F98' }, tempId: id })
      }
      categoryId = id
    }
    items.push({
      method: 'POST',
      path: '/transactions',
      body: {
        account_id: accountId,
        category_id: categoryId,
        kind,
        amount: Math.abs(amount),
        occurred_on: row.date,
        note: (row.note ?? row.description ?? '').slice(0, 200),
      },
      tempId: newTempId(),
    })
  })

  writeMany(items)
  return { imported: items.filter((x) => x.path === '/transactions').length, created_categories: created }
}

// ---- export -------------------------------------------------------------------------

/** A cell that starts like a formula is kept as text, like the server's export does. */
const safe = (text: string) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text)
const quote = (text: string) => (/[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text)

/** The transactions this device has saved, as the same CSV the server would send. `complete` says whether
 * that is everything in the period (otherwise it is only what the device has loaded so far). */
export function exportFromDevice(qc: QueryClient, start?: string, end?: string) {
  const { items, total } = cachedTransactionsBetween(start, end)
  const accounts = new Map((qc.getQueryData<Account[]>(['accounts']) ?? []).map((a) => [a.id, a.name]))
  const cats = new Map((qc.getQueryData<Category[]>(['categories']) ?? []).map((c) => [c.id, c.name]))
  items.sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id - b.id)
  const lines = [['date', 'kind', 'amount', 'account', 'category', 'note'].join(',')]
  for (const tx of items) {
    lines.push(
      [
        tx.occurred_on,
        tx.kind,
        (tx.amount / 100).toFixed(2),
        safe(accounts.get(tx.account_id) ?? ''),
        safe(tx.category_id ? (cats.get(tx.category_id) ?? '') : ''),
        safe(tx.note),
      ]
        .map(quote)
        .join(','),
    )
  }
  return { csv: lines.join('\r\n') + '\r\n', count: items.length, total, complete: total !== null && total === items.length }
}

export function saveCsv(csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'tally-transactions.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
