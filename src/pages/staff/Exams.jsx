import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, today } from '../../lib/format.js'
import { Async, BatchSelect, Badge, Confirm, Empty, Field, Modal, PageHead, PctBadge, useAction, useApi, useBatches } from '../../components/ui.jsx'

function ExamForm({ onClose, onSaved }) {
  const batches = useBatches()
  const [form, setForm] = useState({ name: '', batch: '', type: 'unit', date: today() })
  const [subjects, setSubjects] = useState([])
  const [run, busy] = useAction()
  const pickBatch = (id) => {
    setForm({ ...form, batch: id })
    const b = batches.find((x) => x._id === id)
    setSubjects((b?.subjects || []).map((name) => ({ name, maxMarks: form.type === 'unit' ? 25 : 100 })))
  }
  const submit = async (e) => {
    e.preventDefault()
    const exam = await run(() => api.post('/exams', { ...form, subjects: subjects.filter((s) => s.name) }), 'Exam created. Enter marks next.')
    if (exam) onSaved(exam)
  }
  return (
    <Modal title="New exam" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="exam-form" disabled={busy}>Create</button></>}>
      <form id="exam-form" className="form-grid" onSubmit={submit}>
        <Field label="Exam name *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Unit Test 2 / Mock Test 3 / Semester exam" required /></Field>
        <Field label="Class / batch *"><BatchSelect value={form.batch} onChange={pickBatch} allLabel="Select…" required /></Field>
        <Field label="Type">
          <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="unit">Unit test</option><option value="mid">Mid term / internal</option><option value="final">Final / semester</option><option value="mock">Mock test (coaching)</option>
          </select>
        </Field>
        <Field label="Date"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <div className="full">
          <div className="small muted mb" style={{ marginBottom: 6 }}>Subjects and maximum marks</div>
          {subjects.length ? subjects.map((s, i) => (
            <div className="row" key={i} style={{ marginBottom: 6 }}>
              <input className="input" value={s.name} onChange={(e) => setSubjects(subjects.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} style={{ flex: 2 }} />
              <input className="input" type="number" value={s.maxMarks} onChange={(e) => setSubjects(subjects.map((x, j) => (j === i ? { ...x, maxMarks: Number(e.target.value) } : x)))} style={{ flex: 1 }} aria-label="Max marks" />
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSubjects(subjects.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></button>
            </div>
          )) : <div className="small muted">Select a batch to load its subjects.</div>}
          {form.batch && <button type="button" className="btn btn-sm" onClick={() => setSubjects([...subjects, { name: '', maxMarks: 100 }])}><Plus size={13} /> Subject</button>}
        </div>
      </form>
    </Modal>
  )
}

export default function Exams() {
  const [batch, setBatch] = useState('')
  const state = useApi(`/exams${qs({ batch })}`)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()

  return (
    <>
      <PageHead title="Exams & Results" subtitle="Unit tests, mid-terms, semester exams and coaching mock tests. Ranks, grades and report cards are calculated automatically.">
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> New exam</button>
      </PageHead>
      <div className="filters"><BatchSelect value={batch} onChange={setBatch} /></div>
      <Async state={state}>{(rows) => (
        <div className="card">
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Exam</th><th>Batch</th><th>Date</th><th>Subjects</th><th className="num">Entries</th><th className="num">Class avg</th><th>Result</th><th /></tr></thead>
                <tbody>{rows.map((e) => (
                  <tr key={e._id}>
                    <td><Link to={`/exams/${e._id}`} className="cell-title">{e.name}</Link><div className="cell-sub" style={{ textTransform: 'capitalize' }}>{e.type}</div></td>
                    <td>{e.batch?.name}</td>
                    <td>{fmtDate(e.date)}</td>
                    <td className="small text-2">{e.subjects.map((s) => `${s.name} (${s.maxMarks})`).join(', ')}</td>
                    <td className="num">{e.entries}</td>
                    <td className="num"><PctBadge value={e.average} warnBelow={50} badBelow={35} /></td>
                    <td>{e.published ? <Badge tone="good">Published</Badge> : <Badge>Draft</Badge>}</td>
                    <td className="nowrap">
                      <Link className="btn btn-sm" to={`/exams/${e._id}`}>Marks</Link>
                      <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(e)} aria-label="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="No exams yet." />}
        </div>
      )}</Async>
      {adding && <ExamForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload() }} />}
      {deleting && <Confirm text={`Delete ${deleting.name} and all its marks?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await run(() => api.del(`/exams/${deleting._id}`), 'Deleted.')) { setDeleting(null); state.reload() } }} />}
    </>
  )
}
