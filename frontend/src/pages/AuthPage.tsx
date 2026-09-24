import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import Logo from '../components/Logo'
import { api } from '../lib/api'

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
  const signup = mode === 'signup'

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then(
        (r) => r.json() as Promise<{ signup?: boolean; demo?: { email: string; password: string } }>,
      ),
    staleTime: Infinity,
  })

  const submit = useMutation({
    mutationFn: (creds?: { email: string; password: string }) =>
      creds
        ? api.login(creds.email, creds.password)
        : signup
          ? api.register(name, email, password)
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

  const demo = health.data?.demo
  const signupOpen = health.data?.signup !== false

  return (
    <div className="auth">
      <div className="auth-form-col">
        <Logo size={26} />
        <div className="auth-form-wrap">
          <h1>{signup ? 'Start keeping tally' : 'Welcome back'}</h1>
          <p className="muted auth-lede">
            {signup
              ? 'A quiet place to see where your money goes. Free, private, no bank login needed.'
              : 'Sign in to pick up where you left off.'}
          </p>

          <form className="stack" onSubmit={onSubmit}>
            {signup && (
              <label className="field">
                <span>Name</span>
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
              <span>Email</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                autoComplete={signup ? 'new-password' : 'current-password'}
                minLength={signup ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {submit.error && <p className="form-error">{submit.error.message}</p>}
            <button className="btn btn-primary btn-block" disabled={submit.isPending}>
              {submit.isPending ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
            </button>
            {demo && (
              <button type="button" className="btn btn-block" onClick={() => submit.mutate(demo)}>
                Look around with the demo account
              </button>
            )}
          </form>

          <p className="auth-switch muted">
            {signup ? (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            ) : signupOpen ? (
              <>
                New here? <Link to="/signup">Create an account</Link>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <aside className="auth-art" aria-hidden="true">
        <div className="receipt">
          <div className="receipt-head">
            <span>September</span>
            <span className="num">2026</span>
          </div>
          <ul>
            {RECEIPT.map(([label, value]) => (
              <li key={label}>
                <span>{label}</span>
                <span className="leader" />
                <span className="num">{value}</span>
              </li>
            ))}
          </ul>
          <div className="receipt-total">
            <span>Spent</span>
            <span className="num">2,232.25</span>
          </div>
          <div className="receipt-total receipt-saved">
            <span>Saved</span>
            <span className="num">+1,067.75</span>
          </div>
          <svg className="receipt-tally" viewBox="0 0 120 40">
            <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none">
              <path d="M8 6v28M18 6v28M28 6v28M38 6v28M3 28 43 12" />
              <path d="M60 6v28M70 6v28M80 6v28" />
            </g>
          </svg>
        </div>
        <p className="auth-quote">Every dollar, accounted for.</p>
      </aside>
    </div>
  )
}
