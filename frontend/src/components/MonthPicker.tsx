import { currentMonth, monthName, shiftMonth } from '../lib/format'
import { useMonth } from '../lib/hooks'
import { t } from '../lib/i18n'
import Icon from './Icon'

export default function MonthPicker() {
  const { month, setMonth } = useMonth()
  const isCurrent = month === currentMonth()
  return (
    <div className="month-picker">
      <button
        className="btn btn-quiet icon-btn"
        onClick={() => setMonth(shiftMonth(month, -1))}
        aria-label={t('month.prev')}
      >
        <Icon name="left" flip />
      </button>
      <span className="month-label">{monthName(month)}</span>
      <button
        className="btn btn-quiet icon-btn"
        onClick={() => setMonth(shiftMonth(month, 1))}
        disabled={isCurrent}
        aria-label={t('month.next')}
      >
        <Icon name="right" flip />
      </button>
      {!isCurrent && (
        <button className="btn btn-quiet btn-sm" onClick={() => setMonth(currentMonth())}>
          {t('month.this')}
        </button>
      )}
    </div>
  )
}
