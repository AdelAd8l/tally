import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import PasswordGate from './components/PasswordGate'
import { useMe } from './lib/hooks'
import { useLang } from './lib/i18n'
import Accounts from './pages/Accounts'
import Admin from './pages/Admin'
import AuthPage from './pages/AuthPage'
import Budgets from './pages/Budgets'
import Categories from './pages/Categories'
import Overview from './pages/Overview'
import Settings from './pages/Settings'
import Transactions from './pages/Transactions'

export default function App() {
  const { data: user, isPending } = useMe()
  // Re-mount everything when the language changes so every string and number re-renders.
  const lang = useLang()

  if (isPending) return <div className="boot" aria-busy="true" />

  if (!user) {
    return (
      <Routes key={lang}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // A temporary password (first admin sign-in, or reset by an admin) must be replaced first.
  if (user.must_change_password) return <PasswordGate key={lang} user={user} />

  return (
    <Routes key={lang}>
      <Route element={<Layout user={user} />}>
        <Route index element={<Overview />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="categories" element={<Categories />} />
        <Route path="settings" element={<Settings />} />
        {user.is_admin && <Route path="admin" element={<Admin />} />}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
