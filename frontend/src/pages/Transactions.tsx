import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useMemo, useState } from 'react'

import Check from '../components/Check'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import MonthPicker from '../components/MonthPicker'
import Money from '../components/Money'
import PageHeader from '../components/PageHeader'
import SwatchSelect from '../components/SwatchSelect'
import TypedConfirm from '../components/TypedConfirm'
import TransactionRow from '../components/TransactionRow'
import { api, type Transaction } from '../lib/api'
import { ask } from '../lib/confirm'
import { dayHeading, monthBounds, monthName } from '../lib/format'
import { UNCATEGORIZED, useAccounts, useCategories, useComposer, useMonth, useRefreshMoney } from '../lib/hooks'
import { displayName, t } from '../lib/i18n'

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
  const refresh = useRefreshMoney()

  // tick-box mode: pick several transactions (or everything matching the filters) and delete them together
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

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

  // what is on screen changed (month, search, filter): the old ticks no longer describe it
  const filterKey = JSON.stringify(filters)
  const [pickedFor, setPickedFor] = useState(filterKey)
  if (pickedFor !== filterKey) {
    setPickedFor(filterKey)
    setPicked(new Set())
    setAllMatching(false)
  }

  const total = first?.total ?? 0
  const selectedCount = allMatching ? total : picked.size
  const isPicked = (id: number) => allMatching || picked.has(id)
  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggleDay = (txs: Transaction[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      for (const tx of txs) {
        if (on) next.add(tx.id)
        else next.delete(tx.id)
      }
      return next
    })
  const clearSelection = () => {
    setPicked(new Set())
    setAllMatching(false)
  }
  const stopSelecting = () => {
    clearSelection()
    setSelecting(false)
  }

  const bulkDelete = useMutation({
    mutationFn: () =>
      allMatching
        ? api.bulkDeleteTransactions({
            matching: {
              start,
              end,
              q: q || undefined,
              kind: kind || undefined,
              account_id: accountId ? Number(accountId) : undefined,
              category_id: categoryId !== '' ? Number(categoryId) : undefined,
            },
          })
        : api.bulkDeleteTransactions({ ids: [...picked] }),
    onSuccess: () => {
      refresh()
      stopSelecting()
    },
  })

  async function deleteSelected() {
    const n = selectedCount
    if (!n) return
    const yes = await ask({
      title: n === 1 ? t('txs.confirmBulkTitle1') : t('txs.confirmBulkTitle', { n }),
      body: t('txs.confirmBulkBody'),
      confirm: t('txs.deleteSelected'),
    })
    if (yes) bulkDelete.mutate()
  }

  return (
    <div className="page">
      <PageHeader title={t('nav.transactions')}>
        <MonthPicker />
      </PageHeader>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <span className="visually-hidden">{t('common.search')}</span>
          <input
            className="input"
            type="search"
            placeholder={t('txs.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="segmented" role="group" aria-label={t('common.type')}>
          {(
            [
              ['', 'txs.all'],
              ['expense', 'txs.spending'],
              ['income', 'txs.income'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>
              {t(label)}
            </button>
          ))}
        </div>
        <SwatchSelect
          className="select select-auto"
          colorOf={(v) => (v === '0' ? UNCATEGORIZED.color : categories.find((c) => String(c.id) === v)?.color)}
          value={categoryId}
          onChange={setCategoryId}
        >
          <option value="">{t('txs.allCategories')}</option>
          <option value="0">{t('common.uncategorized')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {displayName(c.name)}
            </option>
          ))}
        </SwatchSelect>
        {accounts.length > 1 && (
          <SwatchSelect
            className="select select-auto"
            colorOf={(v) => accounts.find((a) => String(a.id) === v)?.color}
            value={accountId}
            onChange={setAccountId}
          >
            <option value="">{t('txs.allAccounts')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {displayName(a.name)}
              </option>
            ))}
          </SwatchSelect>
        )}
        <span className="spacer" />
        <button className="btn" onClick={() => setImporting(true)}>
          <Icon name="upload" size={16} /> {t('txs.import')}
        </button>
        <a className="btn" href={api.exportUrl({ start, end })} download>
          <Icon name="download" size={16} /> {t('txs.export')}
        </a>
        <button
          className={`btn${selecting ? ' btn-primary' : ''}`}
          aria-pressed={selecting}
          onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
        >
          <Icon name="list" size={16} /> {selecting ? t('txs.doneSelecting') : t('txs.select')}
        </button>
        <button className="btn btn-danger" onClick={() => setDeletingAll(true)}>
          <Icon name="trash" size={16} /> {t('txs.deleteAll')}
        </button>
      </div>

      {first && (
        <p className="summary-line">
          <span>{first.total === 1 ? t('txs.count1') : t('txs.count', { n: first.total })}</span>
          <span className="dot" />
          {t('txs.in')} <Money cents={first.income} className="income" />
          <span className="dot" />
          {t('txs.out')} <Money cents={first.expense} />
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
              {t('txs.clear')}
            </button>
          )}
        </p>
      )}

      {first && items.length === 0 && (
        <div className="empty">
          <h3>{filtered ? t('txs.noMatches') : t('txs.emptyTitle', { month: monthName(month) })}</h3>
          <p className="muted">{filtered ? t('txs.tryDifferent') : t('txs.emptyBody')}</p>
          {!filtered && (
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => openComposer()}>
                {t('txs.addOne')}
              </button>
              <button className="btn" onClick={() => setImporting(true)}>
                {t('txs.importCsv')}
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
                <div className="day-title">
                  {selecting && (
                    <Check
                      checked={txs.every((x) => isPicked(x.id))}
                      indeterminate={txs.some((x) => isPicked(x.id))}
                      disabled={allMatching}
                      onChange={(on) => toggleDay(txs, on)}
                      label={t('txs.selectDay')}
                    />
                  )}
                  <h3>{dayHeading(day)}</h3>
                </div>
                <Money cents={net} sign className="faint" />
              </header>
              <ul className="tx-list">
                {txs.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    tx={tx}
                    select={selecting ? { selected: isPicked(tx.id), onToggle: () => toggle(tx.id), disabled: allMatching } : undefined}
                  />
                ))}
              </ul>
            </section>
          )
        })}
      </div>

      {query.hasNextPage && (
        <div className="load-more">
          <button className="btn" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? t('txs.loading') : t('txs.loadMore')}
          </button>
        </div>
      )}

      {selecting && (
        <div className="select-bar" role="region" aria-label={t('txs.select')}>
          <span className="select-count">
            {allMatching ? t('txs.allSelected', { n: total }) : t('txs.selected', { n: picked.size })}
          </span>
          {!allMatching && total > picked.size && (
            <button
              className="btn btn-sm"
              onClick={() => (query.hasNextPage ? setAllMatching(true) : setPicked(new Set(items.map((x) => x.id))))}
            >
              {t('txs.selectAll', { n: total })}
            </button>
          )}
          {selectedCount > 0 && (
            <button className="btn btn-quiet btn-sm" onClick={clearSelection}>
              {t('txs.clearSelection')}
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn-danger-solid" disabled={!selectedCount || bulkDelete.isPending} onClick={deleteSelected}>
            <Icon name="trash" size={16} /> {bulkDelete.isPending ? t('txs.deleting') : t('txs.deleteSelected')}
            {selectedCount > 0 && !bulkDelete.isPending ? ` (${selectedCount})` : ''}
          </button>
          <button className="btn" onClick={stopSelecting}>
            {t('txs.doneSelecting')}
          </button>
        </div>
      )}
      {bulkDelete.error && <p className="form-error">{bulkDelete.error.message}</p>}

      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <DeleteAllDialog open={deletingAll} onClose={() => setDeletingAll(false)} onDone={stopSelecting} />
    </div>
  )
}

/** "Delete all": everything the person has, in every month and account, behind a typed confirmation. */
function DeleteAllDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const refresh = useRefreshMoney()
  const everything = useQuery({
    queryKey: ['transactions', 'all-count'],
    queryFn: () => api.transactions({ limit: 1 }),
    enabled: open,
    staleTime: 0,
  })
  const count = everything.data?.total

  return (
    <TypedConfirm
      open={open}
      onClose={onClose}
      title={t('txs.deleteAllTitle')}
      body={t('txs.deleteAllBody', { n: count ?? '…' })}
      word={t('txs.deleteAllWord')}
      goLabel={t('txs.deleteAllGo')}
      emptyText={count === 0 ? t('txs.deleteAllNone') : undefined}
      ready={count !== undefined}
      extra={
        <a className="btn btn-sm" href={api.exportUrl({})} download>
          <Icon name="download" size={16} /> {t('txs.deleteAllBackup')}
        </a>
      }
      onConfirm={async () => {
        await api.deleteAllTransactions()
        refresh()
        onDone()
      }}
    />
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
    <Modal title={t('import.title')} open={open} onClose={close} width={480}>
      {upload.isSuccess ? (
        <div className="stack">
          <p>
            {t('import.done', { n: upload.data.imported })}
            {upload.data.created_categories.length > 0 && (
              <> {t('import.newCategories', { list: upload.data.created_categories.join('، ') })}</>
            )}
          </p>
          <footer className="modal-actions">
            <span className="spacer" />
            <button className="btn btn-primary" onClick={close}>
              {t('import.doneBtn')}
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
          <p className="muted">{t('import.help')}</p>
          <label className="field">
            <span>{t('import.into')}</span>
            <SwatchSelect
              colorOf={(v) => accounts.find((a) => String(a.id) === v)?.color}
              value={accountId || String(accounts[0]?.id ?? '')}
              onChange={setAccountId}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {displayName(a.name)}
                </option>
              ))}
            </SwatchSelect>
          </label>
          <label className="dropzone">
            <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Icon name="upload" />
            <span>{file ? file.name : t('import.choose')}</span>
          </label>
          {upload.error && <p className="form-error">{upload.error.message}</p>}
          <footer className="modal-actions">
            <span className="spacer" />
            <button type="button" className="btn" onClick={close}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary" disabled={!file || upload.isPending}>
              {upload.isPending ? t('import.importing') : t('import.go')}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  )
}
