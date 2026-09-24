import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import Modal from '../components/Modal'
import PageHeader from '../components/PageHeader'
import { api, type Category, type Kind } from '../lib/api'
import { useCategories, useRefreshMoney } from '../lib/hooks'

// Muted, print-like colors that sit well on the paper background in both themes.
const PALETTE = [
  '#5B8C5A', '#3F7D5C', '#4A9A9A', '#5A7FA8', '#4F6D8F', '#8A6FA0',
  '#A0525B', '#C0784A', '#B89B4A', '#6B7B4A', '#7A8B99', '#8A8F98',
]

export default function Categories() {
  const { data: categories = [] } = useCategories()
  const [editing, setEditing] = useState<Category | { kind: Kind } | null>(null)

  return (
    <div className="page page-narrow">
      <PageHeader title="Categories" />
      <div className="columns-2">
        {(['expense', 'income'] as const).map((kind) => (
          <section key={kind} className="panel">
            <div className="panel-head">
              <h2>{kind === 'expense' ? 'Spending' : 'Income'}</h2>
              <button className="btn btn-quiet btn-sm" onClick={() => setEditing({ kind })}>
                Add
              </button>
            </div>
            <ul className="ledger">
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <li key={c.id}>
                    <button className="ledger-row" onClick={() => setEditing(c)}>
                      <span className="cat-name">
                        <span className="swatch" style={{ background: c.color }} />
                        {c.name}
                      </span>
                      <span className="faint">Edit</span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      <CategoryDialog
        editing={editing}
        defaultColor={PALETTE[categories.length % PALETTE.length]}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

interface DialogProps {
  editing: Category | { kind: Kind } | null
  defaultColor: string
  onClose: () => void
}

function CategoryDialog({ editing, defaultColor, onClose }: DialogProps) {
  const qc = useQueryClient()
  const refresh = useRefreshMoney()
  const existing = editing && 'id' in editing ? editing : null
  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[0])
  const [lastKey, setLastKey] = useState<string | null>(null)

  const key = editing === null ? null : existing ? `c${existing.id}` : `new-${editing.kind}`
  if (key !== lastKey) {
    setLastKey(key)
    setName(existing?.name ?? '')
    setColor(existing?.color ?? defaultColor)
  }

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['categories'] })
    await refresh()
    onClose()
  }
  const save = useMutation({
    mutationFn: () => api.saveCategory({ name, color, kind: editing!.kind }, existing?.id),
    onSuccess: done,
  })
  const remove = useMutation({ mutationFn: () => api.deleteCategory(existing!.id), onSuccess: done })

  return (
    <Modal
      title={existing ? 'Edit category' : 'New category'}
      open={editing !== null}
      onClose={() => {
        save.reset()
        onClose()
      }}
      width={400}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            required
          />
        </label>
        <fieldset className="field palette">
          <legend>Color</legend>
          <div className="palette-grid">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className="palette-chip"
                style={{ background: c }}
                aria-label={c}
                aria-pressed={color.toLowerCase() === c.toLowerCase()}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </fieldset>
        {save.error && <p className="form-error">{save.error.message}</p>}
        <footer className="modal-actions">
          {existing && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() =>
                confirm(`Delete "${existing.name}"? Its transactions will become Uncategorized.`) && remove.mutate()
              }
            >
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={save.isPending}>
            Save
          </button>
        </footer>
      </form>
    </Modal>
  )
}
