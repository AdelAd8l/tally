// Money, date and month helpers.

const moneyFormatters = new Map<string, Intl.NumberFormat>()

export function money(cents: number, currency: string, opts: { sign?: boolean; whole?: boolean } = {}) {
  const key = `${currency}-${opts.whole}`
  let fmt = moneyFormatters.get(key)
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: opts.whole ? 0 : 2,
      maximumFractionDigits: opts.whole ? 0 : 2,
    })
    moneyFormatters.set(key, fmt)
  }
  const text = fmt.format(Math.abs(cents) / 100)
  if (cents < 0) return `−${text}`
  if (opts.sign && cents > 0) return `+${text}`
  return text
}

/** Parse what a person types ("12", "12.5", "1,200.00") into cents, or null. */
export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/,/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const cents = Math.round(parseFloat(cleaned) * 100)
  return cents > 0 ? cents : null
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2)

export function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const pad = (n: number) => String(n).padStart(2, '0')

export const currentMonth = () => todayISO().slice(0, 7)

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${pad(last)}`, days: last }
}

export function monthName(month: string, style: 'long' | 'short' = 'long') {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(y, m - 1, 1)
  const sameYear = y === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: style,
    year: style === 'long' && !sameYear ? 'numeric' : undefined,
  })
}

export function dayHeading(iso: string) {
  const today = todayISO()
  const d = new Date(`${iso}T00:00:00`)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === today) return 'Today'
  if (iso === `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`)
    return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null
  return Math.round(((current - previous) / previous) * 100)
}

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED', 'CAD', 'AUD', 'JPY', 'INR', 'CHF', 'TRY']
