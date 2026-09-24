export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--accent)" />
        <g stroke="var(--accent-ink)" strokeWidth="2.4" strokeLinecap="round">
          <path d="M9 8v16M13.5 8v16M18 8v16M22.5 8v16" />
          <path d="M6.5 21.5 25 10.5" />
        </g>
      </svg>
      <span>Tally</span>
    </span>
  )
}
