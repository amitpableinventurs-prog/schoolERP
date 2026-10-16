import { useState } from 'react'
import { api } from '../lib/api.js'
import { today } from '../lib/format.js'
import { BatchSelect, Field, Modal, useAction } from './ui.jsx'

const EMPTY = {
  name: '', gender: 'male', dob: '', phone: '', email: '', guardianName: '', guardianPhone: '', address: '',
  batch: '', rollNo: '', admissionNo: '', admissionDate: today(), status: 'active', notes: '',
}

export default function StudentForm({ student, onClose, onSaved }) {
  const editing = Boolean(student?._id)
  const [form, setForm] = useState(() => (editing ? { ...EMPTY, ...student, batch: student.batch?._id || student.batch } : EMPTY))
  const [password, setPassword] = useState('student123')
  const [run, busy] = useAction()
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, rollNo: form.rollNo === '' ? '' : Number(form.rollNo) }
    const saved = await run(
      () => (editing ? api.put(`/students/${student._id}`, body) : api.post('/students', { ...body, password })),
      editing ? 'Student updated.' : 'Admission done. Fee plan and portal login created.'
    )
    if (saved) onSaved(saved)
  }

  return (
    <Modal title={editing ? `Edit ${student.name}` : 'New admission'} onClose={onClose} size="lg" footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" form="student-form" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Admit student'}</button>
    </>}>
      <form id="student-form" className="form-grid" onSubmit={submit}>
        <Field label="Full name *"><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <Field label="Class / course / batch *"><BatchSelect value={form.batch} onChange={(v) => setForm({ ...form, batch: v })} allLabel="Select…" required /></Field>
        <Field label="Gender">
          <select className="select" value={form.gender} onChange={set('gender')}>
            <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
          </select>
        </Field>
        <Field label="Date of birth"><input className="input" type="date" value={form.dob || ''} onChange={set('dob')} /></Field>
        <Field label="Student phone"><input className="input" value={form.phone || ''} onChange={set('phone')} inputMode="tel" /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Guardian name"><input className="input" value={form.guardianName || ''} onChange={set('guardianName')} /></Field>
        <Field label="Guardian phone (WhatsApp)" hint="Used for automatic reminders"><input className="input" value={form.guardianPhone || ''} onChange={set('guardianPhone')} inputMode="tel" /></Field>
        <Field label="Address" full><input className="input" value={form.address || ''} onChange={set('address')} /></Field>
        <Field label="Admission no." hint={editing ? undefined : 'Leave empty to auto-generate'}><input className="input" value={form.admissionNo} onChange={set('admissionNo')} required={editing} /></Field>
        <Field label="Roll no."><input className="input" type="number" value={form.rollNo ?? ''} onChange={set('rollNo')} /></Field>
        <Field label="Admission date"><input className="input" type="date" value={form.admissionDate || ''} onChange={set('admissionDate')} /></Field>
        {editing ? (
          <Field label="Status">
            <select className="select" value={form.status} onChange={set('status')}>
              <option value="active">Active</option><option value="inactive">Inactive</option><option value="passed">Passed out</option><option value="dropped">Dropped</option>
            </select>
          </Field>
        ) : (
          <Field label="Portal password" hint="Login ID = admission no."><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} /></Field>
        )}
        <Field label="Notes" full><textarea className="textarea" value={form.notes || ''} onChange={set('notes')} style={{ minHeight: 60 }} /></Field>
      </form>
    </Modal>
  )
}
