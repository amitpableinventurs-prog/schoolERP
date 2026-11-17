import { X } from 'lucide-react'
import { DAYS } from '../lib/format.js'

// Week of periods. On a phone the days stack one under another; `todayFirst`
// starts the list with today (student / parent view).
export default function TimetableGrid({ slots, onDelete, showBatch, todayFirst }) {
  const today = ((new Date().getDay() + 6) % 7) + 1
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 6 || slots.some((s) => s.day === d))
  const order = todayFirst && days.includes(today) ? [...days.filter((d) => d >= today), ...days.filter((d) => d < today)] : days
  return (
    <div className={`tt${todayFirst ? ' tt-today-first' : ''}`} style={{ '--tt-days': days.length }}>
      {order.map((day) => {
        const list = slots.filter((s) => s.day === day).sort((a, b) => a.start.localeCompare(b.start))
        return (
          <div className={`tt-day${day === today ? ' is-today' : ''}`} key={day} style={{ order: day }}>
            <h3 style={day === today ? { color: 'var(--accent-strong)' } : undefined}>{DAYS[day]}{day === today && ' · today'}</h3>
            {list.length ? list.map((s) => (
              <div className="tt-slot" key={s._id}>
                <div className="time">{s.start} – {s.end}</div>
                <div style={{ fontWeight: 600 }}>{s.subject}</div>
                <div className="small muted">{[showBatch && s.batch?.name && `Class: ${s.batch.name}`, s.teacher?.name && `Teacher: ${s.teacher.name}`, s.room && `Room ${s.room}`].filter(Boolean).join(' · ')}</div>
                {onDelete && <button className="btn btn-ghost btn-sm btn-icon del" onClick={() => onDelete(s)} aria-label="Remove period"><X size={13} /></button>}
              </div>
            )) : <div className="small muted">No classes</div>}
          </div>
        )
      })}
    </div>
  )
}
