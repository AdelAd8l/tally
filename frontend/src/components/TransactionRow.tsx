import type { Transaction } from '../lib/api'
import { shortDate } from '../lib/format'
import { UNCATEGORIZED, useAccounts, useCategories, useComposer } from '../lib/hooks'
import { displayName } from '../lib/i18n'
import Money from './Money'

export default function TransactionRow({ tx, showDate = false }: { tx: Transaction; showDate?: boolean }) {
  const { byId } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const openComposer = useComposer()
  const category = (tx.category_id && byId.get(tx.category_id)) || UNCATEGORIZED
  const account = accounts.find((a) => a.id === tx.account_id)

  return (
    <li>
      <button className="tx-row" onClick={() => openComposer({ editing: tx })}>
        <span className="tx-cat">
          <span className="swatch" style={{ background: category.color }} />
          {displayName(category.name)}
        </span>
        <span className="tx-note">{tx.note || <span className="faint">—</span>}</span>
        <span className="tx-meta faint">
          {showDate ? `${shortDate(tx.occurred_on)} · ` : ''}
          {accounts.length > 1 && account ? displayName(account.name) : ''}
        </span>
        <Money
          cents={tx.kind === 'income' ? tx.amount : -tx.amount}
          sign
          className={`tx-amount ${tx.kind === 'income' ? 'income' : ''}`}
        />
      </button>
    </li>
  )
}
