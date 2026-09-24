import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import Modal from '../components/Modal'
import Money from '../components/Money'
import PageHeader from '../components/PageHeader'
import { api, type Account, type AccountKind } from '../lib/api'
import { centsToInput } from '../lib/format'
import { useAccounts, useRefreshMoney } from '../lib/hooks'
import { displayName, t, type Key } from '../lib/i18n'

const KINDS: Record<AccountKind, Key> = {
  checking: 'accounts.kind.checking',
  savings: 'accounts.kind.savings',
  cash: 'accounts.kind.cash',
  credit: 'accounts.kind.credit',
}

export default function Accounts() {
  const { data: accounts = [] } = useAccounts()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const total = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="page page-narrow">
      <PageHeader title={t('nav.accounts')}>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          {t('accounts.add')}
        </button>
      </PageHeader>

      <div className="panel">
        <ul className="ledger">
          {accounts.map((a) => (
            <li key={a.id}>
              <button className="ledger-row" onClick={() => setEditing(a)}>
                <span>
                  <strong>{displayName(a.name)}</strong>
                  <span className="faint ledger-sub">{t(KINDS[a.kind])}</span>
                </span>
                <Money cents={a.balance} className={a.balance < 0 ? 'danger-text' : ''} />
              </button>
            </li>
          ))}
        </ul>
        <div className="ledger-total">
          <span>{t('common.total')}</span>
          <Money cents={total} />
        </div>
      </div>
      <p className="faint hint">{t('accounts.hint')}</p>

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
      if (Number.isNaN(value)) throw new Error(t('accounts.openingError'))
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
      title={existing ? t('accounts.edit') : t('accounts.new')}
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
          <span>{t('common.name')}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>{t('common.type')}</span>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {Object.entries(KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('accounts.opening')}</span>
            <input
              className="input input-amount"
              dir="ltr"
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
              onClick={() =>
                confirm(t('accounts.confirmDelete', { name: displayName(existing.name) })) && remove.mutate()
              }
            >
              {t('common.delete')}
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
