import { money } from '../lib/format'
import { useUser } from '../lib/hooks'

interface Props {
  cents: number
  sign?: boolean
  whole?: boolean
  className?: string
}

export default function Money({ cents, sign, whole, className = '' }: Props) {
  const { currency } = useUser()
  return <span className={`num ${className}`}>{money(cents, currency, { sign, whole })}</span>
}
