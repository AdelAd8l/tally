import { useLayoutEffect, useRef, useState } from 'react'

import type { MonthTotal } from '../lib/api'
import { mirror } from '../lib/chart'
import { compactNumber, money, monthName } from '../lib/format'
import { useUser } from '../lib/hooks'
import { t } from '../lib/i18n'

const H = 210
const PAD = { top: 12, right: 8, bottom: 28, left: 52 }

/** Paired monthly bars: income (outlined) next to spending (solid). Hand-drawn SVG, no chart library. */
export default function TrendChart({ data, selected }: { data: MonthTotal[]; selected: string }) {
  const { currency } = useUser()
  const [hover, setHover] = useState<number | null>(null)
  // Draw at the real pixel width so labels stay 11–12px instead of scaling with the SVG.
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]))
  const step = niceStep(max / 4)
  const top = Math.ceil(max / step) * step
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const slot = innerW / data.length
  const bar = Math.min(16, slot / 4.5)
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH
  const m = mirror(W) // Arabic: months run right to left, amounts on the right
  // Long month names (Arabic) on a narrow screen: label every other month, always the newest.
  const labelWidth = Math.max(...data.map((d) => monthName(d.month, 'short').length)) * 6.4 + 10
  const every = slot < labelWidth ? 2 : 1

  const active = hover ?? data.findIndex((d) => d.month === selected)
  const focus = data[active]

  return (
    <div className="trend" ref={box}>
      <div className="trend-readout">
        {focus && (
          <>
            <span className="faint">{monthName(focus.month)}</span>
            <span>
              <i className="key key-income" /> {t('chart.in')} <b className="num">{money(focus.income, currency, { whole: true })}</b>
            </span>
            <span>
              <i className="key key-expense" /> {t('chart.out')}{' '}
              <b className="num">{money(focus.expense, currency, { whole: true })}</b>
            </span>
          </>
        )}
      </div>
      <svg height={H} viewBox={`0 0 ${W} ${H}`} className="trend-svg" role="img" aria-label={t('chart.label')}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={m.x(PAD.left)} x2={m.x(W - PAD.right)} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'axis' : 'grid'} />
            <text x={m.x(PAD.left - 10)} y={y(tick)} dy="0.32em" textAnchor={m.anchor('end')} className="tick">
              {m.text(compactNumber(tick / 100))}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2
          return (
            <g
              key={d.month}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={i === active ? 'col is-active' : 'col'}
            >
              <rect x={m.box(PAD.left + slot * i, slot)} y={PAD.top} width={slot} height={innerH} className="hit" />
              <rect
                x={m.box(cx - bar - 2, bar - 1.5)}
                y={y(d.income) + 0.75}
                width={bar - 1.5}
                height={Math.max(0, innerH + PAD.top - y(d.income) - 0.75)}
                className="bar-income"
                rx="1.5"
              />
              <rect
                x={m.box(cx + 2, bar)}
                y={y(d.expense)}
                width={bar}
                height={Math.max(0, innerH + PAD.top - y(d.expense))}
                className="bar-expense"
                rx="1.5"
              />
              {(data.length - 1 - i) % every === 0 && (
                <text x={m.x(cx)} y={H - 8} textAnchor="middle" className="tick tick-x">
                  {m.text(monthName(d.month, 'short'))}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)))
  const norm = raw / mag
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
}
