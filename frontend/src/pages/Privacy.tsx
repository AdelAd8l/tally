import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import Logo from '../components/Logo'
import { setLang, t, useLang } from '../lib/i18n'
import { LanguageSwitch } from './Settings'

// Public: readable without an account (Google links to it from its sign-in screen).
const TEXT = {
  "en": {
    "title": "Privacy policy",
    "updated": "Last updated: 25 September 2026",
    "intro": "Tally is a personal money tracker run by an individual developer. This page explains what it stores, why, and how to delete it.",
    "sections": [
      [
        "What we store",
        [
          "Your account: name, email address, and either a password (stored only as a one-way hash) or the ID of the Google account you sign in with.",
          "What you add: accounts, transactions, categories, budgets, and your settings (currency, notifications, language, time zone).",
          "If you turn on notifications: the address your browser gives us to deliver them to that device."
        ]
      ],
      [
        "How it's used",
        [
          "Only to run the app for you: show your data, send the reminders you ask for, and keep your devices in sync.",
          "We do not sell or share your data, show ads, or use analytics or tracking services."
        ]
      ],
      [
        "Google",
        [
          "Sign in with Google: we receive your name, email address and Google account ID, only to sign you in. Tally does not ask for access to anything else in your Google account.",
          "Tally's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements."
        ]
      ],
      [
        "Where it's kept",
        [
          "On our own server, reached only over HTTPS, with nightly backups kept for 30 days. The app also keeps a copy of your data on your device so it works offline.",
          "One cookie keeps you signed in. There are no other cookies."
        ]
      ],
      [
        "Your choices",
        [
          "Settings → Delete account removes your account and everything in it from the server (backups roll off within 30 days).",
          "You can turn off notifications or disconnect Google at any time, and remove the app's access to your Google account at myaccount.google.com/permissions."
        ]
      ]
    ],
    "contact": "Questions or requests:"
  },
  "ar": {
    "title": "سياسة الخصوصية",
    "updated": "آخر تحديث: 25 سبتمبر 2026",
    "intro": "Tally هو متتبع شخصي للمال يديره مطوّر فرد. توضح هذه الصفحة ما يُحفظ ولماذا وكيف تحذفه.",
    "sections": [
      [
        "ما نحفظه",
        [
          "حسابك: الاسم والبريد الإلكتروني، وإما كلمة مرور (تُحفظ فقط بتشفير أحادي الاتجاه) أو معرّف حساب Google الذي تدخل به.",
          "ما تضيفه: الحسابات والمعاملات والفئات والميزانيات، وإعداداتك (العملة والإشعارات واللغة والمنطقة الزمنية).",
          "إذا فعّلت الإشعارات: العنوان الذي يعطيه متصفحك لتوصيلها إلى ذلك الجهاز."
        ]
      ],
      [
        "كيف يُستخدم",
        [
          "فقط لتشغيل التطبيق لك: عرض بياناتك، وإرسال التذكيرات التي تطلبها، ومزامنة أجهزتك.",
          "لا نبيع بياناتك ولا نشاركها، ولا نعرض إعلانات، ولا نستخدم أدوات تحليل أو تتبع."
        ]
      ],
      [
        "Google",
        [
          "الدخول عبر Google: نستلم اسمك وبريدك الإلكتروني ومعرّف حسابك في Google، فقط لتسجيل دخولك. لا يطلب Tally الوصول إلى أي شيء آخر في حسابك على Google.",
          "استخدام Tally للمعلومات التي يتلقاها من واجهات Google البرمجية ونقلها يلتزم بسياسة بيانات المستخدم لخدمات Google API، بما في ذلك متطلبات الاستخدام المحدود."
        ]
      ],
      [
        "أين تُحفظ",
        [
          "على خادمنا الخاص، ولا يُوصل إليه إلا عبر HTTPS، مع نسخ احتياطية ليلية تُحفظ 30 يوماً. يحتفظ التطبيق أيضاً بنسخة من بياناتك على جهازك ليعمل دون اتصال.",
          "ملف تعريف ارتباط (كوكي) واحد يُبقيك مسجلاً الدخول. لا توجد أي ملفات أخرى."
        ]
      ],
      [
        "اختياراتك",
        [
          "الإعدادات ← حذف الحساب يحذف حسابك وكل ما فيه من الخادم (وتُحذف النسخ الاحتياطية خلال 30 يوماً).",
          "يمكنك إيقاف الإشعارات أو إلغاء ربط Google في أي وقت، وإزالة وصول التطبيق إلى حسابك على Google من myaccount.google.com/permissions."
        ]
      ]
    ],
    "contact": "للأسئلة أو الطلبات:"
  }
} as const

export default function Privacy() {
  const lang = useLang()
  const text = TEXT[lang]
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health').then((r) => r.json() as Promise<{ contact?: string }>),
    staleTime: 0,
  })
  const contact = health.data?.contact

  return (
    <div className="privacy">
      <header className="privacy-top">
        <Link to="/" aria-label="Tally">
          <Logo size={24} />
        </Link>
        <LanguageSwitch value={lang} onChange={setLang} />
      </header>
      <article className="privacy-body">
        <h1>{text.title}</h1>
        <p className="faint">{text.updated}</p>
        <p className="privacy-intro">{text.intro}</p>
        {text.sections.map(([heading, items]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        {contact && (
          <p className="privacy-contact">
            {text.contact}{' '}
            <a href={`mailto:${contact}`} dir="ltr">
              {contact}
            </a>
          </p>
        )}
        <p>
          <Link to="/">{t('privacy.back')}</Link>
        </p>
      </article>
    </div>
  )
}
