import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle, ExternalLink, FileText, HelpCircle, Link2, RotateCcw, Video, XCircle } from 'lucide-react'
import { api } from '../../lib/api.js'
import { embedFor } from '../../lib/format.js'
import Markdown from '../../components/Markdown.jsx'
import { Async, Badge, Meter, useAction, useApi } from '../../components/ui.jsx'

export const LESSON_ICON = { video: Video, reading: FileText, link: Link2, quiz: HelpCircle }
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

function Embed({ url }) {
  const e = embedFor(url)
  if (!e) return null
  return (
    <div className="embed">
      {e.type === 'video'
        ? <video src={e.src} controls />
        : <iframe src={e.src} title="Lesson" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />}
    </div>
  )
}

function Quiz({ lesson, onSubmit, busy }) {
  const [answers, setAnswers] = useState({})
  const [retake, setRetake] = useState(false)
  const reviewing = lesson.done && !retake

  if (reviewing) {
    return (
      <div className="stack">
        <div className="alert alert-info row between">
          <span>You scored <strong>{lesson.done.score} / {lesson.done.total}</strong>.</span>
          <button className="btn btn-sm" onClick={() => { setAnswers({}); setRetake(true) }}><RotateCcw size={14} /> Retake</button>
        </div>
        {lesson.questions.map((q, i) => (
          <div className="card q-card" key={i}>
            <div className="row between">
              <strong>Question {i + 1}</strong>
              {q.marked === q.answer
                ? <span className="row small" style={{ color: 'var(--good-text)' }}><CheckCircle2 size={15} /> Correct</span>
                : <span className="row small" style={{ color: 'var(--bad-text)' }}><XCircle size={15} /> {q.marked === -1 ? 'Skipped' : 'Wrong'}</span>}
            </div>
            <p className="pre" style={{ margin: '8px 0' }}>{q.q}</p>
            {q.options.map((opt, oi) => (
              <div key={oi} className={`q-opt ${oi === q.answer ? 'right' : oi === q.marked ? 'wrong' : ''}`} style={{ cursor: 'default' }}>
                <span className="q-letter">{LETTERS[oi]}</span><span>{opt}</span>
              </div>
            ))}
            {q.explanation && <div className="alert alert-info small" style={{ marginTop: 10 }}>{q.explanation}</div>}
          </div>
        ))}
      </div>
    )
  }

  const answered = Object.values(answers).filter((v) => v >= 0).length
  return (
    <div className="stack">
      {lesson.questions.map((q, i) => (
        <div className="card q-card" key={i}>
          <div className="row between"><strong>Question {i + 1}</strong><span className="small muted">{q.marks} mark{q.marks === 1 ? '' : 's'}</span></div>
          <p className="pre" style={{ margin: '8px 0', fontSize: 15 }}>{q.q}</p>
          {q.options.map((opt, oi) => (
            <button key={oi} type="button" className={`q-opt ${answers[i] === oi ? 'sel' : ''}`} onClick={() => setAnswers({ ...answers, [i]: answers[i] === oi ? -1 : oi })} aria-pressed={answers[i] === oi}>
              <span className="q-letter">{LETTERS[oi]}</span><span>{opt}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="row between">
        <span className="small muted">{answered} of {lesson.questions.length} answered</span>
        <button className="btn btn-primary" disabled={busy} onClick={async () => { if (await onSubmit(lesson.questions.map((_, i) => answers[i] ?? -1))) setRetake(false) }}>Submit quiz</button>
      </div>
    </div>
  )
}

export default function CoursePlayer() {
  const { id } = useParams()
  const state = useApi(`/portal/courses/${id}`)
  const [params, setParams] = useSearchParams()
  const [run, busy] = useAction()

  const lessons = state.data ? state.data.course.modules.flatMap((m) => m.lessons) : []
  const fallback = lessons.find((l) => l._id === state.data?.lastLesson) || lessons.find((l) => !l.done) || lessons[0]
  const current = lessons.find((l) => l._id === params.get('l')) || fallback
  const index = lessons.indexOf(current)

  // Remember the open lesson so "Continue" comes back here.
  const currentId = current?._id
  useEffect(() => {
    if (currentId) api.post(`/portal/courses/${id}/lessons/${currentId}/open`).catch(() => {})
  }, [id, currentId])

  const go = (lesson) => {
    setParams({ l: lesson._id })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const complete = async (answers) => {
    const r = await run(() => api.post(`/portal/courses/${id}/lessons/${current._id}/complete`, { answers }), answers ? undefined : 'Marked as done.')
    if (r) state.reload()
    return r
  }

  return (
    <Async state={state}>{({ course }) => {
      const done = lessons.filter((l) => l.done).length
      const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0
      const Icon = LESSON_ICON[current?.kind] || FileText
      return (
        <>
          <div className="row between mb">
            <Link to="/my/courses" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Courses</Link>
            <div className="row small" style={{ minWidth: 200 }}><span>{done}/{lessons.length} done</span><div style={{ flex: 1 }}><Meter value={pct} /></div><strong>{pct}%</strong></div>
          </div>
          <div className="player">
            <div className="stack" style={{ minWidth: 0 }}>
              {current ? (
                <div className="card card-pad stack">
                  <div className="row between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="small muted">{course.title}</div>
                      <h1 className="row" style={{ marginTop: 2 }}><Icon size={20} /> {current.title}</h1>
                    </div>
                    {current.done && <Badge tone="good"><CheckCircle2 size={12} /> Done</Badge>}
                  </div>
                  {current.kind !== 'quiz' && <Embed url={current.url} />}
                  {current.content && <div className="md"><Markdown text={current.content} /></div>}
                  {current.url && current.kind !== 'quiz' && !embedFor(current.url) && (
                    <a className="btn" href={current.url} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}><ExternalLink size={15} /> {current.kind === 'video' ? 'Watch video' : 'Open link'}</a>
                  )}
                  {current.kind === 'quiz'
                    ? <Quiz key={current._id} lesson={current} onSubmit={complete} busy={busy} />
                    : !current.done && <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => complete()} disabled={busy}><CheckCircle2 size={15} /> Mark as done</button>}
                </div>
              ) : <div className="card card-pad muted">This course has no lessons yet.</div>}
              <div className="row between">
                <button className="btn" disabled={index <= 0} onClick={() => go(lessons[index - 1])}><ArrowLeft size={15} /> Previous</button>
                <button className="btn" disabled={index < 0 || index >= lessons.length - 1} onClick={() => go(lessons[index + 1])}>Next <ArrowRight size={15} /></button>
              </div>
            </div>
            <aside className="card player-outline">
              {course.modules.map((m, mi) => (
                <div key={m._id}>
                  <div className="outline-module">Module {mi + 1}: {m.title}</div>
                  {m.lessons.map((l) => {
                    const LIcon = LESSON_ICON[l.kind] || FileText
                    return (
                      <button key={l._id} className={`outline-lesson ${l._id === current?._id ? 'active' : ''}`} onClick={() => go(l)}>
                        {l.done ? <CheckCircle2 size={16} style={{ color: 'var(--good)' }} /> : <Circle size={16} style={{ color: 'var(--text-3)' }} />}
                        <span style={{ flex: 1 }}>{l.title}</span>
                        <LIcon size={14} style={{ color: 'var(--text-3)' }} />
                      </button>
                    )
                  })}
                </div>
              ))}
            </aside>
          </div>
        </>
      )
    }}</Async>
  )
}
