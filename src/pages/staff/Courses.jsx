import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MonitorPlay, Plus } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate } from '../../lib/format.js'
import { Async, Badge, BatchSelect, Empty, Field, Meter, Modal, PageHead, StatusBadge, useAction, useApi, useBatches } from '../../components/ui.jsx'

// Checkbox list of batches, grouped by type.
export function BatchPicker({ value, onChange }) {
  const batches = useBatches()
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  return (
    <div className="batch-picker">
      {['school', 'college', 'coaching'].map((type) => {
        const list = batches.filter((b) => b.type === type)
        if (!list.length) return null
        return (
          <div key={type}>
            <div className="small muted" style={{ textTransform: 'capitalize', marginBottom: 2 }}>{type}</div>
            {list.map((b) => (
              <label className="check" key={b._id}><input type="checkbox" checked={value.includes(b._id)} onChange={() => toggle(b._id)} /> {b.name}</label>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function NewCourse({ onClose }) {
  const [form, setForm] = useState({ title: '', subject: '', description: '', batches: [] })
  const [run, busy] = useAction()
  const navigate = useNavigate()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const course = await run(() => api.post('/courses', form), 'Course created. Now add modules and lessons.')
    if (course) navigate(`/lms/${course._id}`)
  }
  return (
    <Modal title="New course" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="course-form" disabled={busy}>Create</button></>}>
      <form id="course-form" className="form-grid" onSubmit={submit}>
        <Field label="Course title *" full><input className="input" value={form.title} onChange={set('title')} required placeholder="e.g. Physics: Laws of Motion" /></Field>
        <Field label="Subject"><input className="input" value={form.subject} onChange={set('subject')} /></Field>
        <Field label="Description" full><textarea className="textarea" value={form.description} onChange={set('description')} style={{ minHeight: 60 }} /></Field>
        <Field label="Batches that can see it" full><BatchPicker value={form.batches} onChange={(batches) => setForm({ ...form, batches })} /></Field>
      </form>
    </Modal>
  )
}

export default function Courses() {
  const [batch, setBatch] = useState('')
  const state = useApi(`/courses${qs({ batch })}`)
  const [adding, setAdding] = useState(false)
  return (
    <>
      <PageHead title="Courses" subtitle="Build online courses from video lessons, notes, links and quizzes, and track every student's progress.">
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> New course</button>
      </PageHead>
      <div className="filters"><BatchSelect value={batch} onChange={setBatch} /></div>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="grid grid-3">
          {rows.map((c) => (
            <Link key={c._id} to={`/lms/${c._id}`} className="card card-pad stack child-card">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <span className="stat-icon"><MonitorPlay size={16} /></span>
                  <div><div className="cell-title">{c.title}</div><div className="cell-sub">{[c.subject, c.teacherName].filter(Boolean).join(' · ')}</div></div>
                </div>
                <StatusBadge value={c.status} />
              </div>
              <div className="row" style={{ gap: 6 }}>{c.batches.map((b) => <Badge key={b._id}>{b.name}</Badge>)}{!c.batches.length && <Badge tone="warn">No batch</Badge>}</div>
              <div className="small text-2">{c.moduleCount} modules · {c.lessonCount} lessons · {c.started}/{c.students} students started</div>
              <div>
                <div className="row between small" style={{ marginBottom: 4 }}><span>Average progress</span><strong>{c.avgProgress}%</strong></div>
                <Meter value={c.avgProgress} />
              </div>
              <div className="small muted">Updated {fmtDate(c.updatedAt)}</div>
            </Link>
          ))}
        </div>
      ) : <Empty icon={MonitorPlay} text="No courses yet. Create one and add lessons — YouTube videos, Google Drive notes, links and quizzes." />}</Async>
      {adding && <NewCourse onClose={() => setAdding(false)} />}
    </>
  )
}
