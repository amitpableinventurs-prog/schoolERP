import { useState } from 'react'
import { BookOpen, ExternalLink, FileText, Link2, PenSquare, Plus, Trash2, Video } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate } from '../../lib/format.js'
import { Async, Badge, BatchSelect, Empty, Field, Modal, PageHead, useAction, useApi } from '../../components/ui.jsx'

export const KIND_ICON = { notes: FileText, video: Video, link: Link2, assignment: PenSquare }

function MaterialForm({ onClose, onSaved }) {
  const [form, setForm] = useState({ batch: '', subject: '', title: '', kind: 'notes', url: '', description: '', dueDate: '' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    if (await run(() => api.post('/materials', form), 'Shared with students.')) onSaved()
  }
  return (
    <Modal title="Share study material" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="mat-form" disabled={busy}>Share</button></>}>
      <form id="mat-form" className="form-grid" onSubmit={submit}>
        <Field label="Title *" full><input className="input" value={form.title} onChange={set('title')} required /></Field>
        <Field label="Batch"><BatchSelect value={form.batch} onChange={(v) => setForm({ ...form, batch: v })} allLabel="All batches" /></Field>
        <Field label="Subject"><input className="input" value={form.subject} onChange={set('subject')} /></Field>
        <Field label="Type"><select className="select" value={form.kind} onChange={set('kind')}><option value="notes">Notes / PDF</option><option value="video">Video lecture</option><option value="link">Link</option><option value="assignment">Assignment / DPP (no online submission)</option></select></Field>
        {form.kind === 'assignment' && <Field label="Due date"><input className="input" type="date" value={form.dueDate} onChange={set('dueDate')} /></Field>}
        <Field label="Link (Google Drive, YouTube, website…)" full><input className="input" type="url" value={form.url} onChange={set('url')} placeholder="https://" /></Field>
        <Field label="Description" full><textarea className="textarea" value={form.description} onChange={set('description')} style={{ minHeight: 60 }} /></Field>
      </form>
    </Modal>
  )
}

export default function Materials() {
  const [batch, setBatch] = useState('')
  const state = useApi(`/materials${qs({ batch })}`)
  const [adding, setAdding] = useState(false)
  const [run] = useAction()
  return (
    <>
      <PageHead title="Study Material" subtitle="Quick notes, links and DPPs for the student portal. For structured lessons use LMS → Courses; for homework with online submission use LMS → Assignments.">
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Share material</button>
      </PageHead>
      <div className="filters"><BatchSelect value={batch} onChange={setBatch} /></div>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="grid grid-3">
          {rows.map((m) => {
            const Icon = KIND_ICON[m.kind] || BookOpen
            return (
              <div className="card card-pad stack" key={m._id}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    <span className="stat-icon"><Icon size={16} /></span>
                    <div><div className="cell-title">{m.title}</div><div className="cell-sub">{m.batch?.name || 'All batches'}{m.subject ? ` · ${m.subject}` : ''}</div></div>
                  </div>
                  <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={async () => { if (await run(() => api.del(`/materials/${m._id}`), 'Removed.')) state.reload() }} aria-label="Delete"><Trash2 size={14} /></button>
                </div>
                {m.description && <p className="small text-2">{m.description}</p>}
                <div className="row between">
                  <div className="row"><Badge>{m.kind}</Badge>{m.dueDate && <Badge tone="warn">Due {fmtDate(m.dueDate)}</Badge>}</div>
                  {m.url && <a className="btn btn-sm" href={m.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open</a>}
                </div>
              </div>
            )
          })}
        </div>
      ) : <Empty text="Nothing shared yet." />}</Async>
      {adding && <MaterialForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload() }} />}
    </>
  )
}
