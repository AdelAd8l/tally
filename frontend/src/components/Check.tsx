/** The app's own checkbox: a real <input> underneath (keyboard, screen readers, forms) with a drawn box on top. */
export default function Check({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <span className="check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate && !checked
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="check-box" aria-hidden="true">
        <svg viewBox="0 0 16 16">
          <path className="tick" d="M3.5 8.5l3 3 6-7" />
          <path className="dash" d="M4.5 8h7" />
        </svg>
      </span>
    </span>
  )
}
