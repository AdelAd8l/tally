import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { useDeferredValue, useMemo, useState } from 'react'

import Icon from '../components/Icon'
import Modal from '../components/Modal'
import MonthPicker from '../components/MonthPicker'
import Money from '../components/Money'
import PageHeader from '../components/PageHeader'
import TransactionRow from '../components/TransactionRow'
import { api, type Transaction } from '../lib/api'
import { dayHeading, monthBounds, monthName } from '../lib/format'
import { useAccounts, useCategories, useComposer, useMonth, useRefreshMoney } from '../lib/hooks'

const PAGE = 100

export default function Transactions() {
  const { month } = useMonth()
  const { start, end } = monthBounds(month)
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const openComposer = useComposer()

  const [search, setSearch] = useState('')
  const q = useDeferredValue(search.trim())
  const [kind, setKind] = useState<'' | 'expense' | 'income'>('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [importing, setImporting] = useState(false)

  const filters = { start, end, q, kind, account_id: accountId, category_id: categoryId }
  const query = useInfiniteQuery({
    queryKey: ['transactions', 'list', filters],
    queryFn: ({ pageParam }) => api.transactions({ ...filters, limit: PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
  })

  const first = query.data?.pages[0]
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data])
  const days = useMemo(() => groupByDay(items), [items])
  const filtered = Boolean(q || kind || accountId || categoryId)

  return (
    <div className="page">
      <PageHeader title="Transactions">
        <MonthPicker />
      </PageHeader>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <span className="visually-hidden">Search</span>
          <input
            className="input"
            type="search"
            placeholder="Search notes and categories"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="segmented" role="group" aria-label="Type">
          {(
            [
              ['', 'All'],
              ['expense', 'Spending'],
              ['income', 'Income'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>
              {label}
            </button>
          ))}
        </div>
        <select className="select select-auto" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          <option value="0">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {accounts.length > 1 && (
          <select className="select select-auto" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <span className="spacer" />
        <button className="btn" onClick={() => setImporting(true)}>
          <Icon name="upload" size={16} /> Import
        </button>
        <a className="btn" href={api.exportUrl({ start, end })} download>
          <Icon name="download" size={16} /> Export
        </a>
      </div>

      {first && (
        <p className="summary-line">
          <span className="num">{first.total}</span> {first.total === 1 ? 'transaction' : 'transactions'}
          <span className="dot" />
          In <Money cents={first.income} className="income" />
          <span className="dot" />
          Out <Money cents={first.expense} />
          {filtered && (
            <button
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setSearch('')
                setKind('')
                setAccountId('')
                setCategoryId('')
              }}
            >
              Clear filters
            </button>
          )}
        </p>
      )}

      {first && items.length === 0 && (
        <div className="empty">
          <h3>{filtered ? 'No matches' : `No transactions in ${monthName(month)}`}</h3>
          <p className="muted">
            {filtered ? 'Try a different search or filter.' : 'Add one by hand, or import a CSV from your bank.'}
          </p>
          {!filtered && (
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => openComposer()}>
                Add a transaction
              </button>
              <button className="btn" onClick={() => setImporting(true)}>
                Import CSV
              </button>
            </div>
          )}
        </div>
      )}

      <div className="day-groups">
        {days.map(([day, txs]) => {
          const net = txs.reduce((sum, t) => sum + (t.kind === 'income' ? t.amount : -t.amount), 0)
          return (
            <section key={day} className="day-group">
              <header className="day-head">
                <h3>{dayHeading(day)}</h3>
                <Money cents={net} sign className="faint" />
              </header>
              <ul className="tx-list">
                {txs.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {query.hasNextPage && (
        <div className="load-more">
          <button className="btn" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </div>
  )
}

function groupByDay(items: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>()
  for (const tx of items) {
    const list = map.get(tx.occurred_on) ?? []
    list.push(tx)
    map.set(tx.occurred_on, list)
  }
  return [...map.entries()]
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: accounts = [] } = useAccounts()
  const refresh = useRefreshMoney()
  const [accountId, setAccountId] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const upload = useMutation({
    mutationFn: () => api.importTransactions(Number(accountId || accounts[0]?.id), file!),
    onSuccess: () => refresh(),
  })

  function close() {
    upload.reset()
    setFile(null)
    onClose()
  }

  return (
    <Modal title="Import from CSV" open={open} onClose={close} width={480}>
      {upload.isSuccess ? (
        <div className="stack">
          <p>
            Imported <b className="num">{upload.data.imported}</b> transactions.
            {upload.data.created_categories.length > 0 && (
              <> New categories: {upload.data.created_categories.join(', ')}.</>
            )}
          </p>
          <footer className="modal-actions">
            <span className="spacer" />
            <button className="btn btn-primary" onClick={close}>
              Done
            </button>
          </footer>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            upload.mutate()
          }}
        >
          <p className="muted">
            Needs <code>date</code> (YYYY-MM-DD) and <code>amount</code> columns. <code>category</code>,{' '}
            <code>note</code> and <code>kind</code> are optional. Without <code>kind</code>, negative amounts are
            treated as spending.
          </p>
          <label className="field">
            <span>Into account</span>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="dropzone">
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Icon name="upload" />
            <span>{file ? file.name : 'Choose a .csv file'}</span>
          </label>
          {upload.error && <p className="form-error">{upload.error.message}</p>}
          <footer className="modal-actions">
            <span className="spacer" />
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button className="btn btn-primary" disabled={!file || upload.isPending}>
              {upload.isPending ? 'Importing…' : 'Import'}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  )
}
