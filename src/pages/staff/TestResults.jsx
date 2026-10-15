import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Trophy } from 'lucide-react'
import { fmtDateTime } from '../../lib/format.js'
import { Async, Empty, PctBadge, StatTile, useApi } from '../../components/ui.jsx'

export default function TestResults() {
  const { id } = useParams()
  const state = useApi(`/tests/${id}/results`)
  return (
    <Async state={state}>{({ test, attempts, accuracy }) => {
      const total = test.questions.reduce((s, q) => s + q.marks, 0)
      const avg = attempts.length ? attempts.reduce((s, a) => s + a.score, 0) / attempts.length : null
      return (
        <>
          <div className="row mb"><Link to="/tests" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Tests</Link></div>
          <div className="page-head"><div><h1>{test.title}</h1><p>{test.batch?.name} · {test.questions.length} questions · {total} marks · {test.durationMin} min</p></div></div>
          <div className="grid grid-3 mb">
            <StatTile label="Attempts" value={attempts.length} />
            <StatTile label="Average score" value={avg != null ? `${avg.toFixed(1)} / ${total}` : '—'} />
            <StatTile icon={Trophy} label="Top score" value={attempts[0] ? `${attempts[0].score} / ${total}` : '—'} foot={attempts[0]?.student?.name} tone="good" />
          </div>
          <div className="grid grid-2">
            <div className="card">
              <div className="card-head"><h2>Rank list</h2></div>
              {attempts.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th className="num">Rank</th><th>Student</th><th className="num">Correct</th><th className="num">Wrong</th><th className="num">Score</th><th>Submitted</th></tr></thead>
                    <tbody>{attempts.map((a, i) => (
                      <tr key={a._id}>
                        <td className="num">{i + 1}</td>
                        <td>{a.student?.name}<div className="cell-sub">{a.student?.admissionNo}</div></td>
                        <td className="num">{a.correct}</td>
                        <td className="num">{a.wrong}</td>
                        <td className="num"><strong>{a.score}</strong></td>
                        <td className="small">{fmtDateTime(a.submittedAt)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <Empty text="No one has taken this test yet." />}
            </div>
            <div className="card">
              <div className="card-head"><h2>Question accuracy</h2><span className="sub">Low % = topic needs revision</span></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>#</th><th>Question</th><th className="num">Correct</th></tr></thead>
                  <tbody>{accuracy.map((q) => (
                    <tr key={q.index}><td>{q.index + 1}</td><td className="small">{q.q}</td><td className="num"><PctBadge value={q.correctPct} warnBelow={60} badBelow={40} /></td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )
    }}</Async>
  )
}
