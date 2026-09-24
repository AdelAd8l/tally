import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import MonthPicker from '../components/MonthPicker'
import Money from '../components/Money'
import PageHeader from '../components/PageHeader'
import TransactionRow from '../components/TransactionRow'
import TrendChart from '../components/TrendChart'
import { api } from '../lib/api'
import { currentMonth, monthBounds, monthName, percentChange, shiftMonth } from '../lib/format'
import { UNCATEGORIZED, useCategories, useComposer, useMonth, useUser } from '../lib/hooks'

export default function Overview() {
  const { month } = useMonth()
  const user = useUser()
  const openComposer = useComposer()
  const { byId } = useCategories()
  const { start, end } = monthBounds(month)

  const overview = useQuery({ queryKey: ['overview', month], queryFn: () => api.overview(month) })
  const trend = useQuery({ queryKey: ['trend', month], queryFn: () => api.trend(month, 6) })
  const budgets = useQuery({ queryKey: ['budgets', month], queryFn: () => api.budgets(month) })
  const recent = useQuery({
    queryKey: ['transactions', 'recent', month],
    queryFn: () => api.transactions({ start, end, limit: 6 }),
  })

  const o = overview.data
  const firstName = user.name.split(' ')[0]
  const isCurrent = month === currentMonth()
  const hasActivity = o && (o.income > 0 || o.expense > 0)

  return (
    <div className="page">
      <PageHeader title={isCurrent ? `Hello, ${firstName}` : monthName(month)}>
        <MonthPicker />
      </PageHeader>

      <section className="figures" aria-label="Summary">
        <Figure label="Spent" cents={o?.expense} delta={o && percentChange(o.expense, o.previous_expense)} invert />
        <Figure label="Earned" cents={o?.income} delta={o && percentChange(o.income, o.previous_income)} />
        <Figure
          label="Saved"
          cents={o ? o.income - o.expense : undefined}
          note={o && o.income > 0 ? `${Math.round(((o.income - o.expense) / o.income) * 100)}% of income` : undefined}
        />
        <Figure label="Net worth" cents={o?.net_worth} note="Across all accounts" />
      </section>

      {o && !hasActivity && (
        <div className="empty">
          <h3>Nothing recorded in {monthName(month)}</h3>
          <p className="muted">Add your first expense or income and this page fills in.</p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => openComposer()}>
              Add a transaction
            </button>
            <Link className="btn" to="/transactions">
              Import a CSV
            </Link>
          </div>
        </div>
      )}

      <div className="overview-grid">
        <section className="panel span-2">
          <div className="panel-head">
            <h2>Last six months</h2>
          </div>
          {trend.data && <TrendChart data={trend.data} selected={month} />}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Where it went</h2>
          </div>
          {o && o.by_category.length > 0 ? (
            <ul className="breakdown">
              {o.by_category.slice(0, 7).map((row) => {
                const cat = (row.category_id && byId.get(row.category_id)) || UNCATEGORIZED
                const share = row.amount / o.expense
                return (
                  <li key={row.category_id ?? 0}>
                    <div className="breakdown-line">
                      <span className="swatch" style={{ background: cat.color }} />
                      <span className="breakdown-name">{cat.name}</span>
                      <span className="faint num">{Math.round(share * 100)}%</span>
                      <Money cents={row.amount} />
                    </div>
                    <div className="breakdown-bar">
                      <span style={{ width: `${share * 100}%`, background: cat.color }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="faint panel-empty">No spending this month.</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Budgets</h2>
            <Link to="/budgets" className="link-quiet">
              Manage
            </Link>
          </div>
          {budgets.data && budgets.data.length > 0 ? (
            <ul className="budget-mini">
              {[...budgets.data]
                .sort((a, b) => b.spent / b.amount - a.spent / a.amount)
                .slice(0, 5)
                .map((b) => {
                  const pct = b.spent / b.amount
                  const cat = byId.get(b.category_id)
                  return (
                    <li key={b.id}>
                      <div className="budget-mini-line">
                        <span>{cat?.name}</span>
                        <span className="num faint">
                          <Money cents={b.spent} whole className={pct > 1 ? 'danger-text' : ''} /> /{' '}
                          <Money cents={b.amount} whole />
                        </span>
                      </div>
                      <div className={`meter ${pct > 1 ? 'is-over' : pct > 0.85 ? 'is-warn' : ''}`}>
                        <span style={{ width: `${Math.min(pct, 1) * 100}%` }} />
                      </div>
                    </li>
                  )
                })}
            </ul>
          ) : (
            <p className="faint panel-empty">
              No budgets yet. <Link to="/budgets">Set one</Link> to keep a category in check.
            </p>
          )}
        </section>

        <section className="panel span-2">
          <div className="panel-head">
            <h2>Recent</h2>
            <Link to="/transactions" className="link-quiet">
              All transactions
            </Link>
          </div>
          {recent.data && recent.data.items.length > 0 ? (
            <ul className="tx-list">
              {recent.data.items.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} showDate />
              ))}
            </ul>
          ) : (
            <p className="faint panel-empty">Nothing here yet.</p>
          )}
        </section>
      </div>
    </div>
  )
}

interface FigureProps {
  label: string
  cents?: number
  delta?: number | null
  invert?: boolean
  note?: string
}

function Figure({ label, cents, delta, invert, note }: FigureProps) {
  const { month } = useMonth()
  const prev = monthName(shiftMonth(month, -1), 'short')
  let detail = note
  let tone = ''
  if (delta !== undefined && delta !== null) {
    const good = invert ? delta <= 0 : delta >= 0
    tone = delta === 0 ? '' : good ? 'is-good' : 'is-bad'
    detail = delta === 0 ? `Same as ${prev}` : `${Math.abs(delta)}% ${delta > 0 ? 'more' : 'less'} than ${prev}`
  }
  return (
    <div className="figure">
      <span className="figure-label">{label}</span>
      <span className="figure-value">{cents === undefined ? <span className="skeleton" /> : <Money cents={cents} />}</span>
      <span className={`figure-note ${tone}`}>{detail ?? ' '}</span>
    </div>
  )
}
