import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PrintBar } from '../../components/Documents.jsx'
import { Async, Segmented, useApi } from '../../components/ui.jsx'
import { useAuth } from '../../lib/auth.jsx'

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f']

export default function PaperView() {
  const { id } = useParams()
  const state = useApi(`/papers/${id}`)
  const { institute } = useAuth()
  const [mode, setMode] = useState('paper')

  return (
    <>
      <PrintBar back={
        <div className="row">
          <Link to="/papers" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Papers</Link>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'paper', label: 'Question paper' }, { value: 'key', label: 'With answer key' }]} />
        </div>
      } />
      <Async state={state}>{(p) => {
        const c = p.content
        const total = c.sections.reduce((s, sec) => s + sec.marksEach * sec.questions.length, 0)
        let n = 0
        return (
          <div className="doc">
            <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 12 }}>
              <h1>{institute?.instituteName}</h1>
              <h2 style={{ marginTop: 6 }}>{c.title}</h2>
              <div className="row between" style={{ marginTop: 8 }}>
                <span>Subject: {p.subject}</span><span>{p.level}</span><span>Maximum marks: {total}</span>
              </div>
            </div>
            {c.instructions?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <strong>General instructions</strong>
                <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>{c.instructions.map((ins, i) => <li key={i}>{ins}</li>)}</ol>
              </div>
            )}
            {c.sections.map((sec) => (
              <div key={sec.name} style={{ marginTop: 16 }}>
                <div className="row between" style={{ borderBottom: '1px solid #bbb', paddingBottom: 4 }}>
                  <strong>{sec.name}</strong>
                  <span className="muted">{sec.questions.length} × {sec.marksEach} = {sec.questions.length * sec.marksEach} marks</span>
                </div>
                {sec.questions.map((q) => {
                  n += 1
                  return (
                    <div className="paper-q" key={n}>
                      <div style={{ display: 'flex', gap: 8 }}><strong>Q{n}.</strong><span className="pre">{q.question}</span></div>
                      {q.options?.length > 0 && (
                        <div className="paper-opts">{q.options.map((o, i) => <div key={i}>({LETTERS[i]}) {o}</div>)}</div>
                      )}
                      {mode === 'key' && <div style={{ margin: '4px 0 0 22px', color: '#0a6b0a' }} className="pre"><strong>Answer:</strong> {q.answer}</div>}
                    </div>
                  )
                })}
              </div>
            ))}
            <div style={{ textAlign: 'center', marginTop: 24 }} className="muted">— End of paper —</div>
          </div>
        )
      }}</Async>
    </>
  )
}
