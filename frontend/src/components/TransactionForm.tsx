import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { api, type Kind, type Transaction } from '../lib/api'
import { centsToInput, parseAmount, todayISO } from '../lib/format'
import { useAccounts, useCategories, useRefreshMoney, useUser } from '../lib/hooks'
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
      if (!cents) throw new Error('Enter an amount greater than zero, like 12.50')
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
    <Modal title={editing ? 'Edit transaction' : 'New transaction'} open={open} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="segmented segmented-full" role="group" aria-label="Type">
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
              {k === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <label className="amount-field">
          <span className="visually-hidden">Amount</span>
          <span className="amount-currency faint">{currency}</span>
          <input
            className="amount-input num"
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
            <span>Category</span>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {choices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>

        <label className="field">
          <span>Account</span>
          <select
            className="select"
            value={accountId || String(accounts[0]?.id ?? '')}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Note</span>
          <input
            className="input"
            placeholder={kind === 'expense' ? 'What was it for?' : 'Where did it come from?'}
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
              onClick={() => confirm('Delete this transaction?') && remove.mutate()}
              disabled={remove.isPending}
            >
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
