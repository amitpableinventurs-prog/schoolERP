import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { myWings, useAuth, WING_LABEL } from '../../lib/auth.jsx'
import MonthCalendar, { EVENT_TYPES, thisMonth } from '../../components/MonthCalendar.jsx'
import { Async, BatchSelect, Confirm, Field, Modal, PageHead, useAction, useApi } from '../../components/ui.jsx'

function EventForm({ event, defaultDate, onClose, onSaved }) {
  const { user } = useAuth()
  const wings = myWings(user)
  const [form, setForm] = useState(() => event
    ? { title: event.title, type: event.type, start: event.start, end: event.end && event.end !== event.start ? event.end : '', audience: event.audience || 'all', wing: event.wing || '', batch: event.batch?._id || '', description: event.description || '' }
    : { title: '', type: 'holiday', start: defaultDate, end: '', audience: 'all', wing: user.wings ? wings[0] : '', batch: '', description: '' })
  const [run, busy] = useAction()
  const [deleting, setDeleting] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, end: form.end || null, wing: form.batch ? null : form.wing || null, batch: form.batch || null }
    if (await run(() => (event ? api.put(`/calendar/${event._id}`, body) : api.post('/calendar', body)), 'Saved to the calendar.')) onSaved()
  }
  const remove = async () => { if (await run(() => api.del(`/calendar/${event._id}`), 'Removed from the calendar.')) onSaved() }
  return (
    <Modal title={event ? 'Edit calendar entry' : 'Add to calendar'} onClose={onClose} footer={<>
      {event && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => setDeleting(true)}><Trash2 size={14} /> Delete</button>}
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" form="event-form" disabled={busy}>Save</button>
    </>}>
      <form id="event-form" className="form-grid" onSubmit={submit}>
        <Field label="Title *" full><input className="input" value={form.title} onChange={set('title')} required placeholder="e.g. Diwali vacation, Annual sports day, PTM" /></Field>
        <Field label="Type"><select className="select" value={form.type} onChange={set('type')}>{Object.entries(EVENT_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select></Field>
        <Field label="Shown to"><select className="select" value={form.audience} onChange={set('audience')}><option value="all">Everyone</option><option value="students">Students &amp; parents</option><option value="parents">Parents only</option><option value="staff">Staff only</option></select></Field>
        <Field label="From *"><input className="input" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value, end: form.end && form.end < e.target.value ? '' : form.end })} required /></Field>
        <Field label="To (for more than one day)"><input className="input" type="date" value={form.end} min={form.start} onChange={set('end')} /></Field>
        <Field label="Wing" hint={form.batch ? 'Follows the batch' : user.wings ? undefined : 'Empty = whole institute'}>
          <select className="select" value={form.batch ? '' : form.wing} onChange={set('wing')} disabled={Boolean(form.batch)}>
            {!user.wings && <option value="">Whole institute</option>}
            {wings.map((w) => <option key={w} value={w}>{WING_LABEL[w]}</option>)}
          </select>
        </Field>
        <Field label="Only one batch (optional)"><BatchSelect value={form.batch} onChange={(v) => setForm({ ...form, batch: v })} allLabel="All batches" /></Field>
        <Field label="Details" full><textarea className="textarea" value={form.description} onChange={set('description')} style={{ minHeight: 70 }} placeholder="Timings, venue, what to bring…" /></Field>
      </form>
      {deleting && <Confirm text={`Delete "${event.title}" from the calendar?`} busy={busy} onClose={() => setDeleting(false)} onConfirm={remove} />}
    </Modal>
  )
}

// Academic calendar: holidays, events, PTMs. Exam papers appear from the date sheets.
export default function CalendarPage() {
  const [month, setMonth] = useState(thisMonth)
  const state = useApi(`/calendar/feed?month=${month}`)
  const [editing, setEditing] = useState(null)
  const navigate = useNavigate()
  const open = (item) => (item.source === 'exam' ? navigate('/exams/schedule') : setEditing({ event: item }))
  return (
    <>
      <PageHead title="Academic calendar" subtitle="Holidays, events and parent-teacher meetings. Students and parents see them in their app at once; exam papers come from the date sheets.">
        <button className="btn btn-primary" onClick={() => setEditing({ date: `${month}-01` })}><Plus size={16} /> Add to calendar</button>
      </PageHead>
      <Async state={state}>{(d) => <MonthCalendar month={month} items={d.items} onMonthChange={setMonth} onItemClick={open} onDayClick={(date) => setEditing({ date })} />}</Async>
      {editing && <EventForm event={editing.event} defaultDate={editing.date} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload() }} />}
    </>
  )
}
