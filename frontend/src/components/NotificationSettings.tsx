import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { api, type User } from '../lib/api'
import { t, type Key } from '../lib/i18n'
import { disablePush, enablePush, pushState, type PushState } from '../lib/push'
import TimeZoneField from './TimeZoneField'

type Prefs = Pick<User, 'notify_budgets' | 'daily_reminder' | 'daily_time' | 'monthly_summary' | 'timezone'>
const pick = (u: User): Prefs => ({
  notify_budgets: u.notify_budgets,
  daily_reminder: u.daily_reminder,
  daily_time: u.daily_time,
  monthly_summary: u.monthly_summary,
  timezone: u.timezone,
})

/** Settings → Notifications: turn them on for this phone and choose which ones to get. */
export default function NotificationSettings({ user }: { user: User }) {
  const qc = useQueryClient()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void pushState().then(setState)
  }, [])

  const toggle = async (on: boolean) => {
    setBusy(true)
    setError('')
    try {
      setState(await (on ? enablePush() : disablePush()))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // The controls change at once (local state); saves run one after another and only the
  // newest answer is applied, so quick taps can't undo each other.
  const [prefs, setPrefs] = useState(() => pick(user))
  const latest = useRef(0)
  const save = useMutation({
    scope: { id: 'profile' },
    mutationFn: ({ data }: { data: Partial<Prefs>; n: number }) => api.updateMe(data),
    onSuccess: (u, { n }) => {
      if (n !== latest.current) return
      qc.setQueryData(['me'], u)
      setPrefs(pick(u))
    },
    onError: (_e, { n }) => n === latest.current && setPrefs(pick(user)),
  })
  const change = (data: Partial<Prefs>) => {
    setPrefs((p) => ({ ...p, ...data }))
    save.mutate({ data, n: ++latest.current })
  }
  const test = useMutation({ mutationFn: api.pushTest })

  const option = (field: 'notify_budgets' | 'daily_reminder' | 'monthly_summary', label: Key, hint: Key) => (
    <label className="check notify-option">
      <input type="checkbox" checked={prefs[field]} onChange={(e) => change({ [field]: e.target.checked })} />
      <span>
        {t(label)}
        <small className="faint">{t(hint)}</small>
      </span>
    </label>
  )

  return (
    <div className="stack panel panel-pad">
      <div className="notify-device">
        <div>
          <strong>{t('notify.thisDevice')}</strong>
          <p className="faint help">
            {state === 'on'
              ? t('notify.on')
              : state === 'needs-install'
                ? t('notify.needsInstall')
                : state === 'denied'
                  ? t('notify.denied')
                  : state === 'unsupported'
                    ? t('notify.unsupported')
                    : t('notify.off')}
          </p>
        </div>
        {(state === 'on' || state === 'off') && (
          <button
            type="button"
            className={state === 'on' ? 'btn' : 'btn btn-primary'}
            disabled={busy}
            onClick={() => void toggle(state === 'off')}
          >
            {state === 'on' ? t('notify.turnOff') : t('notify.turnOn')}
          </button>
        )}
      </div>

      {option('notify_budgets', 'notify.budgets', 'notify.budgetsHint')}
      <div className="notify-row">
        {option('daily_reminder', 'notify.daily', 'notify.dailyHint')}
        {prefs.daily_reminder && (
          <input
            className="input notify-time"
            type="time"
            aria-label={t('notify.daily')}
            value={prefs.daily_time}
            onChange={(e) => e.target.value && change({ daily_time: e.target.value })}
          />
        )}
      </div>
      {option('monthly_summary', 'notify.monthly', 'notify.monthlyHint')}
      <TimeZoneField value={prefs.timezone} onChange={(timezone) => change({ timezone })} />

      <div className="form-foot">
        {test.isSuccess && <span className="faint">{t('notify.testSent')}</span>}
        {(error || save.error || test.error) && (
          <span className="danger-text">{error || (save.error ?? test.error)!.message}</span>
        )}
        {state === 'on' && (
          <button type="button" className="btn btn-quiet" disabled={test.isPending} onClick={() => test.mutate()}>
            {t('notify.test')}
          </button>
        )}
      </div>
    </div>
  )
}
