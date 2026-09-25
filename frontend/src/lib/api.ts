// Typed client for the Tally API. All amounts are integer cents.

import { send, withQuery, type Query } from './http'
import { pendingCount, syncNow, write } from './offline'

export type Kind = 'expense' | 'income'
export type AccountKind = 'checking' | 'savings' | 'cash' | 'credit'

export interface User {
  id: number
  email: string
  name: string
  currency: string
  timezone: string
  timezone_auto: boolean
  lang: 'en' | 'ar'
  notify_budgets: boolean
  daily_reminder: boolean
  daily_time: string
  monthly_summary: boolean
  is_admin: boolean
  must_change_password: boolean
  has_password: boolean
}
export interface SiteSettings {
  allow_signup: boolean
}
export interface AdminUser {
  id: number
  email: string
  name: string
  currency: string
  is_admin: boolean
  must_change_password: boolean
  created_at: string
  accounts: number
  transactions: number
  budgets: number
}
export type AdminUserUpdate = Partial<Pick<AdminUser, 'name' | 'email' | 'currency' | 'is_admin'>> & {
  new_password?: string
}
export interface Account { id: number; name: string; kind: AccountKind; opening_balance: number; balance: number }
export interface Category { id: number; name: string; kind: Kind; color: string }
export interface Transaction {
  id: number
  account_id: number
  category_id: number | null
  kind: Kind
  amount: number
  occurred_on: string
  note: string
}
export type TransactionInput = Omit<Transaction, 'id'>
export interface TransactionPage { items: Transaction[]; total: number; income: number; expense: number }
export interface Budget { id: number; category_id: number; amount: number; spent: number }
export interface Overview {
  month: string
  income: number
  expense: number
  previous_income: number
  previous_expense: number
  net_worth: number
  by_category: { category_id: number | null; amount: number }[]
  daily: { day: string; expense: number }[]
}
export interface MonthTotal { month: string; income: number; expense: number }

export { ApiError } from './http'

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  if (method === 'GET') {
    // Send queued changes first so the answer already includes them.
    if (pendingCount() && navigator.onLine) await syncNow()
    return send<T>(method, path, body, query)
  }
  // Account and notification calls need the server's answer, and a file upload can't be
  // stored for later: these never go to the outbox. Everything else can wait for a signal.
  if (['/auth/', '/push/', '/admin/'].some((p) => path.startsWith(p)) || body instanceof FormData) {
    return send<T>(method, path, body, query)
  }
  return write<T>(method, path, body)
}

export const api = {
  me: () => request<User>('GET', '/auth/me'),
  login: (email: string, password: string) => request<User>('POST', '/auth/login', { email, password }),
  register: (name: string, email: string, password: string, currency: string, timezone: string) =>
    request<User>('POST', '/auth/register', { name, email, password, currency, timezone }),
  logout: () => request<void>('POST', '/auth/logout'),
  updateMe: (data: Partial<Omit<User, 'id' | 'email'>>) => request<User>('PATCH', '/auth/me', data),
  changePassword: (current_password: string, new_password: string) =>
    request<void>('POST', '/auth/password', { current_password, new_password }),
  deleteMe: () => request<void>('DELETE', '/auth/me'),

  accounts: () => request<Account[]>('GET', '/accounts'),
  saveAccount: (data: Omit<Account, 'id' | 'balance'>, id?: number) =>
    id ? request<Account>('PUT', `/accounts/${id}`, data) : request<Account>('POST', '/accounts', data),
  deleteAccount: (id: number) => request<void>('DELETE', `/accounts/${id}`),

  categories: () => request<Category[]>('GET', '/categories'),
  saveCategory: (data: Omit<Category, 'id'>, id?: number) =>
    id ? request<Category>('PUT', `/categories/${id}`, data) : request<Category>('POST', '/categories', data),
  deleteCategory: (id: number) => request<void>('DELETE', `/categories/${id}`),

  transactions: (query: Query) => request<TransactionPage>('GET', '/transactions', undefined, query),
  saveTransaction: (data: TransactionInput, id?: number) =>
    id
      ? request<Transaction>('PUT', `/transactions/${id}`, data)
      : request<Transaction>('POST', '/transactions', data),
  deleteTransaction: (id: number) => request<void>('DELETE', `/transactions/${id}`),
  importTransactions: (accountId: number, file: File) => {
    const form = new FormData()
    form.set('account_id', String(accountId))
    form.set('file', file)
    return request<{ imported: number; created_categories: string[] }>('POST', '/transactions/import', form)
  },
  exportUrl: (query: Query) => withQuery('/api/transactions/export', query),

  budgets: (month: string) => request<Budget[]>('GET', '/budgets', undefined, { month }),
  saveBudget: (category_id: number, amount: number) => request<Budget>('PUT', '/budgets', { category_id, amount }),
  deleteBudget: (id: number) => request<void>('DELETE', `/budgets/${id}`),

  overview: (month: string) => request<Overview>('GET', '/reports/overview', undefined, { month }),
  trend: (end: string, months = 6) => request<MonthTotal[]>('GET', '/reports/trend', undefined, { end, months }),

  pushKey: () => request<{ public_key: string }>('GET', '/push/key'),
  pushSubscribe: (sub: PushSubscriptionJSON) => request<void>('POST', '/push/subscribe', sub),
  pushUnsubscribe: (endpoint: string) => request<void>('POST', '/push/unsubscribe', { endpoint }),
  pushTest: () => request<{ sent: number }>('POST', '/push/test'),

  adminUsers: (q: string) => request<AdminUser[]>('GET', '/admin/users', undefined, { q }),
  adminUpdateUser: (id: number, data: AdminUserUpdate) => request<AdminUser>('PATCH', `/admin/users/${id}`, data),
  adminDeleteUser: (id: number) => request<void>('DELETE', `/admin/users/${id}`),
  adminSettings: () => request<SiteSettings>('GET', '/admin/settings'),
  adminSaveSettings: (data: SiteSettings) => request<SiteSettings>('PUT', '/admin/settings', data),
}
