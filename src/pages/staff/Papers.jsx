import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileQuestion, Sparkles, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDate } from '../../lib/format.js'
import { AiNotice, Async, BatchSelect, Empty, Field, PageHead, useAction, useAiStatus, useApi, useBatches } from '../../components/ui.jsx'

export default function Papers() {
  const aiEnabled = useAiStatus()
  const batches = useBatches()
  const list = useApi('/papers')
  const navigate = useNavigate()
  const [run, busy] = useAction()
  const [form, setForm] = useState({ batch: '', subject: '', level: '', topics: '', mcq: 10, short: 5, long: 3, difficulty: 'medium', language: 'English', totalMarks: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const pickBatch = (id) => {
    const b = batches.find((x) => x._id === id)
    setForm({ ...form, batch: id, level: b?.program || form.level, subject: b?.subjects?.[0] || form.subject })
  }

  const submit = async (e) => {
    e.preventDefault()
    const paper = await run(() => api.post('/papers/generate', { ...form, mcq: Number(form.mcq), short: Number(form.short), long: Number(form.long), totalMarks: form.totalMarks ? Number(form.totalMarks) : undefined }), 'Question paper ready!')
    if (paper) navigate(`/papers/${paper._id}`)
  }

  const remove = async (p) => {
    if (await run(() => api.del(`/papers/${p._id}`), 'Deleted.')) list.reload()
  }

  const subjects = batches.find((b) => b._id === form.batch)?.subjects || []

  return (
    <>
      <PageHead title="AI Question Paper Generator" subtitle="Describe the exam — Claude writes a complete paper with sections, marks and an answer key. Print it or save as PDF." />
      <AiNotice enabled={aiEnabled} />
      <div className="grid grid-3 mt">
        <form className="card card-pad stack span-2" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Batch (optional)"><BatchSelect value={form.batch} onChange={pickBatch} allLabel="—" /></Field>
            <Field label="Subject *">
              <input className="input" list="paper-subjects" value={form.subject} onChange={set('subject')} required />
              <datalist id="paper-subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Class / course / exam level *" full><input className="input" value={form.level} onChange={set('level')} placeholder="Class 10 CBSE / B.Sc CS Sem 1 / NEET UG" required /></Field>
            <Field label="Topics / chapters" full><textarea className="textarea" value={form.topics} onChange={set('topics')} placeholder="e.g. Chapter 3 Pair of Linear Equations, Chapter 4 Quadratic Equations" style={{ minHeight: 70 }} /></Field>
            <Field label="MCQs"><input className="input" type="number" min="0" max="50" value={form.mcq} onChange={set('mcq')} /></Field>
            <Field label="Short answer"><input className="input" type="number" min="0" max="30" value={form.short} onChange={set('short')} /></Field>
            <Field label="Long answer"><input className="input" type="number" min="0" max="20" value={form.long} onChange={set('long')} /></Field>
            <Field label="Total marks (optional)"><input className="input" type="number" value={form.totalMarks} onChange={set('totalMarks')} placeholder="80" /></Field>
            <Field label="Difficulty"><select className="select" value={form.difficulty} onChange={set('difficulty')}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="mixed">Mixed (board pattern)</option></select></Field>
            <Field label="Language"><select className="select" value={form.language} onChange={set('language')}><option>English</option><option>Hindi</option><option>Bilingual (English + Hindi)</option></select></Field>
          </div>
          <div className="row between">
            <span className="small muted">{busy ? 'Claude is writing the paper — this can take up to a minute…' : 'Review every AI-generated question before using it in an exam.'}</span>
            <button className="btn btn-ai" disabled={busy || aiEnabled === false}><Sparkles size={15} /> {busy ? 'Generating…' : 'Generate paper'}</button>
          </div>
        </form>
        <div className="card">
          <div className="card-head"><h2>Saved papers</h2></div>
          <Async state={list}>{(papers) => papers.length ? (
            <div>
              {papers.map((p) => (
                <div key={p._id} className="row between" style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
                  <Link to={`/papers/${p._id}`} style={{ minWidth: 0 }}>
                    <div className="cell-title">{p.title}</div>
                    <div className="cell-sub">{p.subject} · {p.level} · {fmtDate(p.createdAt)}</div>
                  </Link>
                  <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => remove(p)} aria-label="Delete"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          ) : <Empty icon={FileQuestion} text="No papers yet." />}</Async>
        </div>
      </div>
    </>
  )
}
