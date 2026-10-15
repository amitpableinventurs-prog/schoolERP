import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, MapPin, Pencil, Plus, Trash2, User, Users } from 'lucide-react'
import { api } from '../../lib/api.js'
import { isAdmin, myWings, useAuth } from '../../lib/auth.jsx'
import { money, TYPE_LABEL } from '../../lib/format.js'
import { Async, Badge, clearBatchCache, Confirm, Empty, Field, Meter, Modal, PageHead, Segmented, StatusBadge, useAction, useApi } from '../../components/ui.jsx'

const EMPTY = { name: '', type: 'school', program: '', section: '', academicYear: '2026-27', subjects: '', classTeacher: '', room: '', timing: '', capacity: 40, fee: 0, installments: 1, status: 'active' }
const PROGRAM_HINT = { school: 'e.g. Class 9 (CBSE)', college: 'e.g. B.Com, BCA, B.Sc', coaching: 'e.g. JEE Main, NEET, SSC, Spoken English' }

function BatchForm({ item, onClose, onSaved }) {
  const wings = myWings(useAuth().user)
  const [form, setForm] = useState(item ? { ...EMPTY, ...item, subjects: (item.subjects || []).join(', '), classTeacher: item.classTeacher?._id || '' } : { ...EMPTY, type: wings[0] })
  const staff = useApi('/staff?status=active')
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, subjects: form.subjects.split(',').map((s) => s.trim()).filter(Boolean), capacity: Number(form.capacity), fee: Number(form.fee), installments: Number(form.installments) }
    const ok = await run(() => (item ? api.put(`/batches/${item._id}`, body) : api.post('/batches', body)), 'Saved.')
    if (ok) onSaved()
  }
  return (
    <Modal title={item ? 'Edit class / batch' : 'New class / course / batch'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="batch-form" disabled={busy}>Save</button></>}>
      <form id="batch-form" className="form-grid" onSubmit={submit}>
        <Field label="Type *" full>
          <Segmented value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={[{ value: 'school', label: 'School class' }, { value: 'college', label: 'College course' }, { value: 'coaching', label: 'Coaching batch' }].filter((o) => wings.includes(o.value))} />
        </Field>
        <Field label="Name *"><input className="input" value={form.name} onChange={set('name')} placeholder="Class 10 - B / BCA Year 1 / JEE 2028 Morning" required /></Field>
        <Field label="Program" hint={PROGRAM_HINT[form.type]}><input className="input" value={form.program || ''} onChange={set('program')} /></Field>
        <Field label="Section / semester"><input className="input" value={form.section || ''} onChange={set('section')} /></Field>
        <Field label="Academic year"><input className="input" value={form.academicYear || ''} onChange={set('academicYear')} /></Field>
        <Field label="Subjects" hint="Comma separated" full><input className="input" value={form.subjects} onChange={set('subjects')} /></Field>
        <Field label="Class teacher / coordinator">
          <select className="select" value={form.classTeacher} onChange={set('classTeacher')}>
            <option value="">—</option>
            {(staff.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Room"><input className="input" value={form.room || ''} onChange={set('room')} /></Field>
        <Field label="Timing"><input className="input" value={form.timing || ''} onChange={set('timing')} placeholder="8:00 AM - 1:30 PM" /></Field>
        <Field label="Capacity"><input className="input" type="number" value={form.capacity} onChange={set('capacity')} /></Field>
        <Field label={form.type === 'school' ? 'Annual fee (₹)' : 'Total course fee (₹)'}><input className="input" type="number" value={form.fee} onChange={set('fee')} /></Field>
        <Field label="Installments" hint="Fee is split equally for new admissions"><input className="input" type="number" min="1" max="24" value={form.installments} onChange={set('installments')} /></Field>
        <Field label="Status"><select className="select" value={form.status} onChange={set('status')}><option value="active">Active</option><option value="completed">Completed</option></select></Field>
      </form>
    </Modal>
  )
}

export default function Batches() {
  const [type, setType] = useState('')
  const state = useApi('/batches/summary')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()
  const { user } = useAuth()
  const admin = isAdmin(user)
  const refresh = () => { clearBatchCache(); state.reload() }

  return (
    <>
      <PageHead title="Classes & Batches" subtitle="School classes, college courses and coaching batches — each with its own subjects, fee and timing.">
        {admin && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> New</button>}
      </PageHead>
      <div className="filters">
        <Segmented value={type} onChange={setType} options={[{ value: '', label: 'All' }, { value: 'school', label: 'School' }, { value: 'college', label: 'College' }, { value: 'coaching', label: 'Coaching' }].filter((o) => !o.value || myWings(user).includes(o.value))} />
      </div>
      <Async state={state}>{(list) => {
        const rows = list.filter((b) => !type || b.type === type)
        if (!rows.length) return <Empty text="No batches yet." />
        return (
          <div className="grid grid-3">
            {rows.map((b) => (
              <div className="card card-pad stack" key={b._id}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <h2>{b.name}</h2>
                    <div className="small muted">{b.program}{b.section ? ` · ${b.section}` : ''}</div>
                  </div>
                  <div className="row"><StatusBadge value={b.type} label={TYPE_LABEL[b.type]} />{b.status !== 'active' && <Badge>{b.status}</Badge>}</div>
                </div>
                <div className="row small text-2" style={{ gap: 14 }}>
                  <span className="row" style={{ gap: 4 }}><User size={13} /> {b.classTeacher?.name || '—'}</span>
                  <span className="row" style={{ gap: 4 }}><Clock size={13} /> {b.timing || '—'}</span>
                  <span className="row" style={{ gap: 4 }}><MapPin size={13} /> {b.room || '—'}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>{b.subjects.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                <div>
                  <div className="row between small"><span className="row" style={{ gap: 4 }}><Users size={13} /> {b.students} / {b.capacity} seats</span><span className="text-2">{money(b.fee)} · {b.installments} inst.</span></div>
                  <div style={{ marginTop: 6 }}><Meter value={(b.students / Math.max(1, b.capacity)) * 100} /></div>
                </div>
                <div className="row">
                  <Link className="btn btn-sm" to={`/students?batch=${b._id}`}>Students</Link>
                  <Link className="btn btn-sm" to="/timetable">Timetable</Link>
                  {admin && <>
                    <span style={{ flex: 1 }} />
                    <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(b)} aria-label="Edit"><Pencil size={14} /></button>
                    <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(b)} aria-label="Delete"><Trash2 size={14} /></button>
                  </>}
                </div>
              </div>
            ))}
          </div>
        )
      }}</Async>
      {editing && <BatchForm item={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      {deleting && <Confirm text={deleting.students ? `${deleting.name} still has ${deleting.students} students. Move them first, or mark the batch completed.` : `Delete ${deleting.name}?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (deleting.students) return setDeleting(null)
        if (await run(() => api.del(`/batches/${deleting._id}`), 'Deleted.')) { setDeleting(null); refresh() }
      }} confirmLabel={deleting.students ? 'OK' : 'Delete'} />}
    </>
  )
}
