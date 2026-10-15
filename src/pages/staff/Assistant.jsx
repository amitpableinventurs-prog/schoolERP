import { useEffect, useRef, useState } from 'react'
import { Bot, Send, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import Markdown from '../../components/Markdown.jsx'
import { AiNotice, PageHead, useAiStatus } from '../../components/ui.jsx'

const SUGGESTIONS = [
  'Aaj ki attendance ka summary do, kaunse batch me sabse kam hai?',
  'Which students have fees overdue by more than 30 days?',
  'JEE batch ke at-risk students aur unke reasons batao',
  'Compare the latest exam averages of all batches',
  'Which admission enquiries need a follow-up today?',
  'Draft a WhatsApp message to parents about the PTM this Saturday',
]

const STORAGE_KEY = 'assistant-chat'

export default function Assistant() {
  const aiEnabled = useAiStatus()
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [] } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const logRef = useRef(null)

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)) } catch { /* ignore */ }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = async (text) => {
    const content = (text ?? input).trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      // Failed replies are not sent back to the model as history.
      const { reply } = await api.post('/ai/chat', { messages: next.filter((m) => !m.error) })
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (error) {
      setMessages([...next, { role: 'assistant', content: `⚠️ ${error.message}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead title="AI Assistant" subtitle="Ask anything about your students, fees, attendance, exams or admissions — in English or Hindi.">
        {messages.length > 0 && <button className="btn" onClick={() => setMessages([])}><Trash2 size={15} /> New chat</button>}
      </PageHead>
      <AiNotice enabled={aiEnabled} />
      <div className="card chat mt">
        <div className="chat-log" ref={logRef}>
          {messages.length === 0 && (
            <div className="stack" style={{ margin: 'auto', maxWidth: 640, textAlign: 'center', alignItems: 'center' }}>
              <div className="stat-icon" style={{ width: 48, height: 48, background: 'var(--violet-soft)', color: 'var(--violet-text)' }}><Bot size={26} /></div>
              <h2>How can I help today?</h2>
              <p className="text-2">I read live data from the ERP (students, attendance, fees, exams, tests, leads, timetable) and answer with real numbers.</p>
              <div className="suggestions" style={{ justifyContent: 'center' }}>
                {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role === 'user' ? 'msg-user' : 'msg-ai'}`}>
              {m.role === 'user' ? m.content : <Markdown text={m.content} />}
            </div>
          ))}
          {busy && <div className="msg msg-ai row"><span className="spinner" /> Looking at your data…</div>}
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send() }}>
          <textarea
            className="textarea"
            value={input}
            placeholder="Type your question… (Enter to send, Shift+Enter for new line)"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button className="btn btn-ai" disabled={busy || !input.trim() || aiEnabled === false} aria-label="Send"><Send size={16} /></button>
        </form>
      </div>
    </>
  )
}
