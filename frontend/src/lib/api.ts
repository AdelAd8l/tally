// Typed client for the Tally API. All amounts are integer cents.

export type Kind = 'expense' | 'income'
export type AccountKind = 'checking' | 'savings' | 'cash' | 'credit'

export interface User { id: number; email: string; name: string; currency: string }
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

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Query = Record<string, string | number | undefined | null>

function withQuery(path: string, query?: Query) {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const res = await fetch(withQuery(`/api${path}`, query), init)
  if (!res.ok) {
    let message = res.statusText
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') message = data.detail
      else if (Array.isArray(data.detail)) message = data.detail.map((d: { msg: string }) => d.msg).join('. ')
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  me: () => request<User>('GET', '/auth/me'),
  login: (email: string, password: string) => request<User>('POST', '/auth/login', { email, password }),
  register: (name: string, email: string, password: string, currency: string) =>
    request<User>('POST', '/auth/register', { name, email, password, currency }),
  logout: () => request<void>('POST', '/auth/logout'),
  updateMe: (data: Partial<Pick<User, 'name' | 'currency'>>) => request<User>('PATCH', '/auth/me', data),
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
}
