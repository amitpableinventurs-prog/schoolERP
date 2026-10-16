import { useState } from 'react'
import { CheckCheck, Save } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { today } from '../../lib/format.js'
import { Async, BatchSelect, Empty, PageHead, PctBadge, Tabs, useAction, useApi, useBatches } from '../../components/ui.jsx'

function MarkAttendance({ batch, date }) {
  const state = useApi(batch ? `/attendance${qs({ batch, date })}` : null, { skip: !batch })
  if (!batch) return <Empty text="Choose a class or batch to mark attendance." />
  // Keyed by load so the sheet re-initialises from fresh data after each save.
  return <Async state={state}>{(d) => <MarkSheet key={state.version} data={d} batch={batch} date={date} onSaved={state.reload} />}</Async>
}

function MarkSheet({ data: d, batch, date, onSaved }) {
  const [marks, setMarks] = useState(() => Object.fromEntries(d.students.map((s) => [s._id, s.status || 'P'])))
  const [run, busy] = useAction()

  const save = async () => {
    const ok = await run(
      () => api.post('/attendance', { batch, date, records: Object.entries(marks).map(([student, status]) => ({ student, status })) }),
      'Attendance saved. Absent alerts go out with the next automation run.'
    )
    if (ok) onSaved()
  }

  const counts = Object.values(marks).reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {})
  return (
    <div className="card">
      <div className="card-head">
        <div className="row">
          <span className="badge badge-good">Present {counts.P || 0}</span>
          <span className="badge badge-bad">Absent {counts.A || 0}</span>
          <span className="badge badge-warn">Leave {counts.L || 0}</span>
          {d.alreadyMarked && <span className="small muted">Already marked — saving will update it.</span>}
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => setMarks(Object.fromEntries(d.students.map((s) => [s._id, 'P'])))}><CheckCheck size={14} /> All present</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !d.students.length}><Save size={14} /> Save attendance</button>
        </div>
      </div>
      {d.students.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Roll</th><th>Student</th><th className="num">Last 30 days</th><th>Mark</th></tr></thead>
            <tbody>{d.students.map((s) => (
              <tr key={s._id}>
                <td className="mono">{s.rollNo}</td>
                <td><div className="cell-title">{s.name}</div><div className="cell-sub">{s.admissionNo}</div></td>
                <td className="num"><PctBadge value={s.pct30} /></td>
                <td>
                  <div className="att-btns" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                    {[['P', 'Present'], ['A', 'Absent'], ['L', 'Leave']].map(([v, label]) => (
                      <button key={v} type="button" title={label} aria-pressed={marks[s._id] === v} className={`att-btn ${v} ${marks[s._id] === v ? 'on' : ''}`} onClick={() => setMarks({ ...marks, [s._id]: v })}>{v}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty text="No active students in this batch." />}
    </div>
  )
}

function Register({ batch }) {
  const [month, setMonth] = useState(today().slice(0, 7))
  const state = useApi(batch ? `/attendance/report${qs({ batch, month })}` : null, { skip: !batch })
  if (!batch) return <Empty text="Choose a class or batch to see the register." />
  return (
    <>
      <div className="filters"><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 180 }} /></div>
      <Async state={state}>{(d) => (
        <div className="card">
          {d.dates.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th>{d.dates.map((dt) => <th key={dt} className="att-cell">{dt.slice(8)}</th>)}<th className="num">%</th></tr></thead>
                <tbody>{d.students.map((s) => (
                  <tr key={s._id}>
                    <td className="nowrap"><span className="muted mono">{s.rollNo}.</span> {s.name}</td>
                    {d.dates.map((dt) => <td key={dt} className={`att-cell ${s.days[dt] || ''}`}>{s.days[dt] || '·'}</td>)}
                    <td className="num"><PctBadge value={s.pct} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="No attendance recorded in this month." />}
        </div>
      )}</Async>
    </>
  )
}

export default function Attendance() {
  const batches = useBatches()
  const [picked, setBatch] = useState('')
  const batch = picked || batches[0]?._id || ''
  const [date, setDate] = useState(today())
  const [tab, setTab] = useState('mark')

  return (
    <>
      <PageHead title="Attendance" subtitle="Mark daily attendance. Parents of absent students get an automatic WhatsApp alert." />
      <div className="filters">
        <BatchSelect value={batch} onChange={setBatch} allLabel="Select batch…" />
        {tab === 'mark' && <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />}
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'mark', label: 'Mark attendance' }, { value: 'register', label: 'Monthly register' }]} />
      {tab === 'mark' ? <MarkAttendance batch={batch} date={date} /> : <Register batch={batch} />}
    </>
  )
}
