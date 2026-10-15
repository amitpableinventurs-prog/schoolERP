import { useId, useMemo, useRef, useState } from 'react'

const W = 600
const PAD = { top: 12, right: 12, bottom: 26, left: 48 }

function niceMax(value) {
  if (value <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(value))
  const n = value / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow
}

// Path for a bar with 4px rounded top corners and a square base on the baseline.
function barPath(x, y, w, h) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

function useTip() {
  const ref = useRef(null)
  const [tip, setTip] = useState(null)
  const show = (index, svgX, svgY) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setTip({ index, left: (svgX / W) * box.width, top: (svgY / ref.current.dataset.h) * box.height })
  }
  return { ref, tip, show, hide: () => setTip(null) }
}

/** Single-series vertical bars. data: [{ label, value }] */
export function BarChart({ data, height = 220, format = String, axisFormat = format, title }) {
  const { ref, tip, show, hide } = useTip()
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const slot = innerW / Math.max(1, data.length)
  const barW = Math.min(44, slot * 0.6)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const y = (v) => PAD.top + innerH - (v / max) * innerH

  return (
    <div className="chart" ref={ref} data-h={height} onMouseLeave={hide}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{axisFormat(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2
          const h = Math.max(0, (d.value / max) * innerH)
          return (
            <g key={d.label}>
              {h > 0 && <path d={barPath(x, y(d.value), barW, h)} fill="var(--series-1)" opacity={tip && tip.index !== i ? 0.55 : 1} />}
              <text x={x + barW / 2} y={height - 8} textAnchor="middle">{d.label}</text>
              {/* Hit target covers the whole column, bigger than the bar. */}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => show(i, x + barW / 2, y(d.value))} onMouseMove={() => show(i, x + barW / 2, y(d.value))} />
            </g>
          )
        })}
        <line className="base-line" x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} />
      </svg>
      {tip && (
        <div className="chart-tip" style={{ left: tip.left, top: tip.top }}>
          <span>{data[tip.index].label}</span>
          <strong>{format(data[tip.index].value)}</strong>
        </div>
      )}
    </div>
  )
}

/** Single-series line with optional reference line. data: [{ label, value }] */
export function LineChart({ data, height = 220, min = 0, max: fixedMax, format = String, reference, referenceLabel, title }) {
  const { ref, tip, show, hide } = useTip()
  const max = fixedMax ?? niceMax(Math.max(...data.map((d) => d.value), 0))
  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const x = (i) => PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const y = (v) => PAD.top + innerH - ((v - min) / (max - min)) * innerH
  const ticks = useMemo(() => Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4), [min, max])
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ')
  const labelEvery = Math.ceil(data.length / 7)

  const onMove = (e) => {
    const box = ref.current.getBoundingClientRect()
    const svgX = ((e.clientX - box.left) / box.width) * W
    const i = Math.round(((svgX - PAD.left) / innerW) * (data.length - 1))
    const idx = Math.max(0, Math.min(data.length - 1, i))
    show(idx, x(idx), y(data[idx].value))
  }

  return (
    <div className="chart" ref={ref} data-h={height} onMouseLeave={hide}>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={title} onMouseMove={data.length ? onMove : undefined}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{format(t)}</text>
          </g>
        ))}
        {reference != null && (
          <g>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(reference)} y2={y(reference)} stroke="var(--text-3)" strokeDasharray="4 4" />
            <text x={W - PAD.right} y={y(reference) - 6} textAnchor="end">{referenceLabel}</text>
          </g>
        )}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1) && (
          <text key={d.label} x={x(i)} y={height - 8} textAnchor="middle">{d.label}</text>
        ))}
        {tip && (
          <g>
            <line x1={x(tip.index)} x2={x(tip.index)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--axis)" />
            <circle cx={x(tip.index)} cy={y(data[tip.index].value)} r="5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
        <line className="base-line" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH} y2={PAD.top + innerH} />
      </svg>
      {tip && (
        <div className="chart-tip" style={{ left: tip.left, top: tip.top }}>
          <span>{data[tip.index].label}</span>
          <strong>{format(data[tip.index].value)}</strong>
        </div>
      )}
    </div>
  )
}

/** Horizontal magnitude bars with the value printed beside each. items: [{ label, value }] */
export function HBarList({ items, format = String }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div>
      {items.map((item) => (
        <div className="hbar" key={item.label} title={`${item.label}: ${format(item.value)}`}>
          <span className="small text-2" style={{ textTransform: 'capitalize' }}>{item.label}</span>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(item.value / max) * 100}%` }} /></div>
          <span className="small mono right">{format(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Decorative area sparkline (smooth curve with a fading fill). values: number[] */
export function Sparkline({ values, color, height = 64, label }) {
  const id = useId()
  const pts = values.length > 1 ? values : [values[0] || 0, values[0] || 0]
  const w = 200
  const min = Math.min(...pts)
  const span = Math.max(...pts) - min
  // A flat series sits mid-height rather than on the floor.
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, span ? 6 + (1 - (v - min) / span) * (height - 12) : height / 2])
  // Catmull-Rom → cubic Bézier for a soft line.
  let d = `M${xy[0][0]},${xy[0][1]}`
  for (let i = 0; i < xy.length - 1; i++) {
    const [p0, p1, p2, p3] = [xy[i - 1] || xy[i], xy[i], xy[i + 1], xy[i + 2] || xy[i + 1]]
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`
  }
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  )
}
