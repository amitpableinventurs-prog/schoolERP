import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, FileBadge, FileStack, Pencil, Save, Sparkles } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDate } from '../../lib/format.js'
import { AiNotice, Async, Badge, Empty, PctBadge, useAction, useAiStatus, useApi, useToast } from '../../components/ui.jsx'
import { ExamForm } from './Exams.jsx'

export default function ExamMarks() {
  const { id } = useParams()
  const state = useApi(`/exams/${id}/marks`)
  const aiEnabled = useAiStatus()
  // Keyed by load so the sheet re-initialises from fresh data after each save.
  return <Async state={state}>{(data) => <MarksSheet key={state.version} id={id} data={data} aiEnabled={aiEnabled} onSaved={state.reload} />}</Async>
}

const initialGrid = (rows) => Object.fromEntries(rows.map((row) => [row.student._id, Object.fromEntries((row.mark?.scores || []).map((s) => [s.subject, s.absent ? 'AB' : String(s.marks ?? '')]))]))
const RESULT = { pass: ['good', 'Pass'], fail: ['bad', 'Fail'], absent: ['warn', 'Absent'] }
const passMarkOf = (s, scale) => s.passMarks ?? Math.ceil((s.maxMarks * (scale?.passPercent ?? 35)) / 100)
const initialRemarks = (rows) => Object.fromEntries(rows.map((row) => [row.student._id, row.mark?.remark || '']))

function MarksSheet({ id, data, aiEnabled, onSaved }) {
  const { exam, rows, scale } = data
  const [editing, setEditing] = useState(false)
  const [grid, setGrid] = useState(() => initialGrid(rows))
  const [remarks, setRemarks] = useState(() => initialRemarks(rows))
  const [dirty, setDirty] = useState(false)
  const [run, busy] = useAction()
  const toast = useToast()

  const buildRows = () => Object.entries(grid).map(([student, scores]) => ({
    student,
    scores: Object.entries(scores).map(([subject, marks]) => (marks === 'AB' ? { subject, absent: true } : { subject, marks: marks === '' || marks === 'A' ? null : Number(marks) })),
    remark: remarks[student],
  }))

  const save = async () => {
    if (await run(() => api.put(`/exams/${id}/marks`, { rows: buildRows() }), 'Marks saved. Ranks and grades updated.')) onSaved()
  }

  // Unsaved marks are saved first so the AI sees the latest numbers.
  const aiRemarks = async () => {
    if (dirty && !(await run(() => api.put(`/exams/${id}/marks`, { rows: buildRows() })))) return
    const r = await run(() => api.post(`/exams/${id}/ai-remarks`))
    if (r) {
      toast(`AI wrote ${r.updated} remarks. Review and edit them before publishing.`)
      onSaved()
    }
  }

  const togglePublish = async () => {
    if (await run(() => api.put(`/exams/${id}`, { published: !exam.published }), exam.published ? 'Result hidden from students.' : 'Result published. Students can see it; parents get it with the next automation run.')) onSaved()
  }

  return (
    <>
        <div className="row mb"><Link to="/exams" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Exams</Link></div>
        <div className="page-head">
          <div>
            <h1>{exam.name} <Badge tone={exam.published ? 'good' : undefined}>{exam.published ? 'Published' : 'Draft'}</Badge></h1>
            <p>{exam.batch.name} · {fmtDate(exam.date)}{exam.term ? ` · ${exam.term}` : ''} · Grade scale: {scale?.name}</p>
          </div>
          <div className="page-actions">
            <button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Edit / schedule</button>
            <Link className="btn" to={`/exams/${exam._id}/admit-cards`}><FileBadge size={15} /> Admit cards</Link>
            <Link className="btn" to={`/exams/${exam._id}/report-cards`}><FileStack size={15} /> All report cards</Link>
            <button className="btn btn-ai" onClick={aiRemarks} disabled={busy || aiEnabled === false}><Sparkles size={15} /> AI remarks</button>
            <button className="btn" onClick={togglePublish} disabled={busy}>{exam.published ? <><EyeOff size={15} /> Unpublish</> : <><Eye size={15} /> Publish result</>}</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}><Save size={15} /> {dirty ? 'Save marks*' : 'Save marks'}</button>
          </div>
        </div>
        <AiNotice enabled={aiEnabled} />
        <p className="small muted mt">Type marks, or <strong>AB</strong> for absent. Marks below the pass mark are shown in red.</p>
        <div className="card mt">
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    {exam.subjects.map((s) => <th key={s.name} className="num">{s.name}<div className="cell-sub">/{s.maxMarks} · pass {passMarkOf(s, scale)}</div></th>)}
                    <th className="num">%</th><th>Grade</th><th>Result</th><th className="num">Rank</th><th>Remark</th><th />
                  </tr>
                </thead>
                <tbody>{rows.map(({ student, mark }) => (
                  <tr key={student._id}>
                    <td className="nowrap"><span className="muted mono">{student.rollNo}.</span> {student.name}</td>
                    {exam.subjects.map((s) => {
                      const v = grid[student._id]?.[s.name] ?? ''
                      const low = v === 'AB' || (v !== '' && v !== 'A' && Number(v) < passMarkOf(s, scale))
                      return (
                        <td key={s.name} className="num">
                          <input
                            className="input mono"
                            inputMode="decimal"
                            style={{ width: 72, textAlign: 'right', color: low ? 'var(--bad-text)' : undefined }}
                            value={v}
                            aria-label={`${s.name} marks for ${student.name}`}
                            onChange={(e) => {
                              const raw = e.target.value.trim().toUpperCase()
                              if (!/^(A|AB|\d*\.?\d*)$/.test(raw) || Number(raw) > s.maxMarks) return
                              setDirty(true)
                              setGrid({ ...grid, [student._id]: { ...grid[student._id], [s.name]: raw } })
                            }}
                          />
                        </td>
                      )
                    })}
                    <td className="num"><PctBadge value={mark?.percent} warnBelow={50} badBelow={35} /></td>
                    <td>{mark?.grade || '—'}</td>
                    <td>{mark?.result ? <Badge tone={RESULT[mark.result][0]} title={mark.failedIn?.length ? `Below pass marks: ${mark.failedIn.join(', ')}` : undefined}>{RESULT[mark.result][1]}</Badge> : '—'}</td>
                    <td className="num">{mark?.rank || '—'}</td>
                    <td style={{ minWidth: 240 }}>
                      <textarea className="textarea small" style={{ minHeight: 38 }} value={remarks[student._id] || ''} onChange={(e) => { setDirty(true); setRemarks({ ...remarks, [student._id]: e.target.value }) }} aria-label={`Remark for ${student.name}`} />
                    </td>
                    <td>{mark && <Link className="btn btn-sm" to={`/exams/${exam._id}/report/${student._id}`}>Report</Link>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="No students in this batch." />}
        </div>
      {editing && <ExamForm exam={exam} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onSaved() }} />}
    </>
  )
}
