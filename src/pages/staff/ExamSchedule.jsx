import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Printer } from 'lucide-react'
import { qs } from '../../lib/api.js'
import { fmtDate, timeRange, weekday } from '../../lib/format.js'
import { Async, BatchSelect, Badge, Empty, PageHead, useApi } from '../../components/ui.jsx'

// Date sheet across every exam: one row per paper, grouped by day, clashes highlighted.
export default function ExamSchedule() {
  const [batch, setBatch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const state = useApi(`/exams/schedule${qs({ batch, from, to })}`)

  return (
    <>
      <div className="row mb no-print"><Link to="/exams" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Examinations</Link></div>
      <PageHead title="Date sheet" subtitle="Every scheduled paper by date. Same class, room or invigilator at the same time is flagged as a clash.">
        <button className="btn no-print" onClick={() => window.print()}><Printer size={15} /> Print</button>
      </PageHead>
      <div className="filters no-print">
        <BatchSelect value={batch} onChange={setBatch} />
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
      </div>
      <Async state={state}>{({ rows, unscheduled }) => {
        const clashes = rows.filter((r) => r.clashes.length).length
        let lastDate = null
        return (
          <>
            {clashes > 0 && <div className="alert alert-error mb"><AlertTriangle size={15} /> {clashes} paper(s) clash. Open the exam and change the time, room or invigilator.</div>}
            {unscheduled.length > 0 && (
              <div className="alert mb no-print">
                Not on the date sheet yet: {unscheduled.map((u, i) => <span key={u._id}>{i > 0 && '; '}<Link to={`/exams/${u._id}`}>{u.name} ({u.batch?.name})</Link> – {u.missing.join(', ')}</span>)}
              </div>
            )}
            <div className="card">
              {rows.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Date</th><th>Time</th><th>Class / batch</th><th>Exam</th><th>Subject</th><th className="num">Max</th><th>Room</th><th>Invigilator</th></tr></thead>
                    <tbody>{rows.map((r) => {
                      const first = r.paper.date !== lastDate
                      lastDate = r.paper.date
                      return (
                        <tr key={`${r.exam._id}-${r.paper._id}`} className={r.clashes.length ? 'clash-row' : ''}>
                          <td className="nowrap">{first ? <><strong>{fmtDate(r.paper.date)}</strong><div className="cell-sub">{weekday(r.paper.date)}</div></> : null}</td>
                          <td className="nowrap mono">{timeRange(r.paper)}</td>
                          <td>{r.batch?.name}</td>
                          <td><Link to={`/exams/${r.exam._id}`}>{r.exam.name}</Link>{r.exam.admitCards && <div><Badge tone="info">Admit cards out</Badge></div>}</td>
                          <td className="cell-title">{r.paper.name}{r.clashes.map((c) => <div key={c} className="small" style={{ color: 'var(--bad-text)' }}>{c}</div>)}</td>
                          <td className="num">{r.paper.maxMarks}</td>
                          <td>{r.paper.room || '—'}</td>
                          <td>{r.paper.invigilator?.name || '—'}</td>
                        </tr>
                      )
                    })}</tbody>
                  </table>
                </div>
              ) : <Empty text="No papers scheduled in this range. Add dates and times to the papers of an exam." />}
            </div>
          </>
        )
      }}</Async>
    </>
  )
}
