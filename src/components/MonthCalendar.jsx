/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, X } from 'lucide-react'
import { fmtDate, today } from '../lib/format.js'

export const EVENT_TYPES = {
  holiday: { label: 'Holiday', tone: 'bad' },
  event: { label: 'Event', tone: 'info' },
  exam: { label: 'Exam', tone: 'ai' },
  ptm: { label: 'Parent-teacher meeting', tone: 'warn' },
  activity: { label: 'Activity', tone: 'good' },
  other: { label: 'Other', tone: '' },
}

const pad = (n) => String(n).padStart(2, '0')
export const thisMonth = () => today().slice(0, 7)
export function shiftMonth(month, by) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + by, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
const monthTitle = (month) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

// Items that touch a day (multi-day events cover every day from start to end).
const onDay = (items, date) => items.filter((i) => i.start <= date && (i.end || i.start) >= date)

// Short "coming up" list for home screens.
export function UpcomingList({ items }) {
  if (!items?.length) return <span className="muted">Nothing on the calendar in the next 30 days.</span>
  return items.map((x) => (
    <div key={x._id} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
      <span className={`agenda-date sm tone-${EVENT_TYPES[x.type]?.tone || ''}`}>
        <strong>{Number(x.start.slice(8))}</strong>
        <span>{new Date(`${x.start}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</span>
      </span>
      <div style={{ minWidth: 0 }}>
        <strong>{x.title}</strong>
        <div className="small muted">{[EVENT_TYPES[x.type]?.label, x.end && x.end !== x.start ? `till ${fmtDate(x.end)}` : null, x.time].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  ))
}

// Month grid (Mon–Sun) plus a day-by-day list underneath, which is what phones read.
export default function MonthCalendar({ month, items, onMonthChange, onItemClick, onDayClick }) {
  const [selectedDate, setSelectedDate] = useState(null)
  const [y, m] = month.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7 // Monday first
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)]
  while (cells.length % 7) cells.push(null)
  const now = today()
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start))
  const selectedDay = selectedDate?.slice(0, 7) === month ? selectedDate : null
  const agendaItems = selectedDay ? onDay(sorted, selectedDay) : sorted
  const changeMonth = (next) => {
    setSelectedDate(null)
    onMonthChange(next)
  }

  return (
    <div className="month-calendar-layout">
      <section className="card mcal-panel" aria-label={`${monthTitle(month)} calendar`}>
        <div className="mcal-toolbar">
          <div className="mcal-month">
            <span className="mcal-month-icon"><CalendarDays size={18} /></span>
            <div>
              <h2>{monthTitle(month)}</h2>
              <span className="small muted">{sorted.length} scheduled item{sorted.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <div className="mcal-controls">
            {month !== thisMonth() && <button className="btn btn-sm" onClick={() => changeMonth(thisMonth())}>Today</button>}
            <button className="btn btn-sm btn-ghost btn-icon" onClick={() => changeMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <button className="btn btn-sm btn-ghost btn-icon" onClick={() => changeMonth(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="mcal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="mcal-head">{d}</div>)}
          {cells.map((date, i) => {
            if (!date) return <div key={`x${i}`} className="mcal-cell empty" />
            const list = onDay(items, date)
            const holiday = list.some((x) => x.type === 'holiday')
            const sunday = (lead + Number(date.slice(8)) - 1) % 7 === 6
            return (
              <button key={date} type="button" className={`mcal-cell${date === now ? ' today' : ''}${holiday || sunday ? ' off' : ''}${selectedDay === date ? ' selected' : ''}`} onClick={() => {
                if (onDayClick) onDayClick(date)
                else setSelectedDate(selectedDay === date ? null : date)
              }} aria-pressed={!onDayClick && selectedDay === date} aria-label={`${fmtDate(date)}${list.length ? `, ${list.length} event${list.length === 1 ? '' : 's'}` : ''}`}>
                <span className="mcal-day">{Number(date.slice(8))}</span>
                <span className="mcal-chips">
                  {list.slice(0, 2).map((x) => <span key={x._id} className={`mcal-chip tone-${EVENT_TYPES[x.type]?.tone || ''}`} title={x.title}>{x.title}</span>)}
                  {list.length > 2 && <span className="mcal-more">+{list.length - 2} more</span>}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mcal-legend">
          {Object.entries(EVENT_TYPES).map(([k, t]) => <span key={k} className="mcal-legend-item"><span className={`mcal-dot tone-${t.tone}`} />{t.label}</span>)}
        </div>
      </section>

      <aside className="card mcal-agenda">
        <div className="mcal-agenda-head">
          <div>
            <span className="mcal-kicker">YOUR SCHEDULE</span>
            <h2>{selectedDay ? `Events on ${fmtDate(selectedDay)}` : 'Month at a glance'}</h2>
          </div>
          <div className="mcal-agenda-actions">
            {selectedDay && <button className="mcal-clear" onClick={() => setSelectedDate(null)} aria-label="Show entire month" title="Show entire month"><X size={15} /></button>}
            <span className="mcal-count">{agendaItems.length}</span>
          </div>
        </div>
        {agendaItems.length ? (
          <div className="agenda">
            {agendaItems.map((x) => {
              const date = new Date(`${x.start}T00:00:00`)
              const meta = [EVENT_TYPES[x.type]?.label, x.end && x.end !== x.start ? `Until ${fmtDate(x.end)}` : null, x.time, x.room && `Room ${x.room}`, x.batch?.name].filter(Boolean).join(' · ')
              return (
                <button key={x._id} type="button" className={`agenda-row${x.end && x.end < now ? ' past' : ''}`} onClick={() => onItemClick?.(x)} disabled={!onItemClick}>
                  <span className={`agenda-date tone-${EVENT_TYPES[x.type]?.tone || ''}`}>
                    <strong>{Number(x.start.slice(8))}</strong>
                    <span>{date.toLocaleDateString('en-IN', { month: 'short' })}</span>
                  </span>
                  <span className="agenda-copy">
                    <span className="cell-title">{x.title}</span>
                    <span className="cell-sub">{meta}</span>
                    {x.description && <span className="small text-2 pre agenda-description">{x.description}</span>}
                  </span>
                  {x.time && <Clock className="agenda-clock" size={14} />}
                  {x.room && <MapPin className="agenda-clock" size={14} />}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="mcal-empty">
            <CalendarDays size={22} />
            <strong>{selectedDay ? 'Nothing scheduled on this day' : 'No events this month'}</strong>
            <span>{selectedDay ? 'Choose another date to check what is coming up.' : 'When your school shares an update, it will appear here.'}</span>
          </div>
        )}
      </aside>
    </div>
  )
}
