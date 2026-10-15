import { useState } from 'react'
import { Brain, Send, Sparkles, UserCheck } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDateTime } from '../../lib/format.js'
import Markdown from '../../components/Markdown.jsx'
import { Async, Empty, Field, PageHead, StatusBadge, useAction, useApi } from '../../components/ui.jsx'

export default function MyDoubts() {
  const state = useApi('/portal/doubts')
  const home = useApi('/portal/home')
  const [question, setQuestion] = useState('')
  const [subject, setSubject] = useState('')
  const [run, busy] = useAction()
  const subjects = home.data?.student?.batch?.subjects || []
  const aiEnabled = home.data?.aiEnabled

  const ask = async (e) => {
    e.preventDefault()
    const d = await run(() => api.post('/portal/doubts', { question, subject }), aiEnabled ? 'AI Tutor has answered! Your teacher will also review it.' : 'Doubt sent to your teacher.')
    if (d) { setQuestion(''); state.reload() }
  }

  return (
    <>
      <PageHead title="AI Tutor & Doubts" subtitle="Ask any doubt in English or Hindi. The AI tutor explains step by step instantly, and your teacher reviews it too." />
      <form className="card card-pad stack mb" onSubmit={ask}>
        <div className="row" style={{ color: 'var(--violet-text)', fontWeight: 600 }}><Brain size={18} /> Ask a doubt</div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label="Subject">
            <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">General</option>{subjects.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <textarea className="textarea" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Pseudo force kab use karte hain? / Explain how to find the range of a function" required minLength={5} />
        <div className="row between">
          <span className="small muted">{busy && aiEnabled ? 'AI tutor is writing an explanation…' : ''}</span>
          <button className="btn btn-ai" disabled={busy || question.trim().length < 5}><Send size={15} /> {busy ? 'Asking…' : 'Ask'}</button>
        </div>
      </form>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="stack">
          {rows.map((d) => (
            <div className="card card-pad stack" key={d._id}>
              <div className="row between"><span className="small muted">{d.subject || 'General'} · {fmtDateTime(d.createdAt)}</span><StatusBadge value={d.status} /></div>
              <p className="pre" style={{ fontWeight: 550 }}>{d.question}</p>
              {d.aiAnswer && (
                <div className="alert-ai" style={{ padding: 12, borderRadius: 8 }}>
                  <div className="small row" style={{ fontWeight: 600, marginBottom: 4 }}><Sparkles size={13} /> AI Tutor</div>
                  <div style={{ color: 'var(--text)' }}><Markdown text={d.aiAnswer} /></div>
                </div>
              )}
              {d.teacherAnswer && (
                <div className="alert-info" style={{ padding: 12, borderRadius: 8 }}>
                  <div className="small row" style={{ fontWeight: 600, marginBottom: 4 }}><UserCheck size={13} /> {d.answeredBy || 'Teacher'}</div>
                  <div className="pre" style={{ color: 'var(--text)' }}>{d.teacherAnswer}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : <Empty text="No doubts asked yet." />}</Async>
    </>
  )
}
