// Muted, print-like category colors that sit well on the paper background in both themes.
export const PALETTE = [
  '#5B8C5A', '#3F7D5C', '#4A9A9A', '#5A7FA8', '#4F6D8F', '#8A6FA0',
  '#A0525B', '#C0784A', '#B89B4A', '#6B7B4A', '#7A8B99', '#8A8F98',
]

/** "#3e5c8a", "3E5C8A" or "#f80" -> "#3E5C8A" / "#FF8800"; anything else -> null. */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(s)) return `#${[...s].map((c) => c + c).join('')}`.toUpperCase()
  if (/^[0-9a-f]{6}$/i.test(s)) return `#${s}`.toUpperCase()
  return null
}
