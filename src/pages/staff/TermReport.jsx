import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { qs } from '../../lib/api.js'
import { fmtDate } from '../../lib/format.js'
import { Async, BatchSelect, Badge, Empty, PageHead, PctBadge, useApi } from '../../components/ui.jsx'
import { TermReportDoc } from '../../components/ExamDocs.jsx'

// Weights suggested by exam type (periodic tests count less than the annual exam).
const DEFAULT_WEIGHT = { unit: 10, mock: 10, mid: 30, final: 60 }

export default function TermReport() {
  const [batch, setBatch] = useState('')
  const exams = useApi(`/exams${qs({ batch })}`, { skip: !batch })
  const [weights, setWeights] = useState({}) // examId → weight; absent = not included
  const [view, setView] = useState(null) // the `exams` spec of the generated report

  const pickBatch = (id) => { setBatch(id); setWeights({}); setView(null) }
  const spec = Object.entries(weights).map(([id, w]) => `${id}:${w}`).join(',')
  const sorted = [...(exams.data || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return (
    <>
      <div className="row mb no-print"><Link to="/exams" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Examinations</Link></div>
      <div className="no-print">
        <PageHead title="Term report cards" subtitle="Combine several exams into one progress report: each subject's % is the weighted average of the chosen exams.">
          {view && <button className="btn btn-primary" onClick={() => window.print()}><Printer size={15} /> Print all</button>}
        </PageHead>
        <div className="filters"><BatchSelect value={batch} onChange={pickBatch} allLabel="Choose class / batch…" /></div>
        {batch && (
          <Async state={exams}>{() => sorted.length ? (
            <div className="card card-pad mb">
              <div className="small muted mb">Tick the exams to include and set their weight (relative; they need not add up to 100).</div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th /><th>Exam</th><th>Term</th><th>Date</th><th className="num">Weight</th></tr></thead>
                  <tbody>{sorted.map((e) => {
                    const on = weights[e._id] != null
                    return (
                      <tr key={e._id}>
                        <td><input type="checkbox" checked={on} onChange={() => { const w = { ...weights }; if (on) delete w[e._id]; else w[e._id] = DEFAULT_WEIGHT[e.type] ?? 10; setWeights(w) }} aria-label={`Include ${e.name}`} /></td>
                        <td className="cell-title">{e.name}{!e.published && <> <Badge>Result draft</Badge></>}</td>
                        <td>{e.term || '—'}</td>
                        <td>{fmtDate(e.date)}</td>
                        <td className="num"><input className="input" type="number" min="0" style={{ width: 80 }} disabled={!on} value={weights[e._id] ?? ''} onChange={(ev) => setWeights({ ...weights, [e._id]: ev.target.value })} aria-label={`Weight of ${e.name}`} /></td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
              <button className="btn btn-primary mt" disabled={!spec} onClick={() => setView(spec)}>Generate report</button>
            </div>
          ) : <Empty text="No exams for this class yet." />}</Async>
        )}
      </div>
      {view && <TermResult batch={batch} spec={view} />}
    </>
  )
}

function TermResult({ batch, spec }) {
  const state = useApi(`/exams/term-report${qs({ batch, exams: spec })}`)
  return (
    <Async state={state}>{(data) => (
      <>
        <div className="card mb no-print">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th className="num">Rank</th><th>Student</th>{data.subjects.map((s) => <th key={s} className="num">{s}</th>)}<th className="num">Overall</th><th>Grade</th><th className="num">GPA</th><th>Result</th></tr></thead>
              <tbody>{[...data.rows].sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999)).map((r) => (
                <tr key={r.student._id}>
                  <td className="num">{r.rank ?? '—'}</td>
                  <td className="cell-title">{r.student.name}<div className="cell-sub">Roll {r.student.rollNo ?? '—'}</div></td>
                  {r.subjects.map((s) => <td key={s.name} className="num">{s.percent ?? '—'}</td>)}
                  <td className="num"><PctBadge value={r.percent} warnBelow={50} badBelow={data.scale.passPercent} /></td>
                  <td>{r.grade || '—'}</td>
                  <td className="num">{r.gpa ?? '—'}</td>
                  <td>{r.result === 'pass' ? <Badge tone="good">Pass</Badge> : r.result === 'fail' ? <Badge tone="bad" title={r.failedIn.join(', ')}>Fail</Badge> : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="doc-stack">
          {data.rows.filter((r) => r.percent != null).map((r) => <TermReportDoc key={r.student._id} data={data} row={r} />)}
        </div>
      </>
    )}</Async>
  )
}
