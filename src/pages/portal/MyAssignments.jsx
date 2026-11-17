import { useState } from 'react'
import { ClipboardList, ExternalLink, Send } from 'lucide-react'
import { api } from '../../lib/api.js'
import { assignmentState, fmtDate, fmtDateTime } from '../../lib/format.js'
import { useScope } from '../../lib/scope.jsx'
import { Async, Attachments, Badge, Empty, Field, FileAttach, Modal, PageHead, Segmented, useAction, useApi } from '../../components/ui.jsx'

function SubmitModal({ a, onClose, onSaved }) {
  const redo = a.submission?.status === 'returned'
  const [form, setForm] = useState({ text: a.submission?.status === 'submitted' ? a.submission.text || '' : '', link: a.submission?.link || '' })
  const [files, setFiles] = useState(() => (a.submission?.status === 'submitted' ? a.submission.attachments || [] : []))
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, attachments: files.map((f) => f.file || f._id) }
    if (await run(() => api.post(`/portal/assignments/${a._id}/submit`, body), 'Homework submitted. Your teacher will check it.')) onSaved()
  }
  return (
    <Modal title={a.title} onClose={onClose} size="lg" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="sub-form" disabled={busy}><Send size={15} /> {busy ? 'Submitting…' : 'Submit'}</button></>}>
      <form id="sub-form" className="stack" onSubmit={submit}>
        {a.instructions && <div className="alert alert-info pre">{a.instructions}</div>}
        {redo && a.submission.feedback && <div className="alert alert-error"><strong>Teacher:</strong> {a.submission.feedback}</div>}
        <Field label="Upload your work" hint="PDF or photos of your notebook pages, up to 5 files (8 MB each). Photos are made smaller automatically.">
          <FileAttach purpose="homework" value={files} onChange={setFiles} />
        </Field>
        <Field label="Your answer (optional)"><textarea className="textarea" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} style={{ minHeight: 120 }} placeholder="Type your answers here…" /></Field>
        <Field label="Link to your work (optional)" hint="Only if your work is online, e.g. a Google Drive link."><input className="input" type="url" inputMode="url" autoCapitalize="none" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" /></Field>
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
      <PageHead title={my('homework')} subtitle={readOnly ? 'Homework and assignments, with submission status, marks and teacher feedback.' : 'See pending homework, upload your work (PDF or photos) and get marks and feedback.'} />
      <Async state={state}>{(rows) => {
        const pending = rows.filter((a) => a.pending && a.status === 'published')
        const list = filter === 'pending' ? pending : filter === 'done' ? rows.filter((a) => !a.pending && !a.offline) : rows
        return (
          <>
            <div className="filters">
              <Segmented value={filter} onChange={setFilter} options={[{ value: 'pending', label: `Pending (${pending.length})` }, { value: 'done', label: 'Submitted' }, { value: 'all', label: `All (${rows.length})` }]} />
            </div>
            {list.length ? (
              <div className="stack">
                {list.map((a) => {
                  const st = a.offline ? { tone: a.pending ? 'warn' : '', label: a.pending ? 'Due' : 'Given' } : assignmentState(a)
                  const s = a.submission
                  return (
                    <div className="card card-pad stack" key={a._id}>
                      <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="cell-title">{a.title}</div>
                          <div className="cell-sub">{[a.subject, a.teacherName, `Due ${fmtDate(a.dueDate)}`, !a.offline && `${a.maxMarks} marks`].filter(Boolean).join(' · ')}</div>
                        </div>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </div>
                      {a.instructions && <p className="small text-2 pre">{a.instructions}</p>}
                      {a.offline && <div className="small muted">Hand this in to your teacher in class.</div>}
                      {a.attachments?.length > 0 && <div className="stack" style={{ gap: 4 }}><span className="small muted">Question sheet</span><Attachments files={a.attachments} /></div>}
                      {s?.attachments?.length > 0 && <div className="stack" style={{ gap: 4 }}><span className="small muted">Your upload</span><Attachments files={s.attachments} /></div>}
                      {s?.feedback && <div className={`alert ${s.status === 'returned' ? 'alert-error' : 'alert-info'} small`}><strong>{s.gradedBy || 'Teacher'}:</strong> {s.feedback}</div>}
                      <div className="row between">
                        <span className="small muted">{s?.submittedAt ? `Submitted ${fmtDateTime(s.submittedAt)}` : ''}</span>
                        <div className="row">
                          {a.url && <a className="btn btn-sm" href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {a.offline ? 'Open' : 'Question sheet'}</a>}
                          {s?.link && <a className="btn btn-sm" href={s.link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Submitted link</a>}
                          {!readOnly && !a.offline && a.status === 'published' && s?.status !== 'graded' && (
                            <button className="btn btn-sm btn-primary" onClick={() => setOpen(a)}><Send size={13} /> {s && s.status !== 'returned' ? 'Edit submission' : 'Submit'}</button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : <Empty icon={ClipboardList} text={filter === 'pending' ? 'No pending homework. 🎉' : 'Nothing here yet.'} />}
          </>
        )
      }}</Async>
      {open && <SubmitModal a={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); state.reload() }} />}
    </>
  )
}
