import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import { useMe } from './lib/hooks'
import Accounts from './pages/Accounts'
import AuthPage from './pages/AuthPage'
import Budgets from './pages/Budgets'
import Categories from './pages/Categories'
import Overview from './pages/Overview'
import Settings from './pages/Settings'
import Transactions from './pages/Transactions'

export default function App() {
  const { data: user, isPending } = useMe()

  if (isPending) return <div className="boot" aria-busy="true" />

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout user={user} />}>
        <Route index element={<Overview />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="budgets" element={<Budgets />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="categories" element={<Categories />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
