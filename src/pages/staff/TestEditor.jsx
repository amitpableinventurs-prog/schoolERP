import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { AiNotice, BatchSelect, Field, Loading, Modal, useAction, useAiStatus, useBatches, useToast } from '../../components/ui.jsx'

const LETTERS = ['A', 'B', 'C', 'D']
const blankQuestion = () => ({ q: '', options: ['', '', '', ''], answer: 0, explanation: '', marks: 4 })

function AiGenerate({ defaults, onClose, onAdd }) {
  const [form, setForm] = useState({ subject: defaults.subject || '', level: defaults.level || '', topic: defaults.topic || '', count: 10, difficulty: 'medium', language: 'English' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const r = await run(() => api.post('/tests/ai-generate', form))
    if (r) onAdd(r.questions)
  }
  return (
    <Modal title="Generate questions with AI" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-ai" form="ai-form" disabled={busy}><Sparkles size={15} /> {busy ? 'Writing questions…' : 'Generate'}</button></>}>
      <form id="ai-form" className="form-grid" onSubmit={submit}>
        <Field label="Subject *"><input className="input" value={form.subject} onChange={set('subject')} required /></Field>
        <Field label="Level"><input className="input" value={form.level} onChange={set('level')} placeholder="JEE Main / Class 10 CBSE / BCA Sem 3" /></Field>
        <Field label="Topic *" full><input className="input" value={form.topic} onChange={set('topic')} placeholder="e.g. Laws of Motion — friction and pulleys" required /></Field>
        <Field label="Number of questions"><input className="input" type="number" min="1" max="30" value={form.count} onChange={set('count')} /></Field>
        <Field label="Difficulty"><select className="select" value={form.difficulty} onChange={set('difficulty')}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard (competitive)</option><option value="mixed">Mixed</option></select></Field>
        <Field label="Language"><select className="select" value={form.language} onChange={set('language')}><option>English</option><option>Hindi</option><option>Bilingual (English + Hindi)</option></select></Field>
      </form>
      {busy && <p className="small muted mt">This takes 20–60 seconds. Always review AI questions before publishing.</p>}
    </Modal>
  )
}

export default function TestEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const batches = useBatches()
  const aiEnabled = useAiStatus()
  const toast = useToast()
  const [test, setTest] = useState(id ? null : { title: '', batch: '', subject: '', topic: '', durationMin: 30, negativeMarks: 1, questions: [], status: 'draft', aiGenerated: false })
  const [aiOpen, setAiOpen] = useState(false)
  const [run, busy] = useAction()

  useEffect(() => {
    if (id) api.get(`/tests/${id}`).then((t) => setTest({ ...t, batch: t.batch?._id })).catch((e) => toast(e.message, 'error'))
  }, [id, toast])

  if (!test) return <Loading />
  const set = (k) => (e) => setTest({ ...test, [k]: e.target.value })
  const setQ = (i, patch) => setTest({ ...test, questions: test.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) })
  const batch = batches.find((b) => b._id === test.batch)

  const save = async (status) => {
    if (!test.title || !test.batch) return toast('Title and batch are required.', 'error')
    const bad = test.questions.findIndex((q) => !q.q.trim() || q.options.some((o) => !o.trim()))
    if (bad >= 0) return toast(`Question ${bad + 1} is incomplete.`, 'error')
    const body = { ...test, status: status || test.status, durationMin: Number(test.durationMin), negativeMarks: Number(test.negativeMarks) }
    const saved = await run(() => (id ? api.put(`/tests/${id}`, body) : api.post('/tests', body)), status === 'published' ? 'Published! Students can take it now.' : 'Saved.')
    if (saved) navigate('/tests')
  }

  return (
    <>
      <div className="row mb"><Link to="/tests" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Tests</Link></div>
      <div className="page-head">
        <h1>{id ? 'Edit test' : 'New online test'}</h1>
        <div className="page-actions">
          <button className="btn btn-ai" onClick={() => setAiOpen(true)} disabled={aiEnabled === false}><Sparkles size={15} /> Generate with AI</button>
          <button className="btn" onClick={() => save()} disabled={busy}><Save size={15} /> Save</button>
          {test.status !== 'published' && <button className="btn btn-primary" onClick={() => save('published')} disabled={busy || !test.questions.length}>Save & publish</button>}
        </div>
      </div>
      <AiNotice enabled={aiEnabled} />
      <div className="card card-pad mt mb">
        <div className="form-grid">
          <Field label="Title *"><input className="input" value={test.title} onChange={set('title')} placeholder="Physics — Rotational Motion (Test 4)" /></Field>
          <Field label="Batch *"><BatchSelect value={test.batch} onChange={(v) => setTest({ ...test, batch: v })} allLabel="Select…" /></Field>
          <Field label="Subject">
            <input className="input" list="subjects" value={test.subject || ''} onChange={set('subject')} />
            <datalist id="subjects">{(batch?.subjects || []).map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="Topic"><input className="input" value={test.topic || ''} onChange={set('topic')} /></Field>
          <Field label="Duration (minutes)"><input className="input" type="number" min="1" value={test.durationMin} onChange={set('durationMin')} /></Field>
          <Field label="Negative marks per wrong answer"><input className="input" type="number" min="0" step="0.25" value={test.negativeMarks} onChange={set('negativeMarks')} /></Field>
        </div>
      </div>

      <div className="row between mb">
        <h2>{test.questions.length} questions · {test.questions.reduce((s, q) => s + Number(q.marks || 0), 0)} marks</h2>
        <button className="btn" onClick={() => setTest({ ...test, questions: [...test.questions, blankQuestion()] })}><Plus size={15} /> Add question</button>
      </div>
      <div className="stack">
        {test.questions.map((q, i) => (
          <div className="card q-card" key={i}>
            <div className="row between mb" style={{ marginBottom: 8 }}>
              <strong>Q{i + 1}</strong>
              <div className="row">
                <label className="row small">Marks <input className="input" type="number" value={q.marks} onChange={(e) => setQ(i, { marks: Number(e.target.value) })} style={{ width: 70 }} /></label>
                <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setTest({ ...test, questions: test.questions.filter((_, j) => j !== i) })} aria-label="Delete question"><Trash2 size={14} /></button>
              </div>
            </div>
            <textarea className="textarea" value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} placeholder="Question text" style={{ minHeight: 60 }} />
            <div className="form-grid" style={{ marginTop: 8 }}>
              {q.options.map((opt, oi) => (
                <label key={oi} className="row" style={{ flexWrap: 'nowrap' }}>
                  <input type="radio" name={`ans-${i}`} checked={q.answer === oi} onChange={() => setQ(i, { answer: oi })} aria-label={`Option ${LETTERS[oi]} is correct`} />
                  <span className="q-letter">{LETTERS[oi]}</span>
                  <input className="input" value={opt} onChange={(e) => setQ(i, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })} placeholder={`Option ${LETTERS[oi]}`} />
                </label>
              ))}
            </div>
            <input className="input mt" style={{ marginTop: 8 }} value={q.explanation || ''} onChange={(e) => setQ(i, { explanation: e.target.value })} placeholder="Explanation shown after submission (optional)" />
          </div>
        ))}
      </div>
      {aiOpen && (
        <AiGenerate
          defaults={{ subject: test.subject, topic: test.topic, level: batch?.program }}
          onClose={() => setAiOpen(false)}
          onAdd={(questions) => {
            setTest({ ...test, questions: [...test.questions, ...questions], aiGenerated: true })
            setAiOpen(false)
            toast(`${questions.length} questions added. Please review the answers.`)
          }}
        />
      )}
    </>
  )
}
