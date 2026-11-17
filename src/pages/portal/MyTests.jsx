import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ListChecks, Sparkles, Timer, XCircle } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDateTime } from '../../lib/format.js'
import { Async, Badge, Empty, Field, PageHead, useAction, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

// Self-practice: AI writes MCQs on a topic; answers are checked right here (nothing saved).
function Practice({ subjects }) {
  const [form, setForm] = useState({ subject: subjects[0] || '', topic: '', count: 5, difficulty: 'medium' })
  const [quiz, setQuiz] = useState(null)
  const [answers, setAnswers] = useState({})
  const [checked, setChecked] = useState(false)
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const start = async (e) => {
    e.preventDefault()
    const r = await run(() => api.post('/portal/practice', { ...form, count: Number(form.count) }))
    if (r) { setQuiz(r); setAnswers({}); setChecked(false) }
  }
  const score = quiz ? quiz.questions.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0) : 0

  if (quiz) {
    return (
      <div className="card card-pad stack">
        <div className="row between">
          <div><h2>Practice: {quiz.topic}</h2><div className="small muted">{quiz.subject} · {quiz.questions.length} questions</div></div>
          {checked && <Badge tone={score / quiz.questions.length >= 0.6 ? 'good' : 'warn'}>Score {score} / {quiz.questions.length}</Badge>}
        </div>
        {quiz.questions.map((q, i) => (
          <div className="q-card" key={i}>
            <strong>Q{i + 1}.</strong> <span className="pre">{q.q}</span>
            <div className="stack" style={{ gap: 6, marginTop: 8 }}>
              {q.options.map((opt, oi) => {
                const chosen = answers[i] === oi
                const state = checked ? (oi === q.answer ? 'right' : chosen ? 'wrong' : '') : chosen ? 'sel' : ''
                return (
                  <button key={oi} type="button" className={`q-opt ${state}`} disabled={checked} onClick={() => setAnswers({ ...answers, [i]: oi })}>
                    <span className="q-letter">{LETTERS[oi]}</span><span>{opt}</span>
                    {checked && oi === q.answer && <CheckCircle2 size={16} style={{ marginLeft: 'auto', color: 'var(--good)' }} />}
                    {checked && chosen && oi !== q.answer && <XCircle size={16} style={{ marginLeft: 'auto', color: 'var(--bad)' }} />}
                  </button>
                )
              })}
            </div>
            {checked && q.explanation && <div className="small text-2" style={{ marginTop: 6 }}>💡 {q.explanation}</div>}
          </div>
        ))}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setQuiz(null)}>New practice</button>
          {!checked && <button className="btn btn-primary" onClick={() => setChecked(true)}>Check answers</button>}
        </div>
      </div>
    )
  }
  return (
    <form className="card card-pad stack" onSubmit={start}>
      <div className="row" style={{ color: 'var(--violet-text)', fontWeight: 650 }}><Sparkles size={16} /> Practise MCQs with AI</div>
      <p className="small text-2">Pick a subject and topic; the AI tutor writes fresh multiple-choice questions and explains every answer. It does not count in your marks.</p>
      <div className="form-grid">
        <Field label="Subject">
          {subjects.length ? (
            <select className="select" value={form.subject} onChange={set('subject')}>{subjects.map((s) => <option key={s}>{s}</option>)}</select>
          ) : <input className="input" value={form.subject} onChange={set('subject')} required />}
        </Field>
        <Field label="Topic / chapter"><input className="input" value={form.topic} onChange={set('topic')} placeholder="e.g. Quadratic equations" required minLength={2} /></Field>
        <Field label="Questions"><select className="select" value={form.count} onChange={set('count')}>{[5, 10, 15].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
        <Field label="Level"><select className="select" value={form.difficulty} onChange={set('difficulty')}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></Field>
      </div>
      <div><button className="btn btn-ai" disabled={busy}>{busy ? 'Writing questions… (can take a minute)' : 'Start practice'}</button></div>
    </form>
  )
}

export default function MyTests() {
  const { api, to, readOnly, viewer } = useScope()
  const state = useApi(`${api}/tests`)
  const home = useApi(viewer === 'student' ? '/portal/home' : null)
  const subjects = home.data?.student?.batch?.subjects || []
  return (
    <>
      <PageHead title="MCQ tests" subtitle={readOnly ? 'Timed multiple-choice tests assigned to the batch, with scores and answer review.' : 'Timed multiple-choice tests from your teachers. Your score and rank appear right after you submit.'} />
      <Async state={state}>{(tests) => tests.length ? (
        <div className="grid grid-3 mb">
          {tests.map((t) => {
            const done = t.attempt?.submittedAt
            return (
              <div className="card card-pad stack" key={t._id}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div><h2>{t.title}</h2><div className="small muted">{[t.subject, t.topic].filter(Boolean).join(' · ')}</div></div>
                  {done ? <Badge tone="good">Done</Badge> : t.status === 'closed' ? <Badge>Closed</Badge> : <Badge tone="warn">Pending</Badge>}
                </div>
                <div className="row small text-2"><Timer size={14} /> {t.durationMin} min{t.negativeMarks ? ` · −${t.negativeMarks} per wrong answer` : ''}</div>
                {(t.startAt || t.endAt) && <div className="small text-2">Window: {t.startAt ? fmtDateTime(t.startAt) : 'now'} – {t.endAt ? fmtDateTime(t.endAt) : 'open'}</div>}
                {done ? (
                  <div className="row between">
                    <span>Score <strong>{t.attempt.score} / {t.attempt.total}</strong><div className="small muted">{fmtDateTime(t.attempt.submittedAt)}</div></span>
                    <Link className="btn btn-sm" to={to(`tests/${t._id}/review`)}>Review answers</Link>
                  </div>
                ) : t.status === 'published' && readOnly ? (
                  <span className="small muted">Not attempted yet.</span>
                ) : t.status === 'published' && !t.attempt && t.startAt && new Date(t.startAt) > new Date() ? (
                  <span className="small muted">Opens {fmtDateTime(t.startAt)}</span>
                ) : t.status === 'published' && !t.attempt && t.endAt && new Date(t.endAt) < new Date() ? (
                  <span className="small muted">The test window has closed.</span>
                ) : t.status === 'published' ? (
                  <Link className="btn btn-primary" to={to(`tests/${t._id}/take`)}>{t.attempt ? 'Resume test' : 'Start test'}</Link>
                ) : <span className="small muted">This test is closed.</span>}
              </div>
            )
          })}
        </div>
      ) : <div className="mb"><Empty icon={ListChecks} text={readOnly ? 'No MCQ tests have been assigned to this class yet.' : 'Your teachers have not assigned an MCQ test yet. Tests appear here as soon as they are published.'} /></div>}</Async>
      {!readOnly && <Practice key={subjects.join('|')} subjects={subjects} />}
    </>
  )
}
