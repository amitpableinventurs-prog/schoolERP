import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileBadge } from 'lucide-react'
import { fmtDate, timeRange, weekday } from '../../lib/format.js'
import { Async, Badge, Empty, PageHead, useApi } from '../../components/ui.jsx'
import { PrintBar } from '../../components/Documents.jsx'
import { AdmitCardDoc } from '../../components/ExamDocs.jsx'
import { useScope } from '../../lib/scope.jsx'

const ADMIT = {
  ready: null,
  held: ['bad', 'Admit card on hold: fees overdue. Please contact the accounts office.'],
  'not-released': ['', 'Admit card not released yet'],
}

// Upcoming exams: the date sheet of each, with its admit card when released.
export default function MyExams() {
  const { api, to, my } = useScope()
  const state = useApi(`${api}/admit-cards`)
  return (
    <>
      <PageHead title={my('exams')} subtitle="Date sheet of upcoming exams and admit cards." />
      <Async state={state}>{(list) => list.length ? (
        <div className="stack">
          {list.map(({ exam, admit }) => (
            <div className="card card-pad stack" key={exam._id}>
              <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div><h2>{exam.name}</h2><div className="small muted">{[exam.term, `from ${fmtDate(exam.date)}`].filter(Boolean).join(' · ')}</div></div>
                {admit === 'ready'
                  ? <Link className="btn btn-primary" to={to(`exams/${exam._id}/admit-card`)}><FileBadge size={15} /> Admit card</Link>
                  : <Badge tone={ADMIT[admit][0]}>{ADMIT[admit][1]}</Badge>}
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th className="num">Max marks</th><th>Room</th></tr></thead>
                  <tbody>{exam.subjects.map((p) => (
                    <tr key={p._id}>
                      <td className="nowrap">{p.date ? <>{fmtDate(p.date)}<div className="cell-sub">{weekday(p.date)}</div></> : 'To be announced'}</td>
                      <td className="nowrap mono">{timeRange(p)}</td>
                      <td className="cell-title">{p.name}</td>
                      <td className="num">{p.maxMarks}</td>
                      <td>{p.room || '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty text="No upcoming exams." />}</Async>
    </>
  )
}

export function MyAdmitCard() {
  const { exam } = useParams()
  const { api, to } = useScope()
  const state = useApi(`${api}/admit-cards/${exam}`)
  return (
    <>
      <PrintBar back={<Link to={to('exams')} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Exams</Link>} />
      <Async state={state}>{(d) => <AdmitCardDoc exam={d.exam} student={d.students[0].student} institute={d.institute} />}</Async>
    </>
  )
}
