import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Clock, Send } from 'lucide-react'
import { api } from '../../lib/api.js'
import { Confirm, ErrorBox, Loading, useToast } from '../../components/ui.jsx'

const LETTERS = ['A', 'B', 'C', 'D']

export default function TakeTest() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState({})
  const [left, setLeft] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const submitting = useRef(false)
  const storageKey = `test-${id}`

  useEffect(() => {
    api.post(`/portal/tests/${id}/start`).then((d) => {
      setData(d)
      // Restore answers if the page was refreshed mid-test.
      try { setAnswers(JSON.parse(localStorage.getItem(storageKey)) || {}) } catch { /* ignore */ }
    }).catch((e) => setError(e.message))
  }, [id, storageKey])

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(answers)) } catch { /* ignore */ }
  }, [answers, storageKey])

  const submit = useCallback(async () => {
    if (submitting.current || !data) return
    submitting.current = true
    try {
      await api.post(`/portal/tests/${id}/submit`, { answers: data.test.questions.map((_, i) => answers[i] ?? -1) })
      try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
      navigate(`/my/tests/${id}/review`, { replace: true })
    } catch (e) {
      submitting.current = false
      toast(e.message, 'error')
    }
  }, [answers, data, id, navigate, storageKey, toast])

  useEffect(() => {
    if (!data) return undefined
    const tick = () => {
      const ms = new Date(data.endsAt) - Date.now()
      setLeft(Math.max(0, Math.floor(ms / 1000)))
      if (ms <= 0) submit()
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [data, submit])

  if (error) return <ErrorBox error={error} />
  if (!data) return <Loading text="Loading test…" />
  const answered = Object.values(answers).filter((v) => v >= 0).length
  const mm = String(Math.floor((left ?? 0) / 60)).padStart(2, '0')
  const ss = String((left ?? 0) % 60).padStart(2, '0')

  return (
    <>
      <div className="card card-pad mb row between" style={{ position: 'sticky', top: 64, zIndex: 10 }}>
        <div>
          <h2>{data.test.title}</h2>
          <div className="small muted">{answered} of {data.test.questions.length} answered{data.test.negativeMarks ? ` · −${data.test.negativeMarks} for each wrong answer` : ''}</div>
        </div>
        <div className="row">
          <span className="timer row" style={{ color: left < 60 ? 'var(--bad-text)' : undefined }}><Clock size={18} /> {mm}:{ss}</span>
          <button className="btn btn-primary" onClick={() => setConfirm(true)}><Send size={15} /> Submit</button>
        </div>
      </div>
      <div className="stack">
        {data.test.questions.map((q, i) => (
          <div className="card q-card" key={i}>
            <div className="row between"><strong>Question {i + 1}</strong><span className="small muted">{q.marks} marks</span></div>
            <p className="pre" style={{ margin: '8px 0', fontSize: 15 }}>{q.q}</p>
            {q.options.map((opt, oi) => (
              <button key={oi} type="button" className={`q-opt ${answers[i] === oi ? 'sel' : ''}`} onClick={() => setAnswers({ ...answers, [i]: answers[i] === oi ? -1 : oi })} aria-pressed={answers[i] === oi}>
                <span className="q-letter">{LETTERS[oi]}</span><span>{opt}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="row mt" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={() => setConfirm(true)}><Send size={15} /> Submit test</button></div>
      {confirm && <Confirm danger={false} confirmLabel="Submit" text={`Submit now? You answered ${answered} of ${data.test.questions.length} questions. You cannot change answers after submitting.`} onClose={() => setConfirm(false)} onConfirm={submit} />}
    </>
  )
}
