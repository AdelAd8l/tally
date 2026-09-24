import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { api, type Kind, type Transaction } from '../lib/api'
import { centsToInput, parseAmount, todayISO } from '../lib/format'
import { useAccounts, useCategories, useRefreshMoney, useUser } from '../lib/hooks'
import { displayName, t } from '../lib/i18n'
import Modal from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  initialKind?: Kind
  editing?: Transaction
}

export default function TransactionForm({ open, onClose, initialKind, editing }: Props) {
  const { currency } = useUser()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const refresh = useRefreshMoney()

  // Layout remounts this component (new key) each time it opens, so state starts fresh.
  const [kind, setKind] = useState<Kind>(editing?.kind ?? initialKind ?? 'expense')
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amount) : '')
  const [categoryId, setCategoryId] = useState(editing?.category_id ? String(editing.category_id) : '')
  const [accountId, setAccountId] = useState(editing ? String(editing.account_id) : '')
  const [date, setDate] = useState(editing?.occurred_on ?? todayISO())
  const [note, setNote] = useState(editing?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const choices = categories.filter((c) => c.kind === kind)

  const save = useMutation({
    mutationFn: () => {
      const cents = parseAmount(amount)
      if (!cents) throw new Error(t('tx.amountError'))
      return api.saveTransaction(
        {
          kind,
          amount: cents,
          account_id: Number(accountId || accounts[0]?.id),
          category_id: categoryId ? Number(categoryId) : null,
          occurred_on: date,
          note,
        },
        editing?.id,
      )
    },
    onSuccess: async () => {
      await refresh()
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: () => api.deleteTransaction(editing!.id),
    onSuccess: async () => {
      await refresh()
      onClose()
    },
    onError: (e: Error) => setError(e.message),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    save.mutate()
  }

  return (
    <Modal title={editing ? t('tx.edit') : t('tx.new')} open={open} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="segmented segmented-full" role="group" aria-label={t('common.type')}>
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k)
                setCategoryId('')
              }}
            >
              {k === 'expense' ? t('common.expense') : t('common.income')}
            </button>
          ))}
        </div>

        <label className="amount-field">
          <span className="visually-hidden">{t('tx.amount')}</span>
          <span className="amount-currency faint">{currency}</span>
          <input
            className="amount-input num"
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>

        <div className="grid-2">
          <label className="field">
            <span>{t('common.category')}</span>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">{t('common.uncategorized')}</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {displayName(c.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('common.date')}</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>

        <label className="field">
          <span>{t('common.account')}</span>
          <select
            className="select"
            value={accountId || String(accounts[0]?.id ?? '')}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {displayName(a.name)}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{t('common.note')}</span>
          <input
            className="input"
            placeholder={kind === 'expense' ? t('tx.notePlaceholderExpense') : t('tx.notePlaceholderIncome')}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <footer className="modal-actions">
          {editing && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => confirm(t('tx.confirmDelete')) && remove.mutate()}
              disabled={remove.isPending}
            >
              {t('common.delete')}
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? t('tx.saving') : editing ? t('tx.saveChanges') : t('tx.add')}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
