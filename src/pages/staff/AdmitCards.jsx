import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, money } from '../../lib/format.js'
import { Async, BatchSelect, Badge, Empty, PageHead, useAction, useApi } from '../../components/ui.jsx'
import { AdmitCardDoc } from '../../components/ExamDocs.jsx'

export default function AdmitCards() {
  const { id } = useParams()
  const state = useApi(`/exams/${id}/admit-cards`)
  return <Async state={state}>{(data) => <AdmitCardsView key={state.version} data={data} reload={state.reload} />}</Async>
}

function AdmitCardsView({ data, reload }) {
  const { exam, institute, students } = data
  // Held cards are left out of printing unless ticked by hand.
  const [picked, setPicked] = useState(() => new Set(students.filter((s) => !s.held).map((s) => s.student._id)))
  const [run, busy] = useAction()
  const unscheduled = exam.subjects.filter((s) => !s.date)
  const toggle = (sid) => setPicked((p) => { const n = new Set(p); n.has(sid) ? n.delete(sid) : n.add(sid); return n })
  const save = async (patch, msg) => { if (await run(() => api.put(`/exams/${exam._id}/admit-cards`, patch), msg)) reload() }
  const allowAnyway = (sid, on) => save({ admitAllowed: on ? [...(exam.admitAllowed || []), sid] : (exam.admitAllowed || []).filter((x) => String(x) !== sid) }, on ? 'Allowed despite dues.' : 'Back on hold.')
  const printing = students.filter((s) => picked.has(s.student._id))
  const held = students.filter((s) => s.held).length

  return (
    <>
      <div className="no-print">
        <div className="row mb"><Link to={`/exams/${exam._id}`} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> {exam.name}</Link></div>
        <PageHead title={`Admit cards · ${exam.name}`} subtitle={`${exam.batch.name} · ${students.length} students${held ? ` · ${held} on hold for overdue fees` : ''}`}>
          <button className="btn" onClick={() => save({ holdOnDues: !exam.holdOnDues }, exam.holdOnDues ? 'Cards no longer held for dues.' : 'Cards of students with overdue fees are now held.')} disabled={busy}>
            {exam.holdOnDues ? 'Stop holding for dues' : 'Hold if fees overdue'}
          </button>
          <button className="btn" onClick={() => save({ admitCards: !exam.admitCards }, exam.admitCards ? 'Admit cards hidden from the portal.' : 'Released. Students and parents can download them.')} disabled={busy || (!exam.admitCards && unscheduled.length > 0)}>
            {exam.admitCards ? 'Hide from portal' : 'Release to portal'}
          </button>
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!printing.length}><Printer size={15} /> Print {printing.length}</button>
        </PageHead>
        {unscheduled.length > 0 && <div className="alert mb">Schedule {unscheduled.map((s) => s.name).join(', ')} (date and time) before releasing admit cards. Use <Link to={`/exams/${exam._id}`}>Edit / schedule</Link> on the marks page.</div>}
        <div className="row mb" style={{ gap: 6 }}>
          {exam.admitCards ? <Badge tone="good">Released to portal</Badge> : <Badge>Not released</Badge>}
          {exam.holdOnDues && <Badge tone="warn">Held while fees are overdue</Badge>}
        </div>
        <div className="card mb">
          {students.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th><input type="checkbox" checked={picked.size === students.length} onChange={(e) => setPicked(new Set(e.target.checked ? students.map((s) => s.student._id) : []))} aria-label="Select all" /></th>
                  <th>Roll</th><th>Student</th><th className="num">Overdue fees</th><th>Status</th><th />
                </tr></thead>
                <tbody>{students.map(({ student, overdue, held: isHeld, allowed }) => (
                  <tr key={student._id}>
                    <td><input type="checkbox" checked={picked.has(student._id)} onChange={() => toggle(student._id)} aria-label={`Print ${student.name}`} /></td>
                    <td className="mono">{student.rollNo ?? '—'}</td>
                    <td className="cell-title">{student.name}<div className="cell-sub">{student.admissionNo}</div></td>
                    <td className="num">{overdue ? money(overdue) : '—'}</td>
                    <td>{isHeld ? <Badge tone="bad">On hold</Badge> : allowed && overdue ? <Badge tone="warn">Allowed by staff</Badge> : <Badge tone="good">Eligible</Badge>}</td>
                    <td>{exam.holdOnDues && overdue > 0 && <button className="btn btn-sm" onClick={() => allowAnyway(student._id, !allowed)} disabled={busy}>{allowed ? 'Hold again' : 'Allow anyway'}</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="No active students in this batch." />}
        </div>
      </div>
      <div className="doc-stack">
        {printing.map(({ student }) => <AdmitCardDoc key={student._id} exam={exam} student={student} institute={institute} />)}
      </div>
    </>
  )
}

// Menu entry: pick the exam whose admit cards to print or release.
export function AdmitCardsIndex() {
  const [batch, setBatch] = useState('')
  const state = useApi(`/exams${qs({ batch })}`)
  return (
    <>
      <PageHead title="Admit cards" subtitle="Choose an exam to print admit cards, release them to the student portal or hold them for overdue fees." />
      <div className="filters"><BatchSelect value={batch} onChange={setBatch} /></div>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Exam</th><th>Batch</th><th>Starts</th><th>Date sheet</th><th>Admit cards</th><th /></tr></thead>
              <tbody>{rows.map((e) => {
                const ready = e.subjects.length > 0 && e.subjects.every((s) => s.date)
                return (
                  <tr key={e._id}>
                    <td className="cell-title">{e.name}<div className="cell-sub">{e.term}</div></td>
                    <td>{e.batch?.name}</td>
                    <td>{fmtDate(e.date)}</td>
                    <td>{ready ? <Badge tone="good">Complete</Badge> : <Badge tone="warn">Incomplete</Badge>}</td>
                    <td>{e.admitCards ? <Badge tone="info">Released{e.holdOnDues ? ' · dues hold' : ''}</Badge> : <Badge>Not released</Badge>}</td>
                    <td><Link className="btn btn-sm" to={`/exams/${e._id}/admit-cards`}>Open</Link></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty text="No exams yet." />}</Async>
    </>
  )
}
