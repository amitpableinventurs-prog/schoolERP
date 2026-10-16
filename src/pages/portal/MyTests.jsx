import { Link } from 'react-router-dom'
import { Timer } from 'lucide-react'
import { fmtDateTime } from '../../lib/format.js'
import { Async, Badge, Empty, PageHead, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyTests() {
  const { api, to, readOnly } = useScope()
  const state = useApi(`${api}/tests`)
  return (
    <>
      <PageHead title="Online tests" subtitle={readOnly ? 'Timed MCQ tests assigned to the batch, with scores and answer review.' : 'Timed MCQ tests. Your score and rank appear right after you submit.'} />
      <Async state={state}>{(tests) => tests.length ? (
        <div className="grid grid-3">
          {tests.map((t) => {
            const done = t.attempt?.submittedAt
            return (
              <div className="card card-pad stack" key={t._id}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div><h2>{t.title}</h2><div className="small muted">{[t.subject, t.topic].filter(Boolean).join(' · ')}</div></div>
                  {done ? <Badge tone="good">Done</Badge> : t.status === 'closed' ? <Badge>Closed</Badge> : <Badge tone="warn">Pending</Badge>}
                </div>
                <div className="row small text-2"><Timer size={14} /> {t.durationMin} min{t.negativeMarks ? ` · −${t.negativeMarks} per wrong answer` : ''}</div>
                {done ? (
                  <div className="row between">
                    <span>Score <strong>{t.attempt.score} / {t.attempt.total}</strong><div className="small muted">{fmtDateTime(t.attempt.submittedAt)}</div></span>
                    <Link className="btn btn-sm" to={to(`tests/${t._id}/review`)}>Review answers</Link>
                  </div>
                ) : t.status === 'published' && readOnly ? (
                  <span className="small muted">Not attempted yet.</span>
                ) : t.status === 'published' ? (
                  <Link className="btn btn-primary" to={to(`tests/${t._id}/take`)}>{t.attempt ? 'Resume test' : 'Start test'}</Link>
                ) : <span className="small muted">This test is closed.</span>}
              </div>
            )
          })}
        </div>
      ) : <Empty text="No tests assigned yet." />}</Async>
    </>
  )
}
