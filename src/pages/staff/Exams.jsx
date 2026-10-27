import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FileBadge, FileStack, Pencil, Plus, Scale, Trash2 } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, today } from '../../lib/format.js'
import { Async, BatchSelect, Badge, Confirm, Empty, Field, Modal, PageHead, PctBadge, useAction, useApi, useBatches } from '../../components/ui.jsx'

const blankPaper = (name = '', maxMarks = 100) => ({ name, maxMarks, passMarks: '', date: '', start: '', end: '', room: '', invigilator: '' })

// Create or edit an exam: details, grade scale, and each subject's paper (marks + date sheet slot).
export function ExamForm({ exam, onClose, onSaved }) {
  const batches = useBatches()
  const scales = useApi('/exams/grade-scales')
  const staff = useApi('/exams/invigilators')
  const [form, setForm] = useState(() => ({
    name: exam?.name || '', batch: exam?.batch?._id || exam?.batch || '', type: exam?.type || 'unit', term: exam?.term || '',
    date: exam?.date || today(), gradeScale: exam?.gradeScale || '', instructions: exam?.instructions || '',
  }))
  const [papers, setPapers] = useState(() => (exam?.subjects || []).map((s) => ({ ...blankPaper(), ...s, passMarks: s.passMarks ?? '', invigilator: s.invigilator?._id || s.invigilator || '' })))
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setPaper = (i, patch) => setPapers(papers.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const pickBatch = (id) => {
    setForm({ ...form, batch: id })
    const b = batches.find((x) => x._id === id)
    setPapers((b?.subjects || []).map((name) => blankPaper(name, form.type === 'unit' ? 25 : 100)))
  }
  // Fills the date sheet: one paper a day from the first paper's date (Sundays skipped), same timing.
  const autoDates = () => {
    const first = papers[0]
    if (!first?.date) return
    let d = new Date(`${first.date}T00:00:00`)
    setPapers(papers.map((p, i) => {
      if (i > 0) {
        d = new Date(d.getTime() + 86_400_000)
        if (d.getDay() === 0) d = new Date(d.getTime() + 86_400_000)
      }
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { ...p, date, start: p.start || first.start, end: p.end || first.end, room: p.room || first.room }
    }))
  }

  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, subjects: papers.filter((p) => p.name) }
    const saved = await run(() => (exam ? api.put(`/exams/${exam._id}`, body) : api.post('/exams', body)), exam ? 'Exam updated.' : 'Exam created. Enter marks after the papers.')
    if (saved) onSaved(saved)
  }

  return (
    <Modal size="lg" title={exam ? `Edit ${exam.name}` : 'New exam'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="exam-form" disabled={busy}>{exam ? 'Save' : 'Create'}</button></>}>
      <form id="exam-form" className="form-grid" onSubmit={submit}>
        <Field label="Exam name *"><input className="input" value={form.name} onChange={set('name')} placeholder="Half Yearly / Unit Test 2 / Mock Test 3" required /></Field>
        <Field label="Class / batch *">
          {exam ? <input className="input" value={exam.batch?.name || ''} disabled /> : <BatchSelect value={form.batch} onChange={pickBatch} allLabel="Select…" required />}
        </Field>
        <Field label="Type">
          <select className="select" value={form.type} onChange={set('type')}>
            <option value="unit">Unit test / periodic</option><option value="mid">Mid term / half yearly / internal</option><option value="final">Final / annual / semester</option><option value="mock">Mock test (coaching)</option>
          </select>
        </Field>
        <Field label="Term" hint="Used to group exams on term report cards."><input className="input" value={form.term} onChange={set('term')} placeholder="Term 1 / Semester 3" /></Field>
        <Field label="Grade scale" hint="Empty = the default scale of this wing.">
          <select className="select" value={form.gradeScale || ''} onChange={set('gradeScale')}>
            <option value="">Wing default</option>
            {(scales.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Date" hint="Set automatically from the first paper when the date sheet is filled."><input className="input" type="date" value={form.date} onChange={set('date')} /></Field>
        <div className="full">
          <div className="row between" style={{ marginBottom: 6 }}>
            <strong className="small">Papers &amp; date sheet</strong>
            {papers.length > 1 && <button type="button" className="btn btn-sm btn-ghost" onClick={autoDates} disabled={!papers[0]?.date} title="Fill the first paper's date and time first"><CalendarDays size={13} /> One paper a day from the first</button>}
          </div>
          {papers.length > 0 && (
            <div className="paper-row paper-head"><span>Subject</span><span>Max</span><span>Pass</span><span>Date</span><span>From</span><span>To</span><span>Room</span><span>Invigilator</span><span /></div>
          )}
          {papers.length ? papers.map((p, i) => (
            <div className="paper-row" key={i}>
              <input className="input" value={p.name} onChange={(e) => setPaper(i, { name: e.target.value })} aria-label="Subject" placeholder="Subject" />
              <input className="input" type="number" min="1" value={p.maxMarks} onChange={(e) => setPaper(i, { maxMarks: Number(e.target.value) })} aria-label="Max marks" />
              <input className="input" type="number" min="0" value={p.passMarks} onChange={(e) => setPaper(i, { passMarks: e.target.value })} aria-label="Pass marks" placeholder="auto" />
              <input className="input" type="date" value={p.date || ''} onChange={(e) => setPaper(i, { date: e.target.value })} aria-label="Date" />
              <input className="input" type="time" value={p.start || ''} onChange={(e) => setPaper(i, { start: e.target.value })} aria-label="Start time" />
              <input className="input" type="time" value={p.end || ''} onChange={(e) => setPaper(i, { end: e.target.value })} aria-label="End time" />
              <input className="input" value={p.room || ''} onChange={(e) => setPaper(i, { room: e.target.value })} aria-label="Room" placeholder="Room" />
              <select className="select" value={p.invigilator || ''} onChange={(e) => setPaper(i, { invigilator: e.target.value })} aria-label="Invigilator">
                <option value="">—</option>
                {(staff.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setPapers(papers.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></button>
            </div>
          )) : <div className="small muted">{exam ? 'No papers.' : 'Select a batch to load its subjects.'}</div>}
          {(form.batch || exam) && <button type="button" className="btn btn-sm" onClick={() => setPapers([...papers, blankPaper()])}><Plus size={13} /> Paper</button>}
          <p className="small muted" style={{ marginTop: 6 }}>Pass marks left empty use the grade scale&apos;s pass %. Clashes (same class, room or invigilator at the same time) are blocked when you save.</p>
        </div>
        <Field label="Admit card instructions" hint="One rule per line. Empty = standard rules." full>
          <textarea className="textarea" rows={3} value={form.instructions} onChange={set('instructions')} />
        </Field>
      </form>
    </Modal>
  )
}

const scheduled = (e) => e.subjects.length > 0 && e.subjects.every((s) => s.date)

export default function Exams() {
  const [batch, setBatch] = useState('')
  const state = useApi(`/exams${qs({ batch })}`)
  const [editing, setEditing] = useState(null) // {} = new
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()

  return (
    <>
      <PageHead title="Examinations" subtitle="Exams with a subject-wise date sheet, marks entry, grades and pass/fail, report cards and admit cards.">
        <Link className="btn" to="/exams/schedule"><CalendarDays size={15} /> Date sheet</Link>
        <Link className="btn" to="/exams/term-report"><FileStack size={15} /> Term reports</Link>
        <Link className="btn" to="/exams/grades"><Scale size={15} /> Grade system</Link>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> New exam</button>
      </PageHead>
      <div className="filters"><BatchSelect value={batch} onChange={setBatch} /></div>
      <Async state={state}>{(rows) => (
        <div className="card">
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Exam</th><th>Batch</th><th>Date</th><th>Papers</th><th className="num">Entries</th><th className="num">Class avg</th><th>Status</th><th /></tr></thead>
                <tbody>{rows.map((e) => (
                  <tr key={e._id}>
                    <td><Link to={`/exams/${e._id}`} className="cell-title">{e.name}</Link><div className="cell-sub" style={{ textTransform: 'capitalize' }}>{[e.type, e.term].filter(Boolean).join(' · ')}</div></td>
                    <td>{e.batch?.name}</td>
                    <td className="nowrap">{fmtDate(e.date)}</td>
                    <td className="small text-2">{e.subjects.map((s) => `${s.name} (${s.maxMarks})`).join(', ')}{!scheduled(e) && <div><Badge tone="warn">Date sheet incomplete</Badge></div>}</td>
                    <td className="num">{e.entries}</td>
                    <td className="num"><PctBadge value={e.average} warnBelow={50} badBelow={35} /></td>
                    <td className="stack" style={{ gap: 4 }}>
                      {e.published ? <Badge tone="good">Result published</Badge> : <Badge>Result draft</Badge>}
                      {e.admitCards && <Badge tone="info">Admit cards out</Badge>}
                    </td>
                    <td className="nowrap">
                      <Link className="btn btn-sm" to={`/exams/${e._id}`}>Marks</Link>
                      <Link className="btn btn-sm btn-ghost" to={`/exams/${e._id}/admit-cards`} title="Admit cards"><FileBadge size={14} /></Link>
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(e)} aria-label="Edit"><Pencil size={14} /></button>
                      <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(e)} aria-label="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="No exams yet." />}
        </div>
      )}</Async>
      {editing && <ExamForm exam={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload() }} />}
      {deleting && <Confirm text={`Delete ${deleting.name} and all its marks?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await run(() => api.del(`/exams/${deleting._id}`), 'Deleted.')) { setDeleting(null); state.reload() } }} />}
    </>
  )
}
