import { Link } from 'react-router-dom'
import { MonitorPlay } from 'lucide-react'
import { fmtDateTime } from '../../lib/format.js'
import { useScope } from '../../lib/scope.jsx'
import { Async, Badge, Empty, Meter, PageHead, useApi } from '../../components/ui.jsx'

export default function MyCourses() {
  const { api, to, my, readOnly } = useScope()
  const state = useApi(`${api}/courses`)
  return (
    <>
      <PageHead title={my('courses')} subtitle={readOnly ? 'Online courses assigned to the batch and how far your child has got in each.' : 'Video lessons, notes and quizzes from your teachers. Pick up where you left off.'} />
      <Async state={state}>{(rows) => rows.length ? (
        <div className="grid grid-3">
          {rows.map((c) => (
            <div className="card card-pad stack" key={c._id}>
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <span className="stat-icon"><MonitorPlay size={16} /></span>
                <div>
                  <div className="cell-title">{c.title}</div>
                  <div className="cell-sub">{[c.subject, c.teacherName].filter(Boolean).join(' · ')}</div>
                </div>
              </div>
              {c.description && <p className="small text-2">{c.description}</p>}
              <div>
                <div className="row between small" style={{ marginBottom: 4 }}>
                  <span>{c.completed} of {c.total} lessons</span>
                  <strong>{c.pct}%</strong>
                </div>
                <Meter value={c.pct} color={c.pct === 100 ? 'var(--good)' : undefined} />
              </div>
              <div className="row between">
                <div className="row">
                  {c.quizPct != null && <Badge tone={c.quizPct >= 60 ? 'good' : 'warn'}>Quiz avg {c.quizPct}%</Badge>}
                  {c.pct === 100 && <Badge tone="good">Completed</Badge>}
                </div>
                {!readOnly && <Link className="btn btn-sm btn-primary" to={to(`courses/${c._id}`)}>{c.completed ? (c.pct === 100 ? 'Review' : 'Continue') : 'Start'}</Link>}
              </div>
              <div className="small muted">
                {c.nextLessonTitle ? `Next: ${c.nextLessonTitle}` : 'All lessons done'}
                {c.lastAt && ` · last active ${fmtDateTime(c.lastAt)}`}
              </div>
            </div>
          ))}
        </div>
      ) : <Empty text="No courses yet." icon={MonitorPlay} />}</Async>
    </>
  )
}
