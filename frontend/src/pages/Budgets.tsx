import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import Modal from '../components/Modal'
import MonthPicker from '../components/MonthPicker'
import Money from '../components/Money'
import PageHeader from '../components/PageHeader'
import { api, type Budget } from '../lib/api'
import type { Key } from '../lib/i18n'
import { centsToInput, currentMonth, monthBounds, monthName, parseAmount, todayISO } from '../lib/format'
import { useCategories, useMonth, useRefreshMoney } from '../lib/hooks'
import { displayName, t } from '../lib/i18n'

export default function Budgets() {
  const { month } = useMonth()
  const { byId, data: categories = [] } = useCategories()
  const budgets = useQuery({ queryKey: ['budgets', month], queryFn: () => api.budgets(month) })
  const [editing, setEditing] = useState<Budget | 'new' | null>(null)

  const { days } = monthBounds(month)
  const isCurrent = month === currentMonth()
  const dayOfMonth = isCurrent ? Number(todayISO().slice(8)) : days
  const elapsed = dayOfMonth / days

  const rows = budgets.data ?? []
  const budgeted = rows.reduce((s, b) => s + b.amount, 0)
  const spent = rows.reduce((s, b) => s + b.spent, 0)
  const unbudgeted = categories.filter((c) => c.kind === 'expense' && !rows.some((b) => b.category_id === c.id))

  return (
    <div className="page">
      <PageHeader title={t('nav.budgets')}>
        <MonthPicker />
        <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={!unbudgeted.length}>
          {t('budgets.add')}
        </button>
      </PageHeader>

      {rows.length > 0 && (
        <section className="figures figures-3">
          <div className="figure">
            <span className="figure-label">{t('budgets.budgeted')}</span>
            <span className="figure-value">
              <Money cents={budgeted} />
            </span>
            <span className="figure-note">{t('budgets.categoriesN', { n: rows.length })}</span>
          </div>
          <div className="figure">
            <span className="figure-label">{t('budgets.spent')}</span>
            <span className="figure-value">
              <Money cents={spent} />
            </span>
            <span className="figure-note">
              {t('budgets.pctOfBudget', { pct: Math.round((spent / budgeted) * 100) })}
            </span>
          </div>
          <div className="figure">
            <span className="figure-label">
              {budgeted - spent >= 0 ? t('budgets.left') : t('budgets.overBudget')}
            </span>
            <span className="figure-value">
              <Money cents={Math.abs(budgeted - spent)} className={budgeted - spent < 0 ? 'danger-text' : ''} />
            </span>
            <span className="figure-note">
              {isCurrent
                ? t('budgets.daysLeft', { n: days - dayOfMonth, month: monthName(month, 'short') })
                : t('budgets.closed')}
            </span>
          </div>
        </section>
      )}

      {budgets.data && rows.length === 0 && (
        <div className="empty">
          <h3>{t('budgets.emptyTitle')}</h3>
          <p className="muted">{t('budgets.emptyBody')}</p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              {t('budgets.create')}
            </button>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="budget-list panel">
          {rows.map((b) => {
            const cat = byId.get(b.category_id)
            const pct = b.spent / b.amount
            const projected = isCurrent && dayOfMonth > 0 ? Math.round((b.spent / dayOfMonth) * days) : null
            const state = pct > 1 ? 'is-over' : isCurrent && pct > elapsed + 0.1 ? 'is-warn' : ''
            return (
              <li key={b.id}>
                <button className="budget-row" onClick={() => setEditing(b)}>
                  <div className="budget-row-top">
                    <span className="budget-name">
                      <span className="swatch" style={{ background: cat?.color }} />
                      {cat ? displayName(cat.name) : t('budgets.deleted')}
                    </span>
                    <span className="budget-figures">
                      <Money cents={b.spent} className={pct > 1 ? 'danger-text' : ''} />
                      <span className="faint"> {t('budgets.of')} </span>
                      <Money cents={b.amount} />
                    </span>
                  </div>
                  <div className={`meter meter-lg ${state}`}>
                    <span style={{ width: `${Math.min(pct, 1) * 100}%` }} />
                    {isCurrent && (
                      <i
                        className="meter-today"
                        style={{ insetInlineStart: `${elapsed * 100}%` }}
                        title={t('budgets.today')}
                      />
                    )}
                  </div>
                  <div className="budget-row-bottom faint">
                    <span>
                      {pct > 1 ? (
                        <span className="danger-text">
                          <Amounted k="budgets.over" cents={b.spent - b.amount} />
                        </span>
                      ) : (
                        <Amounted k="budgets.leftAmount" cents={b.amount - b.spent} />
                      )}
                    </span>
                    {projected !== null && pct <= 1 && (
                      <span className={projected > b.amount ? 'warn-text' : ''}>
                        <Amounted k="budgets.onPace" cents={projected} whole />
                      </span>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <BudgetDialog
        editing={editing}
        options={editing && editing !== 'new' ? [] : unbudgeted}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

interface DialogProps {
  editing: Budget | 'new' | null
  options: { id: number; name: string }[]
  onClose: () => void
}

function BudgetDialog({ editing, options, onClose }: DialogProps) {
  const { byId } = useCategories()
  const refresh = useRefreshMoney()
  const existing = editing && editing !== 'new' ? editing : null
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [lastKey, setLastKey] = useState<string | null>(null)

  // Reset fields when a different budget (or "new") is opened.
  const key = editing === null ? null : existing ? `b${existing.id}` : 'new'
  if (key !== lastKey) {
    setLastKey(key)
    setCategoryId(existing ? String(existing.category_id) : '')
    setAmount(existing ? centsToInput(existing.amount) : '')
  }

  const save = useMutation({
    mutationFn: () => {
      const cents = parseAmount(amount)
      const cat = Number(categoryId || options[0]?.id)
      if (!cents) throw new Error(t('budgets.amountError'))
      return api.saveBudget(cat, cents)
    },
    onSuccess: async () => {
      await refresh()
      onClose()
    },
  })
  const remove = useMutation({
    mutationFn: () => api.deleteBudget(existing!.id),
    onSuccess: async () => {
      await refresh()
      onClose()
    },
  })

  return (
    <Modal
      title={
        existing
          ? t('budgets.titleFor', { name: displayName(byId.get(existing.category_id)?.name ?? '') })
          : t('budgets.new')
      }
      open={editing !== null}
      onClose={() => {
        save.reset()
        onClose()
      }}
      width={400}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        {!existing && (
          <label className="field">
            <span>{t('common.category')}</span>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {displayName(c.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          <span>{t('budgets.limit')}</span>
          <input
            className="input input-amount"
            dir="ltr"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {save.error && <p className="form-error">{save.error.message}</p>}
        <footer className="modal-actions">
          {existing && (
            <button type="button" className="btn btn-danger" onClick={() => remove.mutate()}>
              {t('common.remove')}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={save.isPending}>
            {t('common.save')}
          </button>
        </footer>
      </form>
    </Modal>
  )
}

/** A translated sentence with a formatted amount in place of {amount}; word order differs by language. */
function Amounted({ k, cents, whole }: { k: Key; cents: number; whole?: boolean }) {
  const [before, after] = t(k).split('{amount}')
  return (
    <>
      {before}
      <Money cents={cents} whole={whole} />
      {after}
    </>
  )
}
