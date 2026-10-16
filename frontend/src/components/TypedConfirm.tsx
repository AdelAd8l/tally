import { useMutation } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { t } from '../lib/i18n'
import Modal from './Modal'

/**
 * "Are you really sure?" for actions that wipe a lot: the person has to type a word before the red button works.
 * `emptyText` replaces the whole question when there is nothing to do (the dialog just offers Close).
 */
export default function TypedConfirm({
  open,
  onClose,
  title,
  body,
  word,
  goLabel,
  extra,
  emptyText,
  ready = true,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  body: string
  /** The word to type, e.g. "DELETE". Compared without caring about capital letters. */
  word: string
  goLabel: string
  /** Shown under the text, e.g. a "download a backup first" link. */
  extra?: ReactNode
  emptyText?: string
  /** False while the numbers in `body` are still loading. */
  ready?: boolean
  onConfirm: () => Promise<unknown>
}) {
  const [typed, setTyped] = useState('')

  const run = useMutation({
    mutationFn: onConfirm,
    onSuccess: () => close(),
  })

  function close() {
    setTyped('')
    run.reset()
    onClose()
  }

  const matches = typed.trim().toLowerCase() === word.toLowerCase()

  return (
    <Modal title={title} open={open} onClose={close} width={480}>
      {emptyText ? (
        <div className="stack">
          <p>{emptyText}</p>
          <footer className="modal-actions">
            <span className="spacer" />
            <button className="btn btn-primary" onClick={close}>
              {t('common.close')}
            </button>
          </footer>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault()
            if (matches && ready && !run.isPending) run.mutate()
          }}
        >
          <p>{body}</p>
          {extra}
          <label className="field">
            <span>{t('txs.deleteAllType', { word })}</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          {run.error && <p className="form-error">{run.error.message}</p>}
          <footer className="modal-actions">
            <span className="spacer" />
            <button type="button" className="btn" onClick={close}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger-solid" disabled={!matches || !ready || run.isPending}>
              {run.isPending ? t('txs.deleting') : goLabel}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  )
}
