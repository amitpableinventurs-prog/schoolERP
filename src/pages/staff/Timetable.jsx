import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { isAdmin, useAuth } from '../../lib/auth.jsx'
import { DAYS } from '../../lib/format.js'
import TimetableGrid from '../../components/TimetableGrid.jsx'
import { Async, BatchSelect, Field, Modal, PageHead, Segmented, useAction, useApi, useBatches } from '../../components/ui.jsx'

function SlotForm({ batch, onClose, onSaved }) {
  const batches = useBatches()
  const staff = useApi('/staff?status=active')
  const subjects = batches.find((b) => b._id === batch)?.subjects || []
  const [form, setForm] = useState({ day: 1, start: '09:00', end: '09:45', subject: subjects[0] || '', teacher: '', room: '' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    if (await run(() => api.post('/timetable', { ...form, batch, day: Number(form.day) }), 'Period added.')) onSaved()
  }
  return (
    <Modal title="Add period" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="slot-form" disabled={busy}>Add</button></>}>
      <form id="slot-form" className="form-grid" onSubmit={submit}>
        <Field label="Day"><select className="select" value={form.day} onChange={set('day')}>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{DAYS[d]}</option>)}</select></Field>
        <Field label="Subject">
          <input className="input" list="subject-list" value={form.subject} onChange={set('subject')} required />
          <datalist id="subject-list">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Start"><input className="input" type="time" value={form.start} onChange={set('start')} required /></Field>
        <Field label="End"><input className="input" type="time" value={form.end} onChange={set('end')} required /></Field>
        <Field label="Teacher" hint="Clashes with the teacher's other classes are blocked">
          <select className="select" value={form.teacher} onChange={set('teacher')}>
            <option value="">—</option>
            {(staff.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}{s.subjects?.length ? ` (${s.subjects.slice(0, 2).join(', ')})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Room"><input className="input" value={form.room} onChange={set('room')} /></Field>
      </form>
    </Modal>
  )
}

export default function Timetable() {
  const batches = useBatches()
  const { user } = useAuth()
  const [view, setView] = useState('batch')
  const [picked, setBatch] = useState('')
  const [teacher, setTeacher] = useState('')
  const [adding, setAdding] = useState(false)
  const staff = useApi('/staff?status=active')
  const [run] = useAction()
  const batch = picked || batches[0]?._id || ''

  const url = view === 'batch' ? (batch ? `/timetable${qs({ batch })}` : null) : (teacher ? `/timetable${qs({ teacher })}` : null)
  const state = useApi(url, { skip: !url })
  const admin = isAdmin(user)

  return (
    <>
      <PageHead title="Timetable" subtitle="Weekly schedule per class/batch, or per teacher.">
        {admin && view === 'batch' && batch && <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add period</button>}
      </PageHead>
      <div className="filters">
        <Segmented value={view} onChange={setView} options={[{ value: 'batch', label: 'By batch' }, { value: 'teacher', label: 'By teacher' }]} />
        {view === 'batch' ? <BatchSelect value={batch} onChange={setBatch} allLabel="Select batch…" /> : (
          <select className="select" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
            <option value="">Select teacher…</option>
            {(staff.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        )}
      </div>
      {url && <Async state={state}>{(slots) => (
        <div className="card card-pad">
          <TimetableGrid slots={slots} showBatch={view === 'teacher'} onDelete={admin && view === 'batch' ? async (s) => { if (await run(() => api.del(`/timetable/${s._id}`), 'Removed.')) state.reload() } : undefined} />
        </div>
      )}</Async>}
      {adding && <SlotForm batch={batch} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload() }} />}
    </>
  )
}
