import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import ColorField from '../components/ColorField'
import Modal from '../components/Modal'
import Money from '../components/Money'
import PageHeader from '../components/PageHeader'
import { api, type Account, type AccountKind } from '../lib/api'
import { ask } from '../lib/confirm'
import { centsToInput } from '../lib/format'
import { useAccounts, useRefreshMoney } from '../lib/hooks'
import { displayName, t, type Key } from '../lib/i18n'

const KINDS: Record<AccountKind, Key> = {
  checking: 'accounts.kind.checking',
  savings: 'accounts.kind.savings',
  cash: 'accounts.kind.cash',
  credit: 'accounts.kind.credit',
  wallet: 'accounts.kind.wallet',
}

// A new account's color until one is picked; the same as the server's (models.KIND_COLORS).
const KIND_COLORS: Record<AccountKind, string> = {
  checking: '#5A7FA8',
  savings: '#3F7D5C',
  cash: '#B89B4A',
  credit: '#A0525B',
  wallet: '#8A6FA0',
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
                <span className="cat-name">
                  <span className="swatch" style={{ background: a.color }} />
                  <span>
                    <strong>{displayName(a.name)}</strong>
                    <span className="faint ledger-sub">{t(KINDS[a.kind])}</span>
                  </span>
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
  const [color, setColor] = useState(KIND_COLORS.checking)
  const [picked, setPicked] = useState(false) // until a color is picked, a new account's follows its type
  const [lastKey, setLastKey] = useState<string | null>(null)

  const key = editing === null ? null : existing ? `a${existing.id}` : 'new'
  if (key !== lastKey) {
    setLastKey(key)
    setName(existing?.name ?? '')
    setKind(existing?.kind ?? 'checking')
    setOpening(existing ? centsToInput(existing.opening_balance) : '')
    setColor(existing?.color ?? KIND_COLORS.checking)
    setPicked(!!existing)
  }

  const save = useMutation({
    mutationFn: () => {
      const value = opening.trim() === '' ? 0 : Math.round(Number(opening.replace(/,/g, '')) * 100)
      if (Number.isNaN(value)) throw new Error(t('accounts.openingError'))
      return api.saveAccount({ name, kind, opening_balance: value, color }, existing?.id)
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
            <select
              className="select"
              value={kind}
              onChange={(e) => {
                const next = e.target.value as AccountKind
                setKind(next)
                if (!picked) setColor(KIND_COLORS[next])
              }}
            >
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
        {/* keyed so it starts over (suggested or custom) for each account opened */}
        <ColorField
          key={key ?? ''}
          label={t('accounts.color')}
          value={color}
          onChange={(c) => {
            setColor(c)
            setPicked(true)
          }}
        />
        {error && <p className="form-error">{error.message}</p>}
        <footer className="modal-actions">
          {existing && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () =>
                (await ask({
                  title: t('accounts.confirmDelete', { name: displayName(existing.name) }),
                  confirm: t('common.delete'),
                })) && remove.mutate()
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
