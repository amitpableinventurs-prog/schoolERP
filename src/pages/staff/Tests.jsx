import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, fmtDateTime } from '../../lib/format.js'
import { Async, Badge, BatchSelect, Confirm, Empty, PageHead, StatusBadge, useAction, useApi } from '../../components/ui.jsx'

export default function Tests() {
  const [batch, setBatch] = useState('')
  const state = useApi(`/tests${qs({ batch })}`)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()

  const setStatus = async (t, status) => {
    if (await run(() => api.put(`/tests/${t._id}`, { status }), status === 'published' ? 'Test is live for students.' : 'Updated.')) state.reload()
  }

  return (
    <>
      <PageHead title="Online Tests" subtitle="Timed MCQ tests with negative marking, auto-grading and instant rank lists — perfect for coaching batches.">
        <Link className="btn btn-primary" to="/tests/new"><Plus size={16} /> New test</Link>
      </PageHead>
      <div className="filters"><BatchSelect value={batch} onChange={setBatch} /></div>
      <Async state={state}>{(rows) => (
        <div className="card">
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Test</th><th>Batch</th><th className="num">Questions</th><th className="num">Duration</th><th className="num">Attempts</th><th className="num">Avg score</th><th>Status</th><th /></tr></thead>
                <tbody>{rows.map((t) => (
                  <tr key={t._id}>
                    <td>
                      <div className="cell-title row" style={{ gap: 6 }}>{t.title}{t.aiGenerated && <Badge tone="ai"><Sparkles size={11} /> AI</Badge>}</div>
                      <div className="cell-sub">{[t.subject, t.topic].filter(Boolean).join(' · ')} · {fmtDate(t.createdAt)}</div>
                    </td>
                    <td>{t.batch?.name}</td>
                    <td className="num">{t.questionCount}</td>
                    <td className="num">{t.durationMin} min{(t.startAt || t.endAt) && <div className="cell-sub nowrap">{t.startAt ? fmtDateTime(t.startAt) : 'now'} – {t.endAt ? fmtDateTime(t.endAt) : 'open'}</div>}</td>
                    <td className="num">{t.attempts}</td>
                    <td className="num">{t.avgScore ?? '—'}</td>
                    <td><StatusBadge value={t.status} /></td>
                    <td className="nowrap">
                      {t.status === 'draft' && <button className="btn btn-sm btn-primary" onClick={() => setStatus(t, 'published')} disabled={busy || !t.questionCount}>Publish</button>}
                      {t.status === 'published' && <button className="btn btn-sm" onClick={() => setStatus(t, 'closed')} disabled={busy}>Close</button>}
                      {t.status === 'closed' && <button className="btn btn-sm" onClick={() => setStatus(t, 'published')} disabled={busy}>Reopen</button>}
                      <Link className="btn btn-sm btn-ghost btn-icon" to={`/tests/${t._id}/results`} aria-label="Results" title="Results"><BarChart3 size={14} /></Link>
                      <Link className="btn btn-sm btn-ghost btn-icon" to={`/tests/${t._id}/edit`} aria-label="Edit" title="Edit"><Pencil size={14} /></Link>
                      <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(t)} aria-label="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="No tests yet. Create one — Claude can write the questions for you." />}
        </div>
      )}</Async>
      {deleting && <Confirm text={`Delete "${deleting.title}" and all attempts?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await run(() => api.del(`/tests/${deleting._id}`), 'Deleted.')) { setDeleting(null); state.reload() } }} />}
    </>
  )
}
