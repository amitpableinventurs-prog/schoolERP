import { fmtDate } from '../../lib/format.js'
import { Async, Empty, PageHead, StatTile, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyAttendance() {
  const { api, my } = useScope()
  const state = useApi(`${api}/attendance`)
  return (
    <>
      <PageHead title={my('attendance')} subtitle="Minimum 75% attendance is required." />
      <Async state={state}>{({ rows, summary }) => (
        <>
          <div className="grid grid-4 mb">
            <StatTile label="Attendance" value={summary ? `${summary.pct}%` : '—'} tone={summary?.pct < 75 ? 'bad' : 'good'} />
            <StatTile label="Present" value={summary?.present ?? 0} />
            <StatTile label="Absent" value={summary?.absent ?? 0} />
            <StatTile label="Leave" value={summary?.leave ?? 0} />
          </div>
          <div className="card card-pad">
            {rows.length ? (
              <div className="row" style={{ gap: 6 }}>
                {rows.map((a) => (
                  <span key={a._id} className={`badge ${a.status === 'P' ? 'badge-good' : a.status === 'A' ? 'badge-bad' : 'badge-warn'}`} title={fmtDate(a.date)}>
                    {fmtDate(a.date).replace(/ \d{4}$/, '')} · {a.status === 'P' ? 'Present' : a.status === 'A' ? 'Absent' : 'Leave'}
                  </span>
                ))}
              </div>
            ) : <Empty text="No attendance recorded yet." />}
          </div>
        </>
      )}</Async>
    </>
  )
}
