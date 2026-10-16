import { useState } from 'react'
import { Pin, Plus, Sparkles, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDate } from '../../lib/format.js'
import { Async, Badge, BatchSelect, Empty, Field, Modal, PageHead, useAction, useAiStatus, useApi } from '../../components/ui.jsx'

function NoticeForm({ onClose, onSaved }) {
  const aiEnabled = useAiStatus()
  const [form, setForm] = useState({ title: '', body: '', audience: 'all', batch: '', pinned: false })
  const [points, setPoints] = useState('')
  const [language, setLanguage] = useState('English')
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const draft = async () => {
    const r = await run(() => api.post('/notices/ai-draft', { points, audience: form.audience, language }))
    if (r) setForm({ ...form, title: r.title, body: r.body })
  }
  const submit = async (e) => {
    e.preventDefault()
    if (await run(() => api.post('/notices', form), 'Notice published.')) onSaved()
  }

  return (
    <Modal title="New notice" size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="notice-form" disabled={busy}>Publish</button></>}>
      <div className="card card-pad stack mb" style={{ background: 'var(--violet-soft)', boxShadow: 'none' }}>
        <div className="row" style={{ color: 'var(--violet-text)', fontWeight: 600 }}><Sparkles size={15} /> Draft with AI</div>
        <textarea className="textarea" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="Rough points, e.g. 'school band 20-25 oct diwali, coaching online doubt class 23 oct 5pm, fees due 30 oct'" style={{ minHeight: 60 }} />
        <div className="row">
          <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: 'auto' }}><option>English</option><option>Hindi</option><option>English + Hindi</option></select>
          <button type="button" className="btn btn-ai" onClick={draft} disabled={busy || !points.trim() || aiEnabled === false}>{busy ? 'Writing…' : 'Write notice'}</button>
        </div>
      </div>
      <form id="notice-form" className="form-grid" onSubmit={submit}>
        <Field label="Title *" full><input className="input" value={form.title} onChange={set('title')} required /></Field>
        <Field label="Notice *" full><textarea className="textarea" value={form.body} onChange={set('body')} required style={{ minHeight: 140 }} /></Field>
        <Field label="Audience"><select className="select" value={form.audience} onChange={set('audience')}><option value="all">Everyone</option><option value="students">Students &amp; parents</option><option value="parents">Parents only</option><option value="staff">Staff only</option></select></Field>
        <Field label="Batch"><BatchSelect value={form.batch} onChange={(v) => setForm({ ...form, batch: v })} allLabel="All batches" /></Field>
        <label className="check full"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin to top</label>
      </form>
    </Modal>
  )
}

export default function Notices() {
  const state = useApi('/notices')
  const [adding, setAdding] = useState(false)
  const [run] = useAction()
  return (
    <>
      <PageHead title="Notices" subtitle="Announcements for students, staff or a specific batch.">
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> New notice</button>
      </PageHead>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="stack">
          {rows.map((n) => (
            <div className="card card-pad" key={n._id}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h2 className="row">{n.pinned && <Pin size={15} />} {n.title}</h2>
                  <div className="small muted" style={{ marginTop: 2 }}>{fmtDate(n.createdAt)} · {n.createdBy}</div>
                </div>
                <div className="row">
                  <Badge tone="info">{n.audience === 'all' ? 'Everyone' : n.audience === 'students' ? 'Students & parents' : n.audience}</Badge>
                  {n.batch && <Badge>{n.batch.name}</Badge>}
                  <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={async () => { if (await run(() => api.del(`/notices/${n._id}`), 'Deleted.')) state.reload() }} aria-label="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
              <p className="pre text-2" style={{ marginTop: 10 }}>{n.body}</p>
            </div>
          ))}
        </div>
      ) : <Empty text="No notices yet." />}</Async>
      {adding && <NoticeForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload() }} />}
    </>
  )
}
