import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, FileText, Pencil, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { embedFor, fmtDateTime } from '../../lib/format.js'
import { LESSON_ICON } from '../portal/CoursePlayer.jsx'
import { BatchPicker } from './Courses.jsx'
import { Async, Confirm, Empty, Field, Meter, Modal, PageHead, PctBadge, StatusBadge, Tabs, useAction, useAiStatus, useApi, useToast } from '../../components/ui.jsx'

const KINDS = [['video', 'Video lecture'], ['reading', 'Notes / reading'], ['link', 'Link / PDF'], ['quiz', 'Quiz']]
let tempKey = 0
const key = (x) => x._id || x._k || (x._k = `new-${++tempKey}`)
const move = (list, i, d) => {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const copy = [...list]
  ;[copy[i], copy[j]] = [copy[j], copy[i]]
  return copy
}
const blankQuestion = () => ({ q: '', options: ['', '', '', ''], answer: 0, explanation: '', marks: 1 })

function QuizEditor({ questions, onChange, course }) {
  const aiEnabled = useAiStatus()
  const [ai, setAi] = useState({ topic: '', count: 5, difficulty: 'medium' })
  const [run, busy] = useAction()
  const setQ = (i, patch) => onChange(questions.map((q, qi) => (qi === i ? { ...q, ...patch } : q)))
  const generate = async () => {
    const r = await run(() => api.post('/tests/ai-generate', { subject: course.subject || course.title, level: course.batches?.[0]?.program || '', topic: ai.topic, count: ai.count, difficulty: ai.difficulty }))
    if (r) onChange([...questions.filter((q) => q.q.trim()), ...r.questions.map((q) => ({ ...q, marks: 1 }))])
  }
  return (
    <div className="stack full">
      <div className="card card-pad stack" style={{ background: 'var(--violet-soft)', boxShadow: 'none' }}>
        <div className="row" style={{ color: 'var(--violet-text)', fontWeight: 600 }}><Sparkles size={15} /> Generate questions with AI</div>
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 180 }} value={ai.topic} onChange={(e) => setAi({ ...ai, topic: e.target.value })} placeholder="Topic, e.g. Newton's third law" />
          <select className="select" style={{ width: 'auto' }} value={ai.count} onChange={(e) => setAi({ ...ai, count: Number(e.target.value) })}>{[3, 5, 10].map((n) => <option key={n} value={n}>{n} questions</option>)}</select>
          <select className="select" style={{ width: 'auto' }} value={ai.difficulty} onChange={(e) => setAi({ ...ai, difficulty: e.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
          <button type="button" className="btn btn-ai" onClick={generate} disabled={busy || !ai.topic.trim() || aiEnabled === false}>{busy ? 'Writing…' : 'Generate'}</button>
        </div>
        {aiEnabled === false && <span className="small">AI is not configured — add questions by hand.</span>}
      </div>
      {questions.map((q, i) => (
        <div className="card card-pad stack" key={i} style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
          <div className="row between"><strong>Question {i + 1}</strong>
            <div className="row">
              <label className="small row" style={{ gap: 4 }}>Marks <input className="input" type="number" min={1} style={{ width: 64 }} value={q.marks} onChange={(e) => setQ(i, { marks: Number(e.target.value) || 1 })} /></label>
              <button type="button" className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => onChange(questions.filter((_, qi) => qi !== i))} aria-label="Remove question"><Trash2 size={14} /></button>
            </div>
          </div>
          <textarea className="textarea" style={{ minHeight: 50 }} value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} placeholder="Question" />
          {q.options.map((opt, oi) => (
            <label key={oi} className="row" style={{ flexWrap: 'nowrap' }}>
              <input type="radio" name={`ans-${i}`} checked={q.answer === oi} onChange={() => setQ(i, { answer: oi })} title="Correct answer" />
              <input className="input" value={opt} onChange={(e) => setQ(i, { options: q.options.map((o, x) => (x === oi ? e.target.value : o)) })} placeholder={`Option ${String.fromCharCode(65 + oi)}`} />
            </label>
          ))}
          <input className="input" value={q.explanation || ''} onChange={(e) => setQ(i, { explanation: e.target.value })} placeholder="Explanation shown after the quiz (optional)" />
        </div>
      ))}
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...questions, blankQuestion()])}><Plus size={15} /> Add question</button>
      <span className="small muted">Select the radio button next to the correct option.</span>
    </div>
  )
}

function LessonModal({ lesson, course, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ title: '', kind: 'video', url: '', content: '', durationMin: '', questions: [], ...lesson }))
  const toast = useToast()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const embed = embedFor(form.url)
  const submit = (e) => {
    e.preventDefault()
    if (form.kind === 'quiz' && !form.questions.some((q) => q.q.trim() && q.options.filter((o) => o.trim()).length >= 2)) {
      toast('Add at least one question with two or more options.', 'error')
      return
    }
    onSave({ ...form, questions: form.kind === 'quiz' ? form.questions : [] })
  }
  return (
    <Modal title={lesson.title ? 'Edit lesson' : 'New lesson'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="lesson-form">Done</button></>}>
      <form id="lesson-form" className="form-grid" onSubmit={submit}>
        <Field label="Lesson title *" full><input className="input" value={form.title} onChange={set('title')} required autoFocus /></Field>
        <Field label="Type"><select className="select" value={form.kind} onChange={set('kind')}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Duration (minutes)"><input className="input" type="number" min={1} value={form.durationMin || ''} onChange={set('durationMin')} /></Field>
        {form.kind !== 'quiz' && (
          <Field label={form.kind === 'video' ? 'Video link (YouTube, Google Drive or .mp4)' : 'Link (optional)'} full hint={form.url ? (embed ? 'Plays inside the course.' : 'Opens in a new tab.') : 'YouTube and Google Drive file links play inside the course.'}>
            <input className="input" type="url" value={form.url || ''} onChange={set('url')} placeholder="https://" required={form.kind !== 'reading'} />
          </Field>
        )}
        {form.kind !== 'quiz' && (
          <Field label={form.kind === 'reading' ? 'Notes' : 'Description / notes (optional)'} full hint="Supports **bold**, *italic*, lists (- item) and headings (## Heading).">
            <textarea className="textarea" value={form.content || ''} onChange={set('content')} style={{ minHeight: form.kind === 'reading' ? 200 : 80 }} />
          </Field>
        )}
        {form.kind === 'quiz' && <QuizEditor questions={form.questions} onChange={(questions) => setForm({ ...form, questions })} course={course} />}
      </form>
    </Modal>
  )
}

function Content({ draft, setDraft }) {
  const [editing, setEditing] = useState(null) // { mi, li } — li null = new lesson
  const setModules = (modules) => setDraft({ ...draft, modules })
  const setModule = (mi, patch) => setModules(draft.modules.map((m, i) => (i === mi ? { ...m, ...patch } : m)))
  const saveLesson = (lesson) => {
    const { mi, li } = editing
    const lessons = draft.modules[mi].lessons
    setModule(mi, { lessons: li == null ? [...lessons, lesson] : lessons.map((l, i) => (i === li ? lesson : l)) })
    setEditing(null)
  }
  return (
    <div className="stack">
      {!draft.modules.length && <Empty text="No content yet. Add a module (a chapter), then add video, notes, link and quiz lessons to it." />}
      {draft.modules.map((m, mi) => (
        <div className="card" key={key(m)}>
          <div className="card-head" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <span className="small muted nowrap">Module {mi + 1}</span>
            <input className="input" style={{ fontWeight: 600, flex: 1, minWidth: 0 }} value={m.title} onChange={(e) => setModule(mi, { title: e.target.value })} aria-label="Module title" />
            <div className="row nowrap" style={{ gap: 2, flexWrap: 'nowrap' }}>
              <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setModules(move(draft.modules, mi, -1))} disabled={mi === 0} aria-label="Move module up"><ArrowUp size={14} /></button>
              <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setModules(move(draft.modules, mi, 1))} disabled={mi === draft.modules.length - 1} aria-label="Move module down"><ArrowDown size={14} /></button>
              <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => (!m.lessons.length || window.confirm(`Delete module "${m.title}" and its ${m.lessons.length} lessons?`)) && setModules(draft.modules.filter((_, i) => i !== mi))} aria-label="Delete module"><Trash2 size={14} /></button>
            </div>
          </div>
          <div className="card-body stack" style={{ gap: 6 }}>
            {m.lessons.map((l, li) => {
              const Icon = LESSON_ICON[l.kind] || FileText
              return (
                <div className="lesson-row" key={key(l)}>
                  <Icon size={16} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cell-title">{l.title}</div>
                    <div className="cell-sub">{KINDS.find(([v]) => v === l.kind)?.[1]}{l.durationMin ? ` · ${l.durationMin} min` : ''}{l.kind === 'quiz' ? ` · ${l.questions.length} questions` : ''}{l.url && !embedFor(l.url) && l.kind === 'video' ? ' · opens in new tab' : ''}</div>
                  </div>
                  <div className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                    <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setModule(mi, { lessons: move(m.lessons, li, -1) })} disabled={li === 0} aria-label="Move up"><ArrowUp size={14} /></button>
                    <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setModule(mi, { lessons: move(m.lessons, li, 1) })} disabled={li === m.lessons.length - 1} aria-label="Move down"><ArrowDown size={14} /></button>
                    <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing({ mi, li })} aria-label="Edit lesson"><Pencil size={14} /></button>
                    <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setModule(mi, { lessons: m.lessons.filter((_, i) => i !== li) })} aria-label="Delete lesson"><Trash2 size={14} /></button>
                  </div>
                </div>
              )
            })}
            <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing({ mi, li: null })}><Plus size={14} /> Add lesson</button>
          </div>
        </div>
      ))}
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setModules([...draft.modules, { title: `Module ${draft.modules.length + 1}`, lessons: [] }])}><Plus size={15} /> Add module</button>
      {editing && (
        <LessonModal
          lesson={editing.li == null ? {} : draft.modules[editing.mi].lessons[editing.li]}
          course={draft}
          onClose={() => setEditing(null)}
          onSave={saveLesson}
        />
      )}
    </div>
  )
}

function Progress({ id }) {
  const state = useApi(`/courses/${id}/progress`)
  return (
    <Async state={state}>{({ rows, perLesson, students }) => (
      <div className="grid grid-2" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <div className="card">
          <div className="card-head"><h2>Students</h2><span className="sub">{rows.filter((r) => r.completed).length} of {students} started</span></div>
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Batch</th><th style={{ minWidth: 140 }}>Progress</th><th className="num">Quiz avg</th><th>Last active</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.student._id}>
                    <td><Link className="cell-title" to={`/students/${r.student._id}`}>{r.student.name}</Link><div className="cell-sub mono">{r.student.admissionNo}</div></td>
                    <td className="small">{r.student.batch?.name}</td>
                    <td><div className="row" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><Meter value={r.pct} color={r.pct === 100 ? 'var(--good)' : undefined} /></div><span className="small nowrap">{r.completed}/{r.total}</span></div></td>
                    <td className="num"><PctBadge value={r.quizPct} warnBelow={60} badBelow={40} /></td>
                    <td className="small text-2">{r.lastAt ? fmtDateTime(r.lastAt) : 'Not started'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="No students in the selected batches." />}
        </div>
        <div className="card">
          <div className="card-head"><h2>Completion by lesson</h2></div>
          <div className="card-body stack">
            {perLesson.length ? perLesson.map((l) => (
              <div key={l._id}>
                <div className="row between small"><span>{l.title}</span><span>{l.done}/{students}</span></div>
                <Meter value={students ? (l.done / students) * 100 : 0} />
              </div>
            )) : <span className="muted">No lessons yet.</span>}
          </div>
        </div>
      </div>
    )}</Async>
  )
}

function Builder({ course, reload, tab }) {
  const [draft, setDraft] = useState(() => ({ ...course, batches: course.batches.map((b) => b._id || b) }))
  const [dirty, setDirty] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [run, busy] = useAction()
  const toast = useToast()
  const navigate = useNavigate()
  const update = (next) => { setDraft(next); setDirty(true) }

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = async (patch = {}, message = 'Course saved.') => {
    const body = { ...draft, ...patch }
    if (body.status === 'published' && !body.batches.length) return toast('Choose at least one batch in Settings before publishing.', 'error')
    if (await run(() => api.put(`/courses/${course._id}`, body), message)) {
      setDirty(false)
      reload()
    }
  }
  const remove = async () => {
    if (await run(() => api.del(`/courses/${course._id}`), 'Course deleted.')) navigate('/lms')
  }
  const lessons = draft.modules.reduce((a, m) => a + m.lessons.length, 0)

  return (
    <>
      <PageHead title={draft.title} subtitle={`${draft.modules.length} modules · ${lessons} lessons · ${course.batches.map((b) => b.name).join(', ') || 'no batch yet'}`}>
        <StatusBadge value={draft.status} />
        {draft.status === 'published'
          ? <button className="btn" onClick={() => save({ status: 'draft' }, 'Hidden from students.')} disabled={busy}><EyeOff size={15} /> Unpublish</button>
          : <button className="btn" onClick={() => save({ status: 'published' }, 'Published — students can see it now.')} disabled={busy}><Eye size={15} /> Publish</button>}
        <button className="btn btn-primary" onClick={() => save()} disabled={busy || !dirty}><Save size={15} /> {dirty ? 'Save changes' : 'Saved'}</button>
      </PageHead>
      {tab === 'content' && <Content draft={draft} setDraft={update} />}
      {tab === 'progress' && <Progress id={course._id} />}
      {tab === 'settings' && (
        <div className="card card-pad">
          <div className="form-grid">
            <Field label="Course title *" full><input className="input" value={draft.title} onChange={(e) => update({ ...draft, title: e.target.value })} /></Field>
            <Field label="Subject"><input className="input" value={draft.subject || ''} onChange={(e) => update({ ...draft, subject: e.target.value })} /></Field>
            <Field label="Description" full><textarea className="textarea" value={draft.description || ''} onChange={(e) => update({ ...draft, description: e.target.value })} /></Field>
            <Field label="Batches that can see it" full><BatchPicker value={draft.batches} onChange={(batches) => update({ ...draft, batches })} /></Field>
          </div>
          <div className="hr" />
          <div className="row between">
            <span className="small muted">Deleting removes the course and every student's progress in it.</span>
            <button className="btn btn-danger" onClick={() => setDeleting(true)}><Trash2 size={15} /> Delete course</button>
          </div>
        </div>
      )}
      {dirty && <div className="small muted mt">You have unsaved changes — click “Save changes”.</div>}
      {deleting && <Confirm text={`Delete "${draft.title}"? Student progress in this course will be lost.`} onConfirm={remove} onClose={() => setDeleting(false)} busy={busy} />}
    </>
  )
}

export default function CourseBuilder() {
  const { id } = useParams()
  const state = useApi(`/courses/${id}`)
  const [tab, setTab] = useState('content')
  return (
    <>
      <div className="row between mb">
        <Link to="/lms" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Courses</Link>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'content', label: 'Content' }, { value: 'progress', label: 'Student progress' }, { value: 'settings', label: 'Settings' }]} />
      </div>
      <Async state={state}>{(course) => <Builder key={state.version} course={course} reload={state.reload} tab={tab} />}</Async>
    </>
  )
}
