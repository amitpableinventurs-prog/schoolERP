import { Link } from 'react-router-dom'
import { fmtDate } from '../../lib/format.js'
import { Async, Empty, PageHead, PctBadge, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyResults() {
  const { api, to, my } = useScope()
  const state = useApi(`${api}/results`)
  return (
    <>
      <PageHead title={my('results')} subtitle="Published exam results and report cards." />
      <Async state={state}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Exam</th><th>Date</th><th>Subjects</th><th className="num">%</th><th>Grade</th><th className="num">Rank</th><th /></tr></thead>
              <tbody>{rows.map(({ exam, mark }) => (
                <tr key={exam._id}>
                  <td className="cell-title">{exam.name}</td>
                  <td>{fmtDate(exam.date)}</td>
                  <td className="small text-2">{mark.scores.map((s) => `${s.subject}: ${s.marks}`).join(' · ')}</td>
                  <td className="num"><PctBadge value={mark.percent} warnBelow={50} badBelow={35} /></td>
                  <td>{mark.grade}</td>
                  <td className="num">{mark.rank}</td>
                  <td><Link className="btn btn-sm" to={to(`results/${exam._id}`)}>Report card</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty text="No published results yet." />}</Async>
    </>
  )
}
