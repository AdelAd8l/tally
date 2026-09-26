import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Columns, Donut, LineChart, NumbersTable, type Stack } from '../components/charts'
import { compact } from '../lib/chart'
import MonthPicker from '../components/MonthPicker'
import PageHeader from '../components/PageHeader'
import { api, type Insights } from '../lib/api'
import { currentMonth, money, monthName, shiftMonth } from '../lib/format'
import { UNCATEGORIZED, useAccounts, useCategories, useMonth, useUser } from '../lib/hooks'
import { displayName, locale, t } from '../lib/i18n'

const RANGES = [1, 3, 6, 12] as const
// Arabic counts months differently for 1, 3–10 and 11+, so each choice has its own text.
const RANGE_LABEL = { 1: 'reports.range1', 3: 'reports.range3', 6: 'reports.range6', 12: 'reports.range12' } as const
const TOP_CATEGORIES = 6 // the rest are folded into "Other"
const OTHER_COLOR = '#8d8b82'
// The week as it is lived here: Saturday first. Server weekdays are Monday = 0.
const WEEK = [5, 6, 0, 1, 2, 3, 4]

/** Axis ticks for amounts kept in cents. */
const cents = (v: number) => compact(v / 100)

const weekdayName = (monday0: number, style: 'short' | 'long') =>
  new Date(2026, 0, 5 + monday0).toLocaleDateString(locale(), { weekday: style }) // Jan 5 2026 is a Monday

export default function Reports() {
  const { month } = useMonth()
  const [range, setRange] = useState<(typeof RANGES)[number]>(6)
  const insights = useQuery({ queryKey: ['insights', month, range], queryFn: () => api.insights(month, range) })
  const data = insights.data

  return (
    <div className="page">
      <PageHeader title={t('nav.reports')}>
        <MonthPicker />
      </PageHeader>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label={t('reports.range')}>
          {RANGES.map((n) => (
            <button key={n} aria-pressed={range === n} onClick={() => setRange(n)}>
              {t(RANGE_LABEL[n])}
            </button>
          ))}
        </div>
      </div>
      {data ? <ReportBody data={data} /> : <p className="faint">{t('common.loading')}</p>}
    </div>
  )
}

function ReportBody({ data }: { data: Insights }) {
  const { currency } = useUser()
  const { byId } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const fmt = (cents: number) => money(cents, currency, { whole: true })
  const now = currentMonth()

  // Averages only count months that have started.
  const lived = data.months.filter((m) => m.month <= now)
  const n = Math.max(1, lived.length)
  const income = lived.reduce((s, m) => s + m.income, 0)
  const spent = lived.reduce((s, m) => s + m.expense, 0)
  const rate = income > 0 ? Math.round(((income - spent) / income) * 100) : null

  // Categories: the biggest few over the whole range keep their own color; the rest are "Other".
  const byCategory = new Map<number | null, number>()
  for (const c of data.categories) byCategory.set(c.category_id, (byCategory.get(c.category_id) ?? 0) + c.amount)
  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
  const kept = ranked.slice(0, ranked.length > TOP_CATEGORIES + 1 ? TOP_CATEGORIES : ranked.length).map(([id]) => id)
  const folded = ranked.length > kept.length
  const category = (id: number | null) => (id === null ? UNCATEGORIZED : byId.get(id))
  const stacks: Stack[] = [
    ...kept.map((id) => ({ label: displayName(category(id)?.name ?? t('common.uncategorized')), color: category(id)?.color ?? OTHER_COLOR })),
    ...(folded ? [{ label: t('reports.other'), color: OTHER_COLOR }] : []),
  ]
  const stackValues = data.months.map((m) => {
    const row = new Array(stacks.length).fill(0)
    for (const c of data.categories.filter((x) => x.month === m.month)) {
      const k = kept.indexOf(c.category_id)
      row[k === -1 ? stacks.length - 1 : k] += c.amount
    }
    return row
  })
  const top = ranked[0]

  const last = data.months.length - 1
  // Net worth at the end of each month, starting from the end of the month before the period,
  // so even a single month shows a change (start → now).
  const first = data.months[0]
  const worth = [
    { month: shiftMonth(first.month, -1), value: first.net_worth - first.income + first.expense },
    ...data.months.map((m) => ({ month: m.month, value: m.net_worth })),
  ]
  const monthLabels = data.months.map((m) => monthName(m.month, 'short'))
  const accountRows = data.accounts
    .map((a) => ({ ...a, account: accounts.find((x) => x.id === a.account_id) }))
    .filter((a) => a.expense > 0)
    .sort((a, b) => b.expense - a.expense)
  const maxAccount = Math.max(1, ...accountRows.map((a) => a.expense))
  const weekValues = WEEK.map((d) => [data.weekdays[d]])
  const busiest = WEEK.reduce((best, d, i) => (data.weekdays[d] > data.weekdays[WEEK[best]] ? i : best), 0)

  return (
    <>
      <section className="figures" aria-label={t('reports.summary')}>
        <Figure label={t('reports.avgSpent')} value={fmt(Math.round(spent / n))} note={t('reports.perMonth')} />
        <Figure label={t('reports.avgEarned')} value={fmt(Math.round(income / n))} note={t('reports.perMonth')} />
        <Figure
          label={t('reports.savingsRate')}
          value={rate === null ? '—' : `${rate}%`}
          note={t('reports.ofIncomeSaved')}
          tone={rate === null ? '' : rate >= 0 ? 'is-good' : 'is-bad'}
        />
        <Figure
          label={t('reports.topCategory')}
          value={top ? displayName(category(top[0])?.name ?? t('common.uncategorized')) : '—'}
          note={top ? t('reports.ofSpending', { amount: fmt(top[1]), pct: Math.round((top[1] / Math.max(1, spent)) * 100) }) : ' '}
          swatch={top ? category(top[0])?.color : undefined}
        />
      </section>

      <div className="overview-grid reports-grid">
        <Pace data={data} fmt={fmt} />

        <section className="panel">
          <div className="panel-head">
            <h2>{t('reports.netWorth')}</h2>
          </div>
          <p className="chart-note faint">{t('reports.netWorthHint')}</p>
          <LineChart
            series={[{ label: t('reports.netWorth'), color: 'var(--accent)', values: worth.map((w) => w.value) }]}
            xLabel={(i) => monthName(worth[i].month, 'short')}
            format={fmt}
            tick={cents}
            title={(i) => monthName(worth[i].month)}
            initial={worth.length - 1}
            markers
            ariaLabel={t('reports.netWorth')}
          />
          <NumbersTable
            head={[t('reports.month'), t('reports.netWorth')]}
            rows={worth.map((w) => [monthName(w.month), fmt(w.value)])}
          />
        </section>

        <section className="panel span-2">
          <div className="panel-head">
            <h2>{t('reports.byCategory')}</h2>
          </div>
          {stacks.length && data.months.length === 1 ? (
            <>
              <Donut
                slices={stacks}
                values={stackValues[0]}
                format={fmt}
                centerLabel={monthName(data.months[0].month)}
                ariaLabel={t('reports.byCategory')}
              />
              <NumbersTable
                head={[t('common.category'), monthLabels[0], '%']}
                rows={stacks.map((s, k) => [
                  s.label,
                  fmt(stackValues[0][k]),
                  `${Math.round((stackValues[0][k] / Math.max(1, spent)) * 100)}%`,
                ])}
              />
            </>
          ) : stacks.length ? (
            <>
              <Columns
                labels={monthLabels}
                values={stackValues}
                stacks={stacks}
                format={fmt}
                tick={cents}
                title={(i) => monthName(data.months[i].month)}
                initial={last}
                ariaLabel={t('reports.byCategory')}
                height={240}
              />
              <NumbersTable
                head={[t('common.category'), ...monthLabels]}
                rows={stacks.map((s, k) => [s.label, ...stackValues.map((row) => fmt(row[k]))])}
              />
            </>
          ) : (
            <p className="faint panel-empty">{t('reports.nothing')}</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('reports.byAccount')}</h2>
          </div>
          {accountRows.length ? (
            <ul className="account-bars">
              {accountRows.map((a) => (
                <li key={a.account_id}>
                  <span className="cat-name">
                    <span className="swatch" style={{ background: a.account?.color ?? OTHER_COLOR }} />
                    {a.account ? displayName(a.account.name) : '—'}
                  </span>
                  <span className="num">{fmt(a.expense)}</span>
                  <span className="account-bar" aria-hidden="true">
                    <span style={{ width: `${(a.expense / maxAccount) * 100}%`, background: a.account?.color ?? OTHER_COLOR }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="faint panel-empty">{t('reports.nothing')}</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>{t('reports.byWeekday')}</h2>
          </div>
          <p className="chart-note faint">{t('reports.byWeekdayHint')}</p>
          <Columns
            labels={WEEK.map((d) => weekdayName(d, 'short'))}
            values={weekValues}
            stacks={[{ label: t('reports.averageDay'), color: 'var(--accent)' }]}
            format={fmt}
            tick={cents}
            title={(i) => weekdayName(WEEK[i], 'long')}
            initial={busiest}
            labelAt={busiest}
            ariaLabel={t('reports.byWeekday')}
            height={190}
          />
          <NumbersTable
            head={[t('reports.day'), t('reports.averageDay')]}
            rows={WEEK.map((d) => [weekdayName(d, 'long'), fmt(data.weekdays[d])])}
          />
        </section>
      </div>
    </>
  )
}

/** This month's spending added up day by day, against last month's by the same day. */
function Pace({ data, fmt }: { data: Insights; fmt: (c: number) => string }) {
  const { pace } = data
  const len = Math.max(pace.days, pace.previous.length)
  const current = Array.from({ length: len }, (_, i) => (i < pace.current.length ? pace.current[i] : null))
  const previous = Array.from({ length: len }, (_, i) => (i < pace.previous.length ? pace.previous[i] : null))
  const today = pace.current.length - 1
  const thisMonth = monthName(pace.month)
  const lastMonth = monthName(shiftMonth(pace.month, -1))
  let summary = ''
  if (today >= 0) {
    const then = pace.previous[Math.min(today, pace.previous.length - 1)] ?? 0
    const diff = pace.current[today] - then
    summary = t(diff > 0 ? 'reports.paceMore' : diff < 0 ? 'reports.paceLess' : 'reports.paceSame', {
      spent: fmt(pace.current[today]),
      diff: fmt(Math.abs(diff)),
      day: today + 1,
    })
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{t('reports.pace')}</h2>
      </div>
      <p className="chart-note faint">{summary || t('reports.paceFuture')}</p>
      <LineChart
        series={[
          { label: thisMonth, color: 'var(--accent)', values: current },
          { label: lastMonth, color: 'var(--ink-3)', values: previous, muted: true },
        ]}
        xLabel={(i) => String(i + 1)}
        xTick={(i) => i === 0 || (i + 1) % 5 === 0}
        format={fmt}
        tick={cents}
        title={(i) => t('reports.dayN', { n: i + 1 })}
        initial={Math.max(0, today)}
        zero
        ariaLabel={t('reports.pace')}
      />
      <NumbersTable
        head={[t('reports.day'), thisMonth, lastMonth]}
        rows={Array.from({ length: len }, (_, i) => [
          String(i + 1),
          current[i] === null ? '—' : fmt(current[i]!),
          previous[i] === null ? '—' : fmt(previous[i]!),
        ])}
      />
    </section>
  )
}

function Figure({ label, value, note, tone = '', swatch }: { label: string; value: string; note: string; tone?: string; swatch?: string }) {
  return (
    <div className="figure">
      <span className="figure-label">{label}</span>
      <span className="figure-value figure-text">
        {swatch && <span className="swatch" style={{ background: swatch }} />}
        {value}
      </span>
      <span className={`figure-note ${tone}`}>{note}</span>
    </div>
  )
}
