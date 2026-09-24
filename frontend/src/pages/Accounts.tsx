import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import Modal from '../components/Modal'
import Money from '../components/Money'
import PageHeader from '../components/PageHeader'
import { api, type Account, type AccountKind } from '../lib/api'
import { centsToInput } from '../lib/format'
import { useAccounts, useRefreshMoney } from '../lib/hooks'

const KINDS: Record<AccountKind, string> = {
  checking: 'Checking',
  savings: 'Savings',
  cash: 'Cash',
  credit: 'Credit card',
}

export default function Accounts() {
  const { data: accounts = [] } = useAccounts()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const total = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="page page-narrow">
      <PageHeader title="Accounts">
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          Add account
        </button>
      </PageHeader>

      <div className="panel">
        <ul className="ledger">
          {accounts.map((a) => (
            <li key={a.id}>
              <button className="ledger-row" onClick={() => setEditing(a)}>
                <span>
                  <strong>{a.name}</strong>
                  <span className="faint ledger-sub">{KINDS[a.kind]}</span>
                </span>
                <Money cents={a.balance} className={a.balance < 0 ? 'danger-text' : ''} />
              </button>
            </li>
          ))}
        </ul>
        <div className="ledger-total">
          <span>Total</span>
          <Money cents={total} />
        </div>
      </div>
      <p className="faint hint">
        Balances are the opening balance plus every income minus every expense recorded against the account.
      </p>

      <AccountDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function AccountDialog({ editing, onClose }: { editing: Account | 'new' | null; onClose: () => void }) {
  const refresh = useRefreshMoney()
  const existing = editing && editing !== 'new' ? editing : null
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('checking')
  const [opening, setOpening] = useState('')
  const [lastKey, setLastKey] = useState<string | null>(null)

  const key = editing === null ? null : existing ? `a${existing.id}` : 'new'
  if (key !== lastKey) {
    setLastKey(key)
    setName(existing?.name ?? '')
    setKind(existing?.kind ?? 'checking')
    setOpening(existing ? centsToInput(existing.opening_balance) : '')
  }

  const save = useMutation({
    mutationFn: () => {
      const value = opening.trim() === '' ? 0 : Math.round(Number(opening.replace(/,/g, '')) * 100)
      if (Number.isNaN(value)) throw new Error('Opening balance must be a number')
      return api.saveAccount({ name, kind, opening_balance: value }, existing?.id)
    },
    onSuccess: async () => {
      await refresh()
      onClose()
    },
  })
  const remove = useMutation({
    mutationFn: () => api.deleteAccount(existing!.id),
    onSuccess: async () => {
      await refresh()
      onClose()
    },
  })
  const error = save.error ?? remove.error

  return (
    <Modal
      title={existing ? 'Edit account' : 'New account'}
      open={editing !== null}
      onClose={() => {
        save.reset()
        remove.reset()
        onClose()
      }}
      width={420}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Type</span>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {Object.entries(KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Opening balance</span>
            <input
              className="input input-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="form-error">{error.message}</p>}
        <footer className="modal-actions">
          {existing && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => confirm(`Delete ${existing.name}?`) && remove.mutate()}
            >
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={save.isPending}>
            Save
          </button>
        </footer>
      </form>
    </Modal>
  )
}
