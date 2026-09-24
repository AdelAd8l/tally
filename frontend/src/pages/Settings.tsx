import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PageHeader from '../components/PageHeader'
import { api } from '../lib/api'
import { CURRENCIES } from '../lib/format'
import { useUser } from '../lib/hooks'

export default function Settings() {
  const user = useUser()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(user.name)
  const [currency, setCurrency] = useState(user.currency)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const profile = useMutation({
    mutationFn: () => api.updateMe({ name, currency }),
    onSuccess: (u) => qc.setQueryData(['me'], u),
  })
  const password = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
    },
  })
  const remove = useMutation({
    mutationFn: api.deleteMe,
    onSuccess: () => {
      qc.clear()
      qc.setQueryData(['me'], null)
      navigate('/signup')
    },
  })

  return (
    <div className="page page-narrow">
      <PageHeader title="Settings" />

      <section className="settings-section">
        <div className="settings-intro">
          <h3>Profile</h3>
          <p className="muted">How Tally greets you and formats money.</p>
        </div>
        <form
          className="stack panel panel-pad"
          onSubmit={(e) => {
            e.preventDefault()
            profile.mutate()
          }}
        >
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>Email</span>
            <input className="input" value={user.email} disabled />
          </label>
          <label className="field">
            <span>Currency</span>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([user.currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="form-foot">
            {profile.isSuccess && <span className="faint">Saved</span>}
            {profile.error && <span className="danger-text">{profile.error.message}</span>}
            <button className="btn btn-primary" disabled={profile.isPending}>
              Save profile
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <h3>Password</h3>
          <p className="muted">At least 8 characters.</p>
        </div>
        <form
          className="stack panel panel-pad"
          onSubmit={(e) => {
            e.preventDefault()
            password.mutate()
          }}
        >
          <label className="field">
            <span>Current password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>New password</span>
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
            {password.isSuccess && <span className="faint">Password changed</span>}
            {password.error && <span className="danger-text">{password.error.message}</span>}
            <button className="btn" disabled={password.isPending}>
              Change password
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section">
        <div className="settings-intro">
          <h3>Delete account</h3>
          <p className="muted">Removes your account and every transaction. This can't be undone.</p>
        </div>
        <div className="panel panel-pad form-foot">
          <button
            className="btn btn-danger"
            onClick={() => confirm('Delete your account and all of its data?') && remove.mutate()}
          >
            Delete my account
          </button>
        </div>
      </section>
    </div>
  )
}
