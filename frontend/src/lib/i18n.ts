// English / Arabic strings and the current language.
//
// The language lives outside React (in this module) so plain helpers like formatters can
// read it too. App re-mounts its tree when it changes, so every component re-renders.

import { useSyncExternalStore } from 'react'

export type Lang = 'en' | 'ar'

const en = {
  // navigation & shell
  'nav.overview': 'Overview',
  'nav.transactions': 'Transactions',
  'nav.budgets': 'Budgets',
  'nav.accounts': 'Accounts',
  'nav.categories': 'Categories',
  'nav.settings': 'Settings',
  'nav.main': 'Main',
  'shell.new': 'New transaction',
  'shell.signOut': 'Sign out',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.remove': 'Remove',
  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.name': 'Name',
  'common.email': 'Email',
  'common.password': 'Password',
  'common.category': 'Category',
  'common.account': 'Account',
  'common.date': 'Date',
  'common.note': 'Note',
  'common.type': 'Type',
  'common.currency': 'Currency',
  'common.language': 'Language',
  'common.expense': 'Expense',
  'common.income': 'Income',
  'common.uncategorized': 'Uncategorized',
  'common.total': 'Total',
  'common.search': 'Search',

  // month picker & dates
  'month.prev': 'Previous month',
  'month.next': 'Next month',
  'month.this': 'This month',
  'date.today': 'Today',
  'date.yesterday': 'Yesterday',

  // overview
  'overview.hello': 'Hello, {name}',
  'overview.summary': 'Summary',
  'overview.spent': 'Spent',
  'overview.earned': 'Earned',
  'overview.saved': 'Saved',
  'overview.netWorth': 'Net worth',
  'overview.ofIncome': '{pct}% of income',
  'overview.allAccounts': 'Across all accounts',
  'overview.same': 'Same as {month}',
  'overview.more': '{pct}% more than {month}',
  'overview.less': '{pct}% less than {month}',
  'overview.emptyTitle': 'Nothing recorded in {month}',
  'overview.emptyBody': 'Add your first expense or income and this page fills in.',
  'overview.addFirst': 'Add a transaction',
  'overview.importCsv': 'Import a CSV',
  'overview.sixMonths': 'Last six months',
  'overview.whereItWent': 'Where it went',
  'overview.noSpending': 'No spending this month.',
  'overview.manage': 'Manage',
  'overview.noBudgets': 'No budgets yet.',
  'overview.setOne': 'Set one',
  'overview.noBudgetsTail': 'to keep a category in check.',
  'overview.recent': 'Recent',
  'overview.allTransactions': 'All transactions',
  'overview.nothingYet': 'Nothing here yet.',
  'chart.in': 'In',
  'chart.out': 'Out',
  'chart.label': 'Income and spending by month',

  // transaction form
  'tx.new': 'New transaction',
  'tx.edit': 'Edit transaction',
  'tx.amount': 'Amount',
  'tx.notePlaceholderExpense': 'What was it for?',
  'tx.notePlaceholderIncome': 'Where did it come from?',
  'tx.amountError': 'Enter an amount greater than zero, like 12.50',
  'tx.confirmDelete': 'Delete this transaction?',
  'tx.saving': 'Saving…',
  'tx.saveChanges': 'Save changes',
  'tx.add': 'Add transaction',

  // transactions page
  'txs.searchPlaceholder': 'Search notes and categories',
  'txs.all': 'All',
  'txs.spending': 'Spending',
  'txs.income': 'Income',
  'txs.allCategories': 'All categories',
  'txs.allAccounts': 'All accounts',
  'txs.import': 'Import',
  'txs.export': 'Export',
  'txs.count': '{n} transactions',
  'txs.count1': '1 transaction',
  'txs.in': 'In',
  'txs.out': 'Out',
  'txs.clear': 'Clear filters',
  'txs.noMatches': 'No matches',
  'txs.emptyTitle': 'No transactions in {month}',
  'txs.tryDifferent': 'Try a different search or filter.',
  'txs.emptyBody': 'Add one by hand, or import a CSV from your bank.',
  'txs.addOne': 'Add a transaction',
  'txs.importCsv': 'Import CSV',
  'txs.loading': 'Loading…',
  'txs.loadMore': 'Load more',
  'import.title': 'Import from CSV',
  'import.done': 'Imported {n} transactions.',
  'import.newCategories': 'New categories: {list}.',
  'import.doneBtn': 'Done',
  'import.help':
    'Needs date (YYYY-MM-DD) and amount columns. category, note and kind are optional. Without kind, negative amounts are treated as spending.',
  'import.into': 'Into account',
  'import.choose': 'Choose a .csv file',
  'import.importing': 'Importing…',
  'import.go': 'Import',

  // budgets
  'budgets.add': 'Add budget',
  'budgets.budgeted': 'Budgeted',
  'budgets.spent': 'Spent',
  'budgets.left': 'Left to spend',
  'budgets.overBudget': 'Over budget',
  'budgets.categoriesN': '{n} categories',
  'budgets.pctOfBudget': '{pct}% of budget',
  'budgets.daysLeft': '{n} days left in {month}',
  'budgets.closed': 'Month closed',
  'budgets.emptyTitle': 'No budgets yet',
  'budgets.emptyBody':
    'Pick the categories you want to keep an eye on and give each a monthly limit. Budgets repeat every month.',
  'budgets.create': 'Create a budget',
  'budgets.of': 'of',
  'budgets.over': '{amount} over',
  'budgets.leftAmount': '{amount} left',
  'budgets.onPace': 'On pace for {amount}',
  'budgets.today': 'Today',
  'budgets.deleted': 'Deleted category',
  'budgets.new': 'New budget',
  'budgets.titleFor': '{name} budget',
  'budgets.limit': 'Monthly limit',
  'budgets.amountError': 'Enter a monthly amount, like 300',

  // accounts
  'accounts.add': 'Add account',
  'accounts.hint':
    'Balances are the opening balance plus every income minus every expense recorded against the account.',
  'accounts.new': 'New account',
  'accounts.edit': 'Edit account',
  'accounts.opening': 'Opening balance',
  'accounts.openingError': 'Opening balance must be a number',
  'accounts.confirmDelete': 'Delete {name}?',
  'accounts.kind.checking': 'Checking',
  'accounts.kind.savings': 'Savings',
  'accounts.kind.cash': 'Cash',
  'accounts.kind.credit': 'Credit card',

  // categories
  'categories.spending': 'Spending',
  'categories.income': 'Income',
  'categories.new': 'New category',
  'categories.edit': 'Edit category',
  'categories.color': 'Color',
  'categories.confirmDelete': 'Delete "{name}"? Its transactions will become Uncategorized.',

  // settings
  'settings.profile': 'Profile',
  'settings.profileHint': 'How Tally greets you and formats money.',
  'settings.saveProfile': 'Save profile',
  'settings.saved': 'Saved',
  'settings.password': 'Password',
  'settings.passwordHint': 'At least 8 characters.',
  'settings.current': 'Current password',
  'settings.newPassword': 'New password',
  'settings.changePassword': 'Change password',
  'settings.passwordChanged': 'Password changed',
  'settings.delete': 'Delete account',
  'settings.deleteHint': "Removes your account and every transaction. This can't be undone.",
  'settings.deleteBtn': 'Delete my account',
  'settings.confirmDelete': 'Delete your account and all of its data?',
  'settings.languageHint': 'Used on this device.',

  // auth
  'auth.signupTitle': 'Start keeping tally',
  'auth.loginTitle': 'Welcome back',
  'auth.signupLede': 'A quiet place to see where your money goes. Free, private, no bank login needed.',
  'auth.loginLede': 'Sign in to pick up where you left off.',
  'auth.wait': 'One moment…',
  'auth.create': 'Create account',
  'auth.signIn': 'Sign in',
  'auth.demo': 'Look around with the demo account',
  'auth.haveAccount': 'Already have an account?',
  'auth.newHere': 'New here?',
  'auth.createLink': 'Create an account',
  'auth.receiptMonth': 'September',
  'auth.receiptSpent': 'Spent',
  'auth.receiptSaved': 'Saved',
  'auth.quote': 'Every dollar, accounted for.',
}

export type Key = keyof typeof en

const ar: Record<Key, string> = {
  'nav.overview': 'نظرة عامة',
  'nav.transactions': 'المعاملات',
  'nav.budgets': 'الميزانيات',
  'nav.accounts': 'الحسابات',
  'nav.categories': 'الفئات',
  'nav.settings': 'الإعدادات',
  'nav.main': 'القائمة الرئيسية',
  'shell.new': 'معاملة جديدة',
  'shell.signOut': 'تسجيل الخروج',
  'common.close': 'إغلاق',
  'common.cancel': 'إلغاء',
  'common.save': 'حفظ',
  'common.delete': 'حذف',
  'common.remove': 'إزالة',
  'common.add': 'إضافة',
  'common.edit': 'تعديل',
  'common.name': 'الاسم',
  'common.email': 'البريد الإلكتروني',
  'common.password': 'كلمة المرور',
  'common.category': 'الفئة',
  'common.account': 'الحساب',
  'common.date': 'التاريخ',
  'common.note': 'ملاحظة',
  'common.type': 'النوع',
  'common.currency': 'العملة',
  'common.language': 'اللغة',
  'common.expense': 'مصروف',
  'common.income': 'دخل',
  'common.uncategorized': 'بدون فئة',
  'common.total': 'الإجمالي',
  'common.search': 'بحث',

  'month.prev': 'الشهر السابق',
  'month.next': 'الشهر التالي',
  'month.this': 'هذا الشهر',
  'date.today': 'اليوم',
  'date.yesterday': 'أمس',

  'overview.hello': 'أهلاً، {name}',
  'overview.summary': 'الملخص',
  'overview.spent': 'المصروف',
  'overview.earned': 'الدخل',
  'overview.saved': 'الادخار',
  'overview.netWorth': 'صافي الثروة',
  'overview.ofIncome': '{pct}٪ من الدخل',
  'overview.allAccounts': 'في كل الحسابات',
  'overview.same': 'مثل {month}',
  'overview.more': 'أكثر بـ {pct}٪ من {month}',
  'overview.less': 'أقل بـ {pct}٪ من {month}',
  'overview.emptyTitle': 'لا شيء مسجّل في {month}',
  'overview.emptyBody': 'أضف أول مصروف أو دخل وستمتلئ هذه الصفحة.',
  'overview.addFirst': 'إضافة معاملة',
  'overview.importCsv': 'استيراد ملف CSV',
  'overview.sixMonths': 'آخر ستة أشهر',
  'overview.whereItWent': 'أين ذهبت أموالك',
  'overview.noSpending': 'لا مصروفات هذا الشهر.',
  'overview.manage': 'إدارة',
  'overview.noBudgets': 'لا توجد ميزانيات بعد.',
  'overview.setOne': 'أنشئ واحدة',
  'overview.noBudgetsTail': 'لتبقي فئة تحت السيطرة.',
  'overview.recent': 'الأحدث',
  'overview.allTransactions': 'كل المعاملات',
  'overview.nothingYet': 'لا شيء هنا بعد.',
  'chart.in': 'داخل',
  'chart.out': 'خارج',
  'chart.label': 'الدخل والمصروفات حسب الشهر',

  'tx.new': 'معاملة جديدة',
  'tx.edit': 'تعديل المعاملة',
  'tx.amount': 'المبلغ',
  'tx.notePlaceholderExpense': 'على ماذا صرفت؟',
  'tx.notePlaceholderIncome': 'من أين جاء؟',
  'tx.amountError': 'أدخل مبلغاً أكبر من صفر، مثل 12.50',
  'tx.confirmDelete': 'حذف هذه المعاملة؟',
  'tx.saving': 'جارٍ الحفظ…',
  'tx.saveChanges': 'حفظ التغييرات',
  'tx.add': 'إضافة المعاملة',

  'txs.searchPlaceholder': 'ابحث في الملاحظات والفئات',
  'txs.all': 'الكل',
  'txs.spending': 'المصروفات',
  'txs.income': 'الدخل',
  'txs.allCategories': 'كل الفئات',
  'txs.allAccounts': 'كل الحسابات',
  'txs.import': 'استيراد',
  'txs.export': 'تصدير',
  'txs.count': 'عدد المعاملات: {n}',
  'txs.count1': 'معاملة واحدة',
  'txs.in': 'داخل',
  'txs.out': 'خارج',
  'txs.clear': 'مسح الفلاتر',
  'txs.noMatches': 'لا نتائج',
  'txs.emptyTitle': 'لا معاملات في {month}',
  'txs.tryDifferent': 'جرّب بحثاً أو فلتراً مختلفاً.',
  'txs.emptyBody': 'أضف معاملة يدوياً، أو استورد ملف CSV من البنك.',
  'txs.addOne': 'إضافة معاملة',
  'txs.importCsv': 'استيراد CSV',
  'txs.loading': 'جارٍ التحميل…',
  'txs.loadMore': 'عرض المزيد',
  'import.title': 'استيراد من ملف CSV',
  'import.done': 'تم استيراد {n} معاملة.',
  'import.newCategories': 'فئات جديدة: {list}.',
  'import.doneBtn': 'تم',
  'import.help':
    'يحتاج الملف إلى عمودي date (بصيغة YYYY-MM-DD) و amount. الأعمدة category و note و kind اختيارية. بدون kind تُعتبر المبالغ السالبة مصروفات.',
  'import.into': 'إلى الحساب',
  'import.choose': 'اختر ملف ‎.csv',
  'import.importing': 'جارٍ الاستيراد…',
  'import.go': 'استيراد',

  'budgets.add': 'إضافة ميزانية',
  'budgets.budgeted': 'المخصص',
  'budgets.spent': 'المصروف',
  'budgets.left': 'المتبقي للصرف',
  'budgets.overBudget': 'تجاوز الميزانية',
  'budgets.categoriesN': 'عدد الفئات: {n}',
  'budgets.pctOfBudget': '{pct}٪ من الميزانية',
  'budgets.daysLeft': 'متبقٍ {n} يوم في {month}',
  'budgets.closed': 'انتهى الشهر',
  'budgets.emptyTitle': 'لا توجد ميزانيات بعد',
  'budgets.emptyBody': 'اختر الفئات التي تريد متابعتها وحدد لكل منها حداً شهرياً. تتكرر الميزانيات كل شهر.',
  'budgets.create': 'إنشاء ميزانية',
  'budgets.of': 'من',
  'budgets.over': 'تجاوز بـ {amount}',
  'budgets.leftAmount': 'متبقٍ {amount}',
  'budgets.onPace': 'بهذا المعدل: {amount}',
  'budgets.today': 'اليوم',
  'budgets.deleted': 'فئة محذوفة',
  'budgets.new': 'ميزانية جديدة',
  'budgets.titleFor': 'ميزانية {name}',
  'budgets.limit': 'الحد الشهري',
  'budgets.amountError': 'أدخل مبلغاً شهرياً، مثل 300',

  'accounts.add': 'إضافة حساب',
  'accounts.hint': 'الرصيد = الرصيد الافتتاحي + كل الدخل − كل المصروفات المسجلة على الحساب.',
  'accounts.new': 'حساب جديد',
  'accounts.edit': 'تعديل الحساب',
  'accounts.opening': 'الرصيد الافتتاحي',
  'accounts.openingError': 'الرصيد الافتتاحي يجب أن يكون رقماً',
  'accounts.confirmDelete': 'حذف {name}؟',
  'accounts.kind.checking': 'حساب جارٍ',
  'accounts.kind.savings': 'توفير',
  'accounts.kind.cash': 'نقدي',
  'accounts.kind.credit': 'بطاقة ائتمان',

  'categories.spending': 'المصروفات',
  'categories.income': 'الدخل',
  'categories.new': 'فئة جديدة',
  'categories.edit': 'تعديل الفئة',
  'categories.color': 'اللون',
  'categories.confirmDelete': 'حذف «{name}»؟ ستصبح معاملاتها بدون فئة.',

  'settings.profile': 'الملف الشخصي',
  'settings.profileHint': 'كيف يرحب بك Tally وكيف يعرض المبالغ.',
  'settings.saveProfile': 'حفظ الملف الشخصي',
  'settings.saved': 'تم الحفظ',
  'settings.password': 'كلمة المرور',
  'settings.passwordHint': '8 أحرف على الأقل.',
  'settings.current': 'كلمة المرور الحالية',
  'settings.newPassword': 'كلمة المرور الجديدة',
  'settings.changePassword': 'تغيير كلمة المرور',
  'settings.passwordChanged': 'تم تغيير كلمة المرور',
  'settings.delete': 'حذف الحساب',
  'settings.deleteHint': 'يحذف حسابك وكل معاملاتك. لا يمكن التراجع عن ذلك.',
  'settings.deleteBtn': 'حذف حسابي',
  'settings.confirmDelete': 'حذف حسابك وكل بياناته؟',
  'settings.languageHint': 'تُستخدم على هذا الجهاز.',

  'auth.signupTitle': 'ابدأ بتدوين مصروفاتك',
  'auth.loginTitle': 'مرحباً بعودتك',
  'auth.signupLede': 'مكان هادئ لترى أين تذهب أموالك. مجاني وخاص ولا يحتاج إلى ربط حسابك البنكي.',
  'auth.loginLede': 'سجّل الدخول لتكمل من حيث توقفت.',
  'auth.wait': 'لحظة…',
  'auth.create': 'إنشاء حساب',
  'auth.signIn': 'تسجيل الدخول',
  'auth.demo': 'تجوّل بالحساب التجريبي',
  'auth.haveAccount': 'لديك حساب بالفعل؟',
  'auth.newHere': 'جديد هنا؟',
  'auth.createLink': 'أنشئ حساباً',
  'auth.receiptMonth': 'سبتمبر',
  'auth.receiptSpent': 'المصروف',
  'auth.receiptSaved': 'الادخار',
  'auth.quote': 'كل قرش في مكانه.',
}

// Server messages (from the API's `detail`) shown in forms.
const serverErrorsAr: Record<string, string> = {
  'Email or password is incorrect': 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  'An account with this email already exists': 'يوجد حساب بهذا البريد الإلكتروني بالفعل',
  'Sign-ups are closed on this server': 'التسجيل مغلق على هذا الخادم',
  'Current password is incorrect': 'كلمة المرور الحالية غير صحيحة',
  'This account has transactions. Move or delete them first.':
    'هذا الحساب عليه معاملات. انقلها أو احذفها أولاً.',
  'You need at least one account.': 'تحتاج إلى حساب واحد على الأقل.',
  'A category with this name already exists': 'توجد فئة بهذا الاسم بالفعل',
  "Can't change the type of a category that has transactions": 'لا يمكن تغيير نوع فئة عليها معاملات',
  'Budgets can only be set on expense categories': 'الميزانيات متاحة لفئات المصروفات فقط',
  'CSV needs at least \'date\' and \'amount\' columns': "يحتاج ملف CSV إلى عمودي 'date' و 'amount' على الأقل",
  'File is larger than 2 MB': 'حجم الملف أكبر من 2 ميجابايت',
  'File must be UTF-8 encoded CSV': 'يجب أن يكون الملف CSV بترميز UTF-8',
}

// The starter categories and accounts are created in English; show them in Arabic too.
// Only exact default names are translated, so anything the person renames stays as typed.
const defaultNamesAr: Record<string, string> = {
  Groceries: 'البقالة',
  Dining: 'المطاعم',
  Housing: 'السكن',
  Utilities: 'الفواتير',
  Transport: 'المواصلات',
  Health: 'الصحة',
  Shopping: 'التسوق',
  Entertainment: 'الترفيه',
  Education: 'التعليم',
  Other: 'أخرى',
  Salary: 'الراتب',
  Freelance: 'عمل حر',
  'Other income': 'دخل آخر',
  'Main account': 'الحساب الرئيسي',
  Checking: 'الحساب الجاري',
  Savings: 'التوفير',
  'Credit card': 'بطاقة الائتمان',
  Uncategorized: 'بدون فئة',
  // sign-in page receipt
  Rent: 'الإيجار',
  'Dining out': 'المطاعم',
}

// ---- state ------------------------------------------------------------------------

const STORAGE_KEY = 'tally.lang'
const listeners = new Set<() => void>()

function detect(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'ar') return saved
  } catch {
    /* storage unavailable */
  }
  return (navigator.languages ?? [navigator.language]).some((l) => l.toLowerCase().startsWith('ar')) ? 'ar' : 'en'
}

let current: Lang = detect()
applyToDocument(current)

function applyToDocument(lang: Lang) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang) {
  if (lang === current) return
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* storage unavailable */
  }
  applyToDocument(lang)
  listeners.forEach((fn) => fn())
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getLang,
  )
}

/** Locale for Intl. Arabic keeps Western digits so amounts line up with the monospace figures. */
export function locale(): string {
  return current === 'ar' ? 'ar-u-nu-latn' : 'en'
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  let text = (current === 'ar' ? ar : en)[key]
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

export function serverError(message: string): string {
  return current === 'ar' ? (serverErrorsAr[message] ?? message) : message
}

/** Display name for a category or account, translating untouched starter names. */
export function displayName(name: string): string {
  return current === 'ar' ? (defaultNamesAr[name] ?? name) : name
}
