import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { api, type Kind, type Transaction, type User } from '../lib/api'
import { currentMonth } from '../lib/format'
import { ComposerContext, MonthContext } from '../lib/hooks'
import { t, useLang, type Key } from '../lib/i18n'
import { clearOutbox } from '../lib/offline'
import { browserTimeZone, detachPush, pushState, refreshPush } from '../lib/push'
import Icon, { type IconName } from './Icon'
import Logo from './Logo'
import SyncStatus from './SyncStatus'
import TransactionForm from './TransactionForm'

const NAV: { to: string; label: Key; icon: IconName }[] = [
  { to: '/', label: 'nav.overview', icon: 'overview' },
  { to: '/transactions', label: 'nav.transactions', icon: 'list' },
  { to: '/budgets', label: 'nav.budgets', icon: 'target' },
  { to: '/accounts', label: 'nav.accounts', icon: 'wallet' },
  { to: '/categories', label: 'nav.categories', icon: 'tag' },
  { to: '/settings', label: 'nav.settings', icon: 'gear' },
]

const ADMIN_NAV = { to: '/admin', label: 'nav.admin', icon: 'shield' } as const

export default function Layout({ user }: { user: User }) {
  const [month, setMonth] = useState(currentMonth)
  const [composer, setComposer] = useState<{ kind?: Kind; editing?: Transaction; key: number } | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const openComposer = useCallback((preset?: { kind?: Kind; editing?: Transaction }) => {
    setComposer({ ...preset, key: Date.now() })
  }, [])

  // "N" anywhere (outside a text field) starts a new transaction. e.code is the physical key,
  // so it also works with an Arabic keyboard layout.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.code !== 'KeyN' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
      if (target.closest('input, textarea, select, [contenteditable], dialog')) return
      e.preventDefault()
      openComposer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openComposer])

  // Notifications are written on the server in the account's language, so keep it in step.
  // (The time zone is NOT copied from each device: it's a setting, so a laptop in one
  // country and a phone in another can't keep flipping it. See Settings → Notifications.)
  const lang = useLang()
  useEffect(() => {
    if (!navigator.onLine || user.lang === lang) return
    api
      .updateMe({ lang })
      .then((u) => qc.setQueryData(['me'], u))
      .catch(() => {})
  }, [user.lang, lang, qc])
  useEffect(() => void refreshPush(), [user.id])

  // Automatic time zone: follow the phone that receives the reminders (so it changes by itself
  // when you travel). Devices without notifications, like a laptop, never change it.
  useEffect(() => {
    const zone = browserTimeZone()
    if (!user.timezone_auto || zone === user.timezone || !navigator.onLine) return
    void pushState()
      .then((state) => (state === 'on' ? api.updateMe({ timezone: zone }) : null))
      .then((u) => u && qc.setQueryData(['me'], u))
      .catch(() => {})
  }, [user.timezone_auto, user.timezone, qc])

  async function signOut() {
    await detachPush()
    await api.logout()
    clearOutbox()
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
                {t('shell.new')}
                <kbd>N</kbd>
              </button>
            </div>
            <nav className="nav" aria-label={t('nav.main')}>
              {(user.is_admin ? [...NAV, ADMIN_NAV] : NAV).map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-link">
                  <Icon name={item.icon} />
                  <span>{t(item.label)}</span>
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
              <button
                className="btn btn-quiet icon-btn"
                onClick={signOut}
                aria-label={t('shell.signOut')}
                title={t('shell.signOut')}
              >
                <Icon name="logout" flip />
              </button>
            </div>
          </aside>

          <main className="main">
            <Outlet />
          </main>

          <SyncStatus />

          <button className="fab btn btn-primary" onClick={() => openComposer()} aria-label={t('shell.new')}>
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
