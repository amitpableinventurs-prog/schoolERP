import { useState } from 'react'
import { ClipboardList, ExternalLink, Send } from 'lucide-react'
import { api } from '../../lib/api.js'
import { assignmentState, fmtDate, fmtDateTime } from '../../lib/format.js'
import { useScope } from '../../lib/scope.jsx'
import { Async, Badge, Empty, Field, Modal, PageHead, Segmented, useAction, useApi } from '../../components/ui.jsx'

function SubmitModal({ a, onClose, onSaved }) {
  const [form, setForm] = useState({ text: a.submission?.status === 'submitted' ? a.submission.text || '' : '', link: a.submission?.link || '' })
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    if (await run(() => api.post(`/portal/assignments/${a._id}/submit`, form), 'Submitted. Your teacher will check it.')) onSaved()
  }
  return (
    <Modal title={a.title} onClose={onClose} size="lg" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="sub-form" disabled={busy}><Send size={15} /> Submit</button></>}>
      <form id="sub-form" className="stack" onSubmit={submit}>
        {a.instructions && <div className="alert alert-info pre">{a.instructions}</div>}
        {a.submission?.status === 'returned' && a.submission.feedback && <div className="alert alert-error"><strong>Teacher:</strong> {a.submission.feedback}</div>}
        <Field label="Your answer"><textarea className="textarea" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} style={{ minHeight: 160 }} placeholder="Type your answers here…" /></Field>
        <Field label="Link to your work (optional)" hint="Upload photos or a PDF to Google Drive and paste the share link here."><input className="input" type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://drive.google.com/…" /></Field>
      </form>
    </Modal>
  )
}

export default function MyAssignments() {
  const { api: base, my, readOnly } = useScope()
  const state = useApi(`${base}/assignments`)
  const [filter, setFilter] = useState('pending')
  const [open, setOpen] = useState(null)

  return (
    <>
      <PageHead title={my('assignments')} subtitle={readOnly ? 'Homework and assignments, with submission status, marks and teacher feedback.' : 'Submit your homework online and see your marks and feedback.'} />
      <Async state={state}>{(rows) => {
        const pending = rows.filter((a) => a.pending && a.status === 'published')
        const list = filter === 'pending' ? pending : filter === 'done' ? rows.filter((a) => !a.pending) : rows
        return (
          <>
            <div className="filters">
              <Segmented value={filter} onChange={setFilter} options={[{ value: 'pending', label: `Pending (${pending.length})` }, { value: 'done', label: 'Submitted' }, { value: 'all', label: 'All' }]} />
            </div>
            {list.length ? (
              <div className="stack">
                {list.map((a) => {
                  const st = assignmentState(a)
                  const s = a.submission
                  return (
                    <div className="card card-pad stack" key={a._id}>
                      <div className="row between" style={{ alignItems: 'flex-start' }}>
                        <div>
                          <div className="cell-title">{a.title}</div>
                          <div className="cell-sub">{[a.subject, a.teacherName, `Due ${fmtDate(a.dueDate)}`, `${a.maxMarks} marks`].filter(Boolean).join(' · ')}</div>
                        </div>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      {a.instructions && <p className="small text-2 pre">{a.instructions}</p>}
                      {s?.feedback && <div className={`alert ${s.status === 'returned' ? 'alert-error' : 'alert-info'} small`}><strong>{s.gradedBy || 'Teacher'}:</strong> {s.feedback}</div>}
                      <div className="row between">
                        <span className="small muted">{s?.submittedAt ? `Submitted ${fmtDateTime(s.submittedAt)}` : ''}</span>
                        <div className="row">
                          {a.url && <a className="btn btn-sm" href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Question sheet</a>}
                          {s?.link && <a className="btn btn-sm" href={s.link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Submitted work</a>}
                          {!readOnly && a.status === 'published' && s?.status !== 'graded' && (
                            <button className="btn btn-sm btn-primary" onClick={() => setOpen(a)}><Send size={13} /> {s && s.status !== 'returned' ? 'Edit submission' : 'Submit'}</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : <Empty icon={ClipboardList} text={filter === 'pending' ? 'No pending assignments. 🎉' : 'Nothing here yet.'} />}
          </>
        )
      }}</Async>
      {open && <SubmitModal a={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); state.reload() }} />}
    </>
  )
}
