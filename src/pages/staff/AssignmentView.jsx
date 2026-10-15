import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDate, fmtDateTime } from '../../lib/format.js'
import { AssignmentForm } from './Assignments.jsx'
import { Async, Badge, Confirm, Field, Modal, Segmented, StatTile, useAction, useApi } from '../../components/ui.jsx'

const STATE = {
  graded: ['good', 'Graded'],
  submitted: ['info', 'Submitted'],
  returned: ['bad', 'Redo requested'],
  missing: ['', 'Not submitted'],
}

function GradeModal({ assignment, row, onClose, onSaved }) {
  const s = row.submission
  const [form, setForm] = useState({ marks: s?.marks ?? '', feedback: s?.feedback || '' })
  const [run, busy] = useAction()
  const save = async (status) => {
    const r = await run(() => api.put(`/assignments/${assignment._id}/grade/${row.student._id}`, { ...form, status }), status === 'returned' ? 'Returned for resubmission.' : 'Graded.')
    if (r) onSaved()
  }
  return (
    <Modal title={row.student.name} size="lg" onClose={onClose} footer={<>
      <button className="btn" onClick={() => save('returned')} disabled={busy || !form.feedback.trim()} title="Write feedback first">Ask to redo</button>
      <button className="btn btn-primary" onClick={() => save('graded')} disabled={busy || form.marks === ''}>Save grade</button>
    </>}>
      <div className="stack">
        {s ? (
          <div className="card card-pad stack" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
            <div className="small muted">Submitted {fmtDateTime(s.submittedAt)}{s.late && ' · late'}</div>
            {s.text && <p className="pre">{s.text}</p>}
            {s.link && <a className="btn btn-sm" style={{ alignSelf: 'flex-start' }} href={s.link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open submitted work</a>}
          </div>
        ) : <div className="alert alert-info small">No online submission. You can still grade work handed in on paper.</div>}
        <div className="form-grid">
          <Field label={`Marks (out of ${assignment.maxMarks})`}><input className="input" type="number" min={0} max={assignment.maxMarks} step="0.5" value={form.marks} onChange={(e) => setForm({ ...form, marks: e.target.value })} autoFocus /></Field>
          <Field label="Feedback for the student (parents see it too)" full><textarea className="textarea" value={form.feedback} onChange={(e) => setForm({ ...form, feedback: e.target.value })} placeholder="What was good, what to improve…" /></Field>
        </div>
      </div>
    </Modal>
  )
}

export default function AssignmentView() {
  const { id } = useParams()
  const state = useApi(`/assignments/${id}`)
  const [filter, setFilter] = useState('all')
  const [grading, setGrading] = useState(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [run, busy] = useAction()
  const navigate = useNavigate()

  return (
    <Async state={state}>{({ assignment: a, rows }) => {
      const stateOf = (r) => r.submission?.status || 'missing'
      const count = (k) => rows.filter((r) => stateOf(r) === k).length
      const graded = rows.filter((r) => r.submission?.status === 'graded')
      const avg = graded.length ? Math.round((graded.reduce((x, r) => x + r.submission.marks, 0) / graded.length) * 10) / 10 : null
      const list = filter === 'all' ? rows : rows.filter((r) => stateOf(r) === filter)
      return (
        <>
          <div className="row between mb">
            <Link to="/assignments" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Assignments</Link>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setEditing(true)}><Pencil size={14} /> Edit</button>
              <button className="btn btn-sm btn-danger" onClick={() => setDeleting(true)}><Trash2 size={14} /></button>
            </div>
          </div>
          <div className="card card-pad mb stack">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h1>{a.title}</h1>
                <div className="small text-2">{[a.batch?.name, a.subject, a.course?.title && `Course: ${a.course.title}`, `Due ${fmtDate(a.dueDate)}`, `${a.maxMarks} marks`, a.allowLate ? 'late allowed' : 'no late submissions'].filter(Boolean).join(' · ')}</div>
              </div>
              <Badge tone={a.status === 'published' ? 'good' : ''}>{a.status === 'published' ? 'Open' : 'Closed'}</Badge>
            </div>
            {a.instructions && <p className="pre text-2">{a.instructions}</p>}
            {a.url && <a className="btn btn-sm" style={{ alignSelf: 'flex-start' }} href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Question sheet</a>}
          </div>
          <div className="grid grid-4 mb">
            <StatTile label="Submitted" value={`${count('submitted') + count('graded')} / ${rows.length}`} />
            <StatTile label="Waiting for grading" value={count('submitted')} tone={count('submitted') ? 'ai' : undefined} />
            <StatTile label="Not submitted" value={count('missing') + count('returned')} tone={count('missing') ? 'bad' : undefined} />
            <StatTile label="Average marks" value={avg == null ? '—' : `${avg} / ${a.maxMarks}`} tone="good" />
          </div>
          <div className="filters">
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'submitted', label: `To grade (${count('submitted')})` }, { value: 'graded', label: 'Graded' }, { value: 'returned', label: 'Redo' }, { value: 'missing', label: 'Missing' }]} />
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Status</th><th>Submitted</th><th>Answer</th><th className="num">Marks</th><th /></tr></thead>
                <tbody>{list.map((r) => {
                  const s = r.submission
                  const [tone, label] = STATE[stateOf(r)]
                  return (
                    <tr key={r.student._id}>
                      <td><div className="cell-title">{r.student.name}</div><div className="cell-sub mono">{r.student.admissionNo} · Roll {r.student.rollNo ?? '—'}</div></td>
                      <td><Badge tone={tone}>{label}</Badge>{s?.late && <Badge tone="warn">Late</Badge>}</td>
                      <td className="small text-2">{s?.submittedAt ? fmtDateTime(s.submittedAt) : '—'}</td>
                      <td className="small text-2" style={{ maxWidth: 280 }}>{s?.text ? `${s.text.slice(0, 90)}${s.text.length > 90 ? '…' : ''}` : ''}{s?.link && <div><a href={s.link} target="_blank" rel="noreferrer">Open link</a></div>}</td>
                      <td className="num">{s?.status === 'graded' ? `${s.marks}/${a.maxMarks}` : '—'}</td>
                      <td><button className="btn btn-sm" onClick={() => setGrading(r)}>{s?.status === 'graded' ? 'Edit grade' : 'Grade'}</button></td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          </div>
          {grading && <GradeModal assignment={a} row={grading} onClose={() => setGrading(null)} onSaved={() => { setGrading(null); state.reload() }} />}
          {editing && <AssignmentForm assignment={a} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); state.reload() }} />}
          {deleting && <Confirm text={`Delete "${a.title}" and all its submissions?`} busy={busy} onClose={() => setDeleting(false)} onConfirm={async () => { if (await run(() => api.del(`/assignments/${a._id}`), 'Assignment deleted.')) navigate('/assignments') }} />}
        </>
      )
    }}</Async>
  )
}
