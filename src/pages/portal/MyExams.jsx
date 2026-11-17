import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, FileBadge, GraduationCap } from 'lucide-react'
import { fmtDate, timeRange, weekday } from '../../lib/format.js'
import { Async, Badge, Empty, PageHead, PctBadge, Segmented, useApi } from '../../components/ui.jsx'
import { PrintBar } from '../../components/Documents.jsx'
import { AdmitCardDoc } from '../../components/ExamDocs.jsx'
import { useScope } from '../../lib/scope.jsx'

const ADMIT = {
  held: ['bad', 'Admit card on hold: fees overdue. Please contact the accounts office.'],
  'not-released': ['', 'Admit card not released yet'],
}
const STATUS = { ongoing: ['warn', 'Going on'], upcoming: ['info', 'Upcoming'], unscheduled: ['', 'Dates not announced'], completed: ['good', 'Completed'] }
const TYPE = { unit: 'Unit test', mid: 'Mid term', final: 'Final exam', mock: 'Mock test' }

function DateSheet({ subjects }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th className="num">Max marks</th><th>Room</th></tr></thead>
        <tbody>{subjects.map((p) => (
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
  )
}

// Every exam of the session: date sheets and admit cards of coming ones, results of
// finished ones.
export default function MyExams() {
  const { api, to, my } = useScope()
  const state = useApi(`${api}/exams`)
  const [view, setView] = useState('coming')
  return (
    <>
      <PageHead title={my('exams')} subtitle="Date sheets, admit cards and results of this session's exams.">
        <Link className="btn" to={to('results')}><GraduationCap size={15} /> Results &amp; report cards</Link>
      </PageHead>
      <Async state={state}>{(list) => {
        const coming = list.filter((x) => x.status !== 'completed')
        const done = list.filter((x) => x.status === 'completed')
        const shown = view === 'coming' ? coming : done
        return (
          <>
            <div className="filters">
              <Segmented value={view} onChange={setView} options={[{ value: 'coming', label: `Upcoming (${coming.length})` }, { value: 'done', label: `Completed (${done.length})` }]} />
            </div>
            {shown.length ? (
              <div className="stack">
                {shown.map(({ exam, admit, status, result, resultPending }) => (
                  <div className="card card-pad stack" key={exam._id}>
                    <div className="row between" style={{ alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <h2>{exam.name}</h2>
                        <div className="small muted">{[TYPE[exam.type], exam.term, exam.date && (exam.endDate && exam.endDate !== exam.date ? `${fmtDate(exam.date)} – ${fmtDate(exam.endDate)}` : fmtDate(exam.date))].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="row">
                        <Badge tone={STATUS[status][0]}>{STATUS[status][1]}</Badge>
                        {admit === 'ready' && <Link className="btn btn-primary btn-sm" to={to(`exams/${exam._id}/admit-card`)}><FileBadge size={14} /> Admit card</Link>}
                        {result && <Link className="btn btn-sm" to={to(`results/${exam._id}`)}><GraduationCap size={14} /> Report card</Link>}
                      </div>
                    </div>
                    {admit && admit !== 'ready' && <div className={`alert small ${admit === 'held' ? 'alert-error' : 'alert-info'}`}>{ADMIT[admit][1]}</div>}
                    {result ? (
                      <div className="row" style={{ gap: 16 }}>
                        <span>Score <strong>{result.total ?? '—'}/{result.max ?? '—'}</strong></span>
                        <PctBadge value={result.percent} warnBelow={50} badBelow={35} />
                        {result.grade && <span>Grade <strong>{result.grade}</strong></span>}
                        {result.rank && <span>Rank <strong>{result.rank}</strong></span>}
                      </div>
                    ) : resultPending ? <div className="small muted">Result not published yet.</div> : null}
                    {status !== 'completed' && exam.subjects.length > 0 && <DateSheet subjects={exam.subjects} />}
                  </div>
                ))}
              </div>
            ) : <Empty icon={CalendarCheck} text={view === 'coming' ? 'No upcoming exams have been scheduled yet. They appear here as soon as the school publishes the date sheet.' : 'No completed exams this session yet.'} />}
          </>
        )
      }}</Async>
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
      <Async state={state}>{(d) => (d.students?.[0] ? <div className="doc-scroll"><AdmitCardDoc exam={d.exam} student={d.students[0].student} institute={d.institute} /></div> : <Empty text="Admit card not available." />)}</Async>
    </>
  )
}
