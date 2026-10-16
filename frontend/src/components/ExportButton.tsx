import { useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { api } from '../lib/api'
import { ask } from '../lib/confirm'
import { exportFromDevice, saveCsv } from '../lib/csv'
import { t } from '../lib/i18n'

/** The CSV download. With no connection it builds the file from what this device has saved. */
export default function ExportButton({
  start,
  end,
  className = 'btn',
  children,
}: {
  start?: string
  end?: string
  className?: string
  children: ReactNode
}) {
  const qc = useQueryClient()

  async function offline() {
    const { csv, count, complete } = exportFromDevice(qc, start, end)
    if (count === 0) {
      await ask({ title: t('export.partialTitle'), body: t('export.noneBody'), confirm: t('common.close'), danger: false })
      return
    }
    if (!complete) {
      const yes = await ask({
        title: t('export.partialTitle'),
        body: t('export.partialBody', { n: count }),
        confirm: t('export.go'),
        danger: false,
      })
      if (!yes) return
    }
    saveCsv(csv)
  }

  return (
    <a
      className={className}
      href={api.exportUrl({ start, end })}
      download
      onClick={(e) => {
        if (navigator.onLine) return
        e.preventDefault()
        void offline()
      }}
    >
      {children}
    </a>
  )
}
