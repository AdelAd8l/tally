import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { api, type Kind, type Transaction, type User } from '../lib/api'
import { currentMonth } from '../lib/format'
import { ComposerContext, MonthContext } from '../lib/hooks'
import Icon, { type IconName } from './Icon'
import Logo from './Logo'
import TransactionForm from './TransactionForm'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Overview', icon: 'overview' },
  { to: '/transactions', label: 'Transactions', icon: 'list' },
  { to: '/budgets', label: 'Budgets', icon: 'target' },
  { to: '/accounts', label: 'Accounts', icon: 'wallet' },
  { to: '/categories', label: 'Categories', icon: 'tag' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
]

export default function Layout({ user }: { user: User }) {
  const [month, setMonth] = useState(currentMonth)
  const [composer, setComposer] = useState<{ kind?: Kind; editing?: Transaction; key: number } | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const openComposer = useCallback((preset?: { kind?: Kind; editing?: Transaction }) => {
    setComposer({ ...preset, key: Date.now() })
  }, [])

  // "n" anywhere (outside a text field) starts a new transaction.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      if (target.closest('input, textarea, select, [contenteditable], dialog')) return
      e.preventDefault()
      openComposer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openComposer])

  async function signOut() {
    await api.logout()
    qc.clear()
    qc.setQueryData(['me'], null)
    navigate('/login')
  }

  return (
    <MonthContext.Provider value={{ month, setMonth }}>
      <ComposerContext.Provider value={openComposer}>
        <div className="shell">
          <aside className="sidebar">
            <div className="sidebar-top">
              <Logo />
              <button className="btn btn-primary new-btn" onClick={() => openComposer()}>
                <Icon name="plus" size={16} />
                New transaction
                <kbd>N</kbd>
              </button>
            </div>
            <nav className="nav" aria-label="Main">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link">
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-user">
              <div className="avatar" aria-hidden="true">
                {user.name.trim().charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-user-text">
                <strong>{user.name}</strong>
                <span className="faint">{user.email}</span>
              </div>
              <button className="btn btn-quiet icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
                <Icon name="logout" />
              </button>
            </div>
          </aside>

          <main className="main">
            <Outlet />
          </main>

          <button className="fab btn btn-primary" onClick={() => openComposer()} aria-label="New transaction">
            <Icon name="plus" size={22} />
          </button>
        </div>

        <TransactionForm
          key={composer?.key ?? 0}
          open={composer !== null}
          initialKind={composer?.kind}
          editing={composer?.editing}
          onClose={() => setComposer(null)}
        />
      </ComposerContext.Provider>
    </MonthContext.Provider>
  )
}
