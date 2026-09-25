import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import NotificationSettings from '../components/NotificationSettings'
import PageHeader from '../components/PageHeader'
import { api } from '../lib/api'
import { CURRENCIES, currencyLabel } from '../lib/format'
import { useUser } from '../lib/hooks'
import { setLang, t, useLang, type Lang } from '../lib/i18n'
import { clearOutbox } from '../lib/offline'

export default function Settings() {
  const user = useUser()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(user.name)
  const [currency, setCurrency] = useState(user.currency)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const lang = useLang()

  const profile = useMutation({
    mutationFn: () => api.updateMe({ name, currency }),
    onSuccess: (u) => qc.setQueryData(['me'], u),
  })
  const password = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      // an account made with Google now has a password too
      void qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
  const remove = useMutation({
    mutationFn: api.deleteMe,
    onSuccess: () => {
      clearOutbox()
      qc.clear()
      qc.setQueryData(['me'], null)
      navigate('/signup')
    },
  })

  return (
    <div className="page page-narrow">
      <PageHeader title={t('nav.settings')} />

      <section className="settings-section">
        <div className="settings-intro">
          <h3>{t('common.language')}</h3>
          <p className="muted">{t('settings.languageHint')}</p>
        </div>
        <div className="panel panel-pad">
          <LanguageSwitch value={lang} onChange={setLang} />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <h3>{t('notify.title')}</h3>
          <p className="muted">{t('notify.hint')}</p>
        </div>
        <NotificationSettings user={user} />
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <h3>{t('settings.profile')}</h3>
          <p className="muted">{t('settings.profileHint')}</p>
        </div>
        <form
          className="stack panel panel-pad"
          onSubmit={(e) => {
            e.preventDefault()
            profile.mutate()
          }}
        >
          <label className="field">
            <span>{t('common.name')}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>{t('common.email')}</span>
            <input className="input" dir="ltr" value={user.email} disabled />
          </label>
          <label className="field">
            <span>{t('common.currency')}</span>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([user.currency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>
                  {currencyLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-foot">
            {profile.isSuccess && <span className="faint">{t('settings.saved')}</span>}
            {profile.error && <span className="danger-text">{profile.error.message}</span>}
            <button className="btn btn-primary" disabled={profile.isPending}>
              {t('settings.saveProfile')}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <h3>{t(user.has_password ? 'settings.password' : 'settings.setPassword')}</h3>
          <p className="muted">{t(user.has_password ? 'settings.passwordHint' : 'settings.setPasswordHint')}</p>
        </div>
        <form
          className="stack panel panel-pad"
          onSubmit={(e) => {
            e.preventDefault()
            password.mutate()
          }}
        >
          {user.has_password && (
            <label className="field">
              <span>{t('settings.current')}</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </label>
          )}
          <label className="field">
            <span>{t('settings.newPassword')}</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
          </label>
          <div className="form-foot">
            {password.isSuccess && <span className="faint">{t('settings.passwordChanged')}</span>}
            {password.error && <span className="danger-text">{password.error.message}</span>}
            <button className="btn" disabled={password.isPending}>
              {t('settings.changePassword')}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <h3>{t('settings.delete')}</h3>
          <p className="muted">{t('settings.deleteHint')}</p>
        </div>
        <div className="panel panel-pad form-foot">
          <button
            className="btn btn-danger"
            onClick={() => confirm(t('settings.confirmDelete')) && remove.mutate()}
          >
            {t('settings.deleteBtn')}
          </button>
        </div>
      </section>
    </div>
  )
}

export function LanguageSwitch({ value, onChange }: { value: Lang; onChange: (lang: Lang) => void }) {
  return (
    <div className="segmented" role="group" aria-label={t('common.language')}>
      <button type="button" aria-pressed={value === 'en'} onClick={() => onChange('en')} lang="en">
        English
      </button>
      <button type="button" aria-pressed={value === 'ar'} onClick={() => onChange('ar')} lang="ar">
        العربية
      </button>
    </div>
  )
}
