import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Pencil, Plus } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, today } from '../../lib/format.js'
import { Async, Badge, BatchSelect, Empty, Field, Meter, Modal, PageHead, Segmented, StatusBadge, useAction, useApi } from '../../components/ui.jsx'

export function AssignmentForm({ assignment, onClose, onSaved }) {
  const [form, setForm] = useState(() => assignment
    ? { ...assignment, batch: assignment.batch?._id || assignment.batch, course: assignment.course?._id || assignment.course || '' }
    : { title: '', instructions: '', batch: '', subject: '', course: '', url: '', dueDate: today(), maxMarks: 10, allowLate: true, status: 'published' })
  const courses = useApi(form.batch ? `/courses${qs({ batch: form.batch })}` : null)
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { title: form.title, instructions: form.instructions, batch: form.batch, subject: form.subject, course: form.course, url: form.url, dueDate: form.dueDate, maxMarks: Number(form.maxMarks), allowLate: form.allowLate, status: form.status }
    const saved = await run(() => (assignment ? api.put(`/assignments/${assignment._id}`, body) : api.post('/assignments', body)), assignment ? 'Assignment updated.' : 'Assignment given to the batch.')
    if (saved) onSaved(saved)
  }
  return (
    <Modal title={assignment ? 'Edit assignment' : 'New assignment'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="asg-form" disabled={busy}>{assignment ? 'Save' : 'Give assignment'}</button></>}>
      <form id="asg-form" className="form-grid" onSubmit={submit}>
        <Field label="Title *" full><input className="input" value={form.title} onChange={set('title')} required placeholder="e.g. Chapter 3 — Exercise 3.2" /></Field>
        <Field label="Batch *"><BatchSelect value={form.batch} onChange={(v) => setForm({ ...form, batch: v, course: '' })} allLabel="Choose batch" required /></Field>
        <Field label="Subject"><input className="input" value={form.subject || ''} onChange={set('subject')} /></Field>
        <Field label="Due date *"><input className="input" type="date" value={form.dueDate} onChange={set('dueDate')} required /></Field>
        <Field label="Maximum marks"><input className="input" type="number" min={1} value={form.maxMarks} onChange={set('maxMarks')} /></Field>
        <Field label="Instructions" full><textarea className="textarea" value={form.instructions || ''} onChange={set('instructions')} style={{ minHeight: 100 }} /></Field>
        <Field label="Question sheet link (optional)" full><input className="input" type="url" value={form.url || ''} onChange={set('url')} placeholder="https://drive.google.com/…" /></Field>
        <Field label="Part of course (optional)">
          <select className="select" value={form.course || ''} onChange={set('course')} disabled={!form.batch}>
            <option value="">None</option>
            {(courses.data || []).map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
          </select>
        </Field>
        {assignment && <Field label="Status"><select className="select" value={form.status} onChange={set('status')}><option value="published">Open for submissions</option><option value="closed">Closed</option></select></Field>}
        <label className="check full"><input type="checkbox" checked={form.allowLate} onChange={(e) => setForm({ ...form, allowLate: e.target.checked })} /> Accept late submissions (marked “late”)</label>
      </form>
    </Modal>
  )
}

export default function Assignments() {
  const [batch, setBatch] = useState('')
  const [status, setStatus] = useState('')
  const state = useApi(`/assignments${qs({ batch, status })}`)
  const [form, setForm] = useState(null)
  const navigate = useNavigate()
  const now = today()
  return (
    <>
      <PageHead title="Assignments" subtitle="Give homework to a batch, collect submissions online, grade them and send feedback. Parents see the status too.">
        <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} /> New assignment</button>
      </PageHead>
      <div className="filters">
        <BatchSelect value={batch} onChange={setBatch} />
        <Segmented value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'published', label: 'Open' }, { value: 'closed', label: 'Closed' }]} />
      </div>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Assignment</th><th>Batch</th><th>Due</th><th style={{ minWidth: 150 }}>Submitted</th><th className="num">To grade</th><th>Status</th><th /></tr></thead>
              <tbody>{rows.map((a) => (
                <tr key={a._id} className="clickable" onClick={() => navigate(`/assignments/${a._id}`)}>
                  <td><div className="cell-title">{a.title}</div><div className="cell-sub">{[a.subject, a.course?.title, `${a.maxMarks} marks`].filter(Boolean).join(' · ')}</div></td>
                  <td className="small">{a.batch?.name}</td>
                  <td className="nowrap">{fmtDate(a.dueDate)}{a.dueDate < now && a.status === 'published' && <div><Badge tone="warn">Past due</Badge></div>}</td>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><Meter value={a.students ? (a.submitted / a.students) * 100 : 0} /></div><span className="small nowrap">{a.submitted}/{a.students}</span></div></td>
                  <td className="num">{a.submitted - a.graded > 0 ? <Badge tone="warn">{a.submitted - a.graded}</Badge> : <span className="muted">0</span>}</td>
                  <td><StatusBadge value={a.status === 'published' ? 'active' : 'closed'} label={a.status === 'published' ? 'Open' : 'Closed'} /></td>
                  <td><button className="btn btn-sm btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); setForm(a) }} aria-label="Edit"><Pencil size={14} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty icon={ClipboardList} text="No assignments yet." />}</Async>
      {form && <AssignmentForm assignment={form._id ? form : null} onClose={() => setForm(null)} onSaved={(saved) => { setForm(null); form._id ? state.reload() : navigate(`/assignments/${saved._id}`) }} />}
    </>
  )
}
