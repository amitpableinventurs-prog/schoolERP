import { X } from 'lucide-react'
import { DAYS } from '../lib/format.js'

export default function TimetableGrid({ slots, onDelete, showBatch }) {
  const today = ((new Date().getDay() + 6) % 7) + 1
  return (
    <div className="tt">
      {[1, 2, 3, 4, 5, 6].map((day) => {
        const list = slots.filter((s) => s.day === day)
        return (
          <div className="tt-day" key={day}>
            <h3 style={day === today ? { color: 'var(--accent-strong)' } : undefined}>{DAYS[day]}{day === today && ' · today'}</h3>
            {list.length ? list.map((s) => (
              <div className="tt-slot" key={s._id}>
                <div className="time">{s.start} – {s.end}</div>
                <div style={{ fontWeight: 600 }}>{s.subject}</div>
                <div className="small muted">{[showBatch && s.batch?.name, s.teacher?.name, s.room].filter(Boolean).join(' · ')}</div>
                {onDelete && <button className="btn btn-ghost btn-sm btn-icon del" onClick={() => onDelete(s)} aria-label="Remove period"><X size={13} /></button>}
              </div>
            )) : <div className="small muted">No classes</div>}
          </div>
        )
      })}
    </div>
  )
}
