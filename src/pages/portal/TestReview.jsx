import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react'
import { Async, StatTile, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

const LETTERS = ['A', 'B', 'C', 'D']

export default function TestReview() {
  const { id } = useParams()
  const { api, to } = useScope()
  const state = useApi(`${api}/tests/${id}/review`)
  return (
    <Async state={state}>{(d) => (
      <>
        <div className="row mb"><Link to={to('tests')} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Tests</Link></div>
        <h1 className="mb">{d.test.title}</h1>
        <div className="grid grid-4 mb">
          <StatTile label="Score" value={`${d.attempt.score} / ${d.attempt.total}`} tone="good" />
          <StatTile label="Rank" value={`#${d.rank}`} foot={`out of ${d.takers} students`} />
          <StatTile label="Correct" value={d.attempt.correct} />
          <StatTile label="Wrong / skipped" value={`${d.attempt.wrong} / ${d.questions.length - d.attempt.correct - d.attempt.wrong}`} />
        </div>
        <div className="stack">
          {d.questions.map((q, i) => {
            const right = q.marked === q.answer
            return (
              <div className="card q-card" key={i}>
                <div className="row between">
                  <strong>Question {i + 1}</strong>
                  {q.marked === -1 ? <span className="small muted">Skipped</span> : right
                    ? <span className="row small" style={{ color: 'var(--good-text)' }}><CheckCircle2 size={15} /> Correct</span>
                    : <span className="row small" style={{ color: 'var(--bad-text)' }}><XCircle size={15} /> Wrong</span>}
                </div>
                <p className="pre" style={{ margin: '8px 0' }}>{q.q}</p>
                {q.options.map((opt, oi) => (
                  <div key={oi} className={`q-opt ${oi === q.answer ? 'right' : oi === q.marked ? 'wrong' : ''}`} style={{ cursor: 'default' }}>
                    <span className="q-letter">{LETTERS[oi]}</span><span>{opt}</span>
                    {oi === q.answer && <span className="small" style={{ marginLeft: 'auto', color: 'var(--good-text)' }}>Correct answer</span>}
                    {oi === q.marked && oi !== q.answer && <span className="small" style={{ marginLeft: 'auto', color: 'var(--bad-text)' }}>Your answer</span>}
                  </div>
                ))}
                {q.explanation && <div className="alert alert-info small mt" style={{ marginTop: 10 }}>{q.explanation}</div>}
              </div>
            )
          })}
        </div>
      </>
    )}</Async>
  )
}
