import { currentMonth, monthName, shiftMonth } from '../lib/format'
import { useMonth } from '../lib/hooks'
import Icon from './Icon'

export default function MonthPicker() {
  const { month, setMonth } = useMonth()
  const isCurrent = month === currentMonth()
  return (
    <div className="month-picker">
      <button className="btn btn-quiet icon-btn" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
        <Icon name="left" />
      </button>
      <span className="month-label">{monthName(month)}</span>
      <button
        className="btn btn-quiet icon-btn"
        onClick={() => setMonth(shiftMonth(month, 1))}
        disabled={isCurrent}
        aria-label="Next month"
      >
        <Icon name="right" />
      </button>
      {!isCurrent && (
        <button className="btn btn-quiet btn-sm" onClick={() => setMonth(currentMonth())}>
          This month
        </button>
      )}
    </div>
  )
}
