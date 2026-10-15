import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDateTime } from '../../lib/format.js'
import Markdown from '../../components/Markdown.jsx'
import { Async, BatchSelect, Empty, PageHead, Segmented, StatusBadge, useAction, useAiStatus, useApi } from '../../components/ui.jsx'

function DoubtCard({ d, onChange, aiEnabled }) {
  const [answer, setAnswer] = useState(d.teacherAnswer || '')
  const [run, busy] = useAction()
  return (
    <div className="card card-pad stack">
      <div className="row between">
        <div><strong>{d.student?.name}</strong> <span className="muted small">· {d.batch?.name}{d.subject ? ` · ${d.subject}` : ''} · {fmtDateTime(d.createdAt)}</span></div>
        <StatusBadge value={d.status} />
      </div>
      <p className="pre" style={{ fontSize: 15 }}>{d.question}</p>
      {d.aiAnswer ? (
        <div className="alert-ai" style={{ padding: 12, borderRadius: 8 }}>
          <div className="small row" style={{ fontWeight: 600, marginBottom: 4 }}><Sparkles size={13} /> AI explanation (student already sees this)</div>
          <div style={{ color: 'var(--text)' }}><Markdown text={d.aiAnswer} /></div>
        </div>
      ) : (
        <div><button className="btn btn-sm btn-ai" disabled={busy || aiEnabled === false} onClick={async () => { const r = await run(() => api.post(`/doubts/${d._id}/ai-answer`), 'AI explanation added.'); if (r) onChange() }}><Sparkles size={13} /> {busy ? 'Thinking…' : 'Get AI explanation'}</button></div>
      )}
      <textarea className="textarea" placeholder="Your answer / correction for the student…" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ minHeight: 70 }} />
      <div className="row between">
        <span className="small muted">{d.answeredBy ? `Answered by ${d.answeredBy}` : ''}</span>
        <button className="btn btn-primary btn-sm" disabled={busy || !answer.trim()} onClick={async () => { if (await run(() => api.put(`/doubts/${d._id}`, { teacherAnswer: answer }), 'Answer sent to student.')) onChange() }}>Save answer</button>
      </div>
    </div>
  )
}

export default function Doubts() {
  const [status, setStatus] = useState('open')
  const [batch, setBatch] = useState('')
  const state = useApi(`/doubts${qs({ status, batch })}`)
  const aiEnabled = useAiStatus()
  return (
    <>
      <PageHead title="Student Doubts" subtitle="Students get an instant AI explanation; teachers review and add their own answer." />
      <div className="filters">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'answered', label: 'Answered' }, { value: '', label: 'All' }]} />
        <BatchSelect value={batch} onChange={setBatch} />
      </div>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="stack">{rows.map((d) => <DoubtCard key={d._id} d={d} onChange={state.reload} aiEnabled={aiEnabled} />)}</div>
      ) : <Empty text="No doubts here." />}</Async>
    </>
  )
}
