import { useState } from 'react'
import { CalendarX2, Plus } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDate, fmtDateTime, today } from '../../lib/format.js'
import { useScope } from '../../lib/scope.jsx'
import { Async, Badge, Empty, Field, Modal, PageHead, useAction, useApi } from '../../components/ui.jsx'

const TONE = { pending: 'warn', approved: 'good', rejected: 'bad', cancelled: '' }

function LeaveForm({ base, onClose, onSaved }) {
  const [form, setForm] = useState({ from: today(), to: today(), reason: '' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value, ...(k === 'from' && form.to < e.target.value ? { to: e.target.value } : {}) })
  const submit = async (e) => {
    e.preventDefault()
    if (await run(() => api.post(`${base}/leaves`, form), 'Leave application sent to the class teacher.')) onSaved()
  }
  return (
    <Modal title="Apply for leave" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="leave-form" disabled={busy}>Send application</button></>}>
      <form id="leave-form" className="form-grid" onSubmit={submit}>
        <Field label="From *"><input className="input" type="date" value={form.from} onChange={set('from')} required /></Field>
        <Field label="To *"><input className="input" type="date" value={form.to} min={form.from} onChange={set('to')} required /></Field>
        <Field label="Reason *" full><textarea className="textarea" value={form.reason} onChange={set('reason')} required minLength={3} placeholder="e.g. Fever — doctor advised two days of rest." /></Field>
        <p className="small muted full">Sundays are not counted. Once approved, these days are marked as leave (not absent) in attendance.</p>
      </form>
    </Modal>
  )
}

export default function MyLeaves() {
  const { api: base, my } = useScope()
  const state = useApi(`${base}/leaves`)
  const [adding, setAdding] = useState(false)
  const [run] = useAction()
  const cancel = async (id) => { if (await run(() => api.del(`${base}/leaves/${id}`), 'Application cancelled.')) state.reload() }

  return (
    <>
      <PageHead title={my('leave applications')} subtitle="Apply for leave in advance, or within 15 days after an absence.">
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Apply for leave</button>
      </PageHead>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Dates</th><th>Reason</th><th>Applied</th><th>Status</th><th /></tr></thead>
              <tbody>{rows.map((l) => (
                <tr key={l._id}>
                  <td className="nowrap">{fmtDate(l.from)}{l.to !== l.from && <> → {fmtDate(l.to)}</>}</td>
                  <td style={{ maxWidth: 360 }}>{l.reason}{l.reviewNote && <div className="small muted">{l.reviewedBy}: {l.reviewNote}</div>}</td>
                  <td className="small text-2">{fmtDateTime(l.createdAt)}<div>by {l.requestedByName || '—'}</div></td>
                  <td><Badge tone={TONE[l.status]}>{l.status.charAt(0).toUpperCase() + l.status.slice(1)}</Badge></td>
                  <td>{l.status === 'pending' && <button className="btn btn-sm" onClick={() => cancel(l._id)}>Cancel</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty icon={CalendarX2} text="No leave applications yet." />}</Async>
      {adding && <LeaveForm base={base} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload() }} />}
    </>
  )
}
