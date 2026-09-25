import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import GoogleButton from '../components/GoogleButton'
import Logo from '../components/Logo'
import { api } from '../lib/api'
import { CURRENCIES, currencyLabel, guessCurrency } from '../lib/format'
import { displayName, setLang, t, useLang, type Key } from '../lib/i18n'
import { browserTimeZone } from '../lib/push'
import { LanguageSwitch } from './Settings'

const RECEIPT = [
  ['Rent', '1,450.00'],
  ['Groceries', '386.20'],
  ['Transport', '112.75'],
  ['Dining out', '164.30'],
  ['Utilities', '119.00'],
]

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [currency, setCurrency] = useState(guessCurrency)
  const signup = mode === 'signup'
  const lang = useLang()

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then(
        (r) => r.json() as Promise<{ signup?: boolean; google?: boolean; demo?: { email: string; password: string } }>,
      ),
    staleTime: 0,
  })

  const submit = useMutation({
    mutationFn: (creds?: { email: string; password: string }) =>
      creds
        ? api.login(creds.email, creds.password)
        : signup
          ? api.register(name, email, password, currency, browserTimeZone())
          : api.login(email, password),
    onSuccess: (user) => {
      qc.setQueryData(['me'], user)
      navigate('/')
    },
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    submit.mutate(undefined)
  }

  const [params] = useSearchParams()
  const googleResult = ['cancelled', 'expired', 'failed', 'closed', 'unverified'].find((r) => r === params.get('google'))
  const demo = health.data?.demo
  // Only offer sign-up once the server confirms it's open (no flash of the link when closed).
  const signupOpen = health.data?.signup === true

  return (
    <div className="auth">
      <div className="auth-form-col">
        <div className="auth-top">
          <Logo size={26} />
          <LanguageSwitch value={lang} onChange={setLang} />
        </div>
        <div className="auth-form-wrap">
          <h1>{signup ? t('auth.signupTitle') : t('auth.loginTitle')}</h1>
          <p className="muted auth-lede">{signup ? t('auth.signupLede') : t('auth.loginLede')}</p>

          {googleResult && <p className="form-error">{t(`auth.google_${googleResult}` as Key)}</p>}
          {health.data?.google && (
            <>
              <GoogleButton lang={lang} currency={currency} />
              <p className="auth-or">
                <span>{t('auth.or')}</span>
              </p>
            </>
          )}

          <form className="stack" onSubmit={onSubmit}>
            {signup && (
              <label className="field">
                <span>{t('common.name')}</span>
                <input
                  className="input"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
            )}
            <label className="field">
              <span>{t('common.email')}</span>
              <input
                className="input"
                dir="ltr"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>{t('common.password')}</span>
              <input
                className="input"
                dir="ltr"
                type="password"
                autoComplete={signup ? 'new-password' : 'current-password'}
                minLength={signup ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {signup && (
              <label className="field">
                <span>{t('common.currency')}</span>
                <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {currencyLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {submit.error && <p className="form-error">{submit.error.message}</p>}
            <button className="btn btn-primary btn-block" disabled={submit.isPending}>
              {submit.isPending ? t('auth.wait') : signup ? t('auth.create') : t('auth.signIn')}
            </button>
            {demo && (
              <button type="button" className="btn btn-block" onClick={() => submit.mutate(demo)}>
                {t('auth.demo')}
              </button>
            )}
          </form>

          <p className="auth-switch muted">
            {signup ? (
              <>
                {t('auth.haveAccount')} <Link to="/login">{t('auth.signIn')}</Link>
              </>
            ) : signupOpen ? (
              <>
                {t('auth.newHere')} <Link to="/signup">{t('auth.createLink')}</Link>
              </>
            ) : null}
          </p>
          <p className="auth-privacy faint">
            <Link to="/privacy">{t('privacy.link')}</Link>
          </p>
        </div>
      </div>

      <aside className="auth-art" aria-hidden="true">
        <div className="receipt">
          <div className="receipt-head">
            <span>{t('auth.receiptMonth')}</span>
            <span className="num">2026</span>
          </div>
          <ul>
            {RECEIPT.map(([label, value]) => (
              <li key={label}>
                <span>{displayName(label)}</span>
                <span className="leader" />
                <span className="num">{value}</span>
              </li>
            ))}
          </ul>
          <div className="receipt-total">
            <span>{t('auth.receiptSpent')}</span>
            <span className="num">2,232.25</span>
          </div>
          <div className="receipt-total receipt-saved">
            <span>{t('auth.receiptSaved')}</span>
            <span className="num">+1,067.75</span>
          </div>
          <svg className="receipt-tally" viewBox="0 0 120 40">
            <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <path d="M8 6v28M18 6v28M28 6v28M38 6v28M3 28 43 12" />
              <path d="M60 6v28M70 6v28M80 6v28" />
            </g>
          </svg>
        </div>
        <p className="auth-quote">{t('auth.quote')}</p>
      </aside>
    </div>
  )
}
