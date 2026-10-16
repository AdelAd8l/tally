import type { Transaction } from '../lib/api'
import { shortDate } from '../lib/format'
import { UNCATEGORIZED, useAccounts, useCategories, useComposer } from '../lib/hooks'
import { displayName, t } from '../lib/i18n'
import Check from './Check'
import Money from './Money'

interface Select {
  selected: boolean
  onToggle: () => void
  disabled?: boolean
}

/** With `select`, the row becomes a tick-box row (tap anywhere on it) instead of opening the editor. */
export default function TransactionRow({
  tx,
  showDate = false,
  select,
}: {
  tx: Transaction
  showDate?: boolean
  select?: Select
}) {
  const { byId } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const openComposer = useComposer()
  const category = (tx.category_id && byId.get(tx.category_id)) || UNCATEGORIZED
  const account = accounts.find((a) => a.id === tx.account_id)

  const cells = (
    <>
      <span className="tx-cat">
        <span className="swatch" style={{ background: category.color }} />
        {displayName(category.name)}
      </span>
      <span className="tx-note">{tx.note || <span className="faint tx-no-note">—</span>}</span>
      <span className="tx-meta faint">
        {showDate ? `${shortDate(tx.occurred_on)} · ` : ''}
        {accounts.length > 1 && account && (
          <>
            <span className="swatch swatch-dot" style={{ background: account.color }} />
            {displayName(account.name)}
          </>
        )}
      </span>
      <Money
        cents={tx.kind === 'income' ? tx.amount : -tx.amount}
        sign
        className={`tx-amount ${tx.kind === 'income' ? 'income' : ''}`}
      />
    </>
  )

  if (select) {
    return (
      <li>
        <label className={`tx-pick${select.selected ? ' is-picked' : ''}${select.disabled ? ' is-locked' : ''}`}>
          <Check checked={select.selected} disabled={select.disabled} onChange={select.onToggle} label={t('txs.selectRow')} />
          <span className="tx-row">{cells}</span>
        </label>
      </li>
    )
  }

  return (
    <li>
      <button className="tx-row" onClick={() => openComposer({ editing: tx })}>
        {cells}
      </button>
    </li>
  )
}
