import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarX2, Check, X } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, fmtDateTime } from '../../lib/format.js'
import { Async, Badge, BatchSelect, Empty, Field, Modal, PageHead, Segmented, useAction, useApi, useToast } from '../../components/ui.jsx'

const TONE = { pending: 'warn', approved: 'good', rejected: 'bad', cancelled: '' }

function Review({ leave, status, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [run, busy] = useAction()
  const submit = async () => {
    const r = await run(() => api.put(`/leaves/${leave._id}`, { status, note }))
    if (r) onDone(r)
  }
  return (
    <Modal title={status === 'approved' ? 'Approve leave' : 'Reject leave'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>{status === 'approved' ? 'Approve' : 'Reject'}</button></>}>
      <div className="stack">
        <p><strong>{leave.student?.name}</strong> · {fmtDate(leave.from)}{leave.to !== leave.from && ` → ${fmtDate(leave.to)}`}</p>
        <p className="text-2">{leave.reason}</p>
        {status === 'approved' && <div className="alert alert-info small">These days will be marked as Leave (L) in attendance, except days already marked present.</div>}
        <Field label="Note to the parent / student (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === 'approved' ? 'e.g. Get well soon.' : 'Reason for rejecting'} /></Field>
      </div>
    </Modal>
  )
}

export default function Leaves() {
  const [status, setStatus] = useState('pending')
  const [batch, setBatch] = useState('')
  const state = useApi(`/leaves${qs({ status, batch })}`)
  const [review, setReview] = useState(null)
  const toast = useToast()
  return (
    <>
      <PageHead title="Leave Requests" subtitle="Leave applications sent by parents and students from their portal." />
      <div className="filters">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: '', label: 'All' }]} />
        <BatchSelect value={batch} onChange={setBatch} />
      </div>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Student</th><th>Dates</th><th>Reason</th><th>Applied by</th><th>Status</th><th /></tr></thead>
              <tbody>{rows.map((l) => (
                <tr key={l._id}>
                  <td>{l.student ? <Link className="cell-title" to={`/students/${l.student._id}`}>{l.student.name}</Link> : '—'}<div className="cell-sub">{l.batch?.name}</div></td>
                  <td className="nowrap">{fmtDate(l.from)}{l.to !== l.from && <div className="small muted">to {fmtDate(l.to)}</div>}</td>
                  <td style={{ maxWidth: 320 }}>{l.reason}{l.reviewNote && <div className="small muted">{l.reviewedBy}: {l.reviewNote}</div>}</td>
                  <td className="small text-2">{l.requestedByName}<div>{l.requestedByRole === 'parent' ? 'Parent' : 'Student'} · {fmtDateTime(l.createdAt)}</div></td>
                  <td><Badge tone={TONE[l.status]}>{l.status.charAt(0).toUpperCase() + l.status.slice(1)}</Badge></td>
                  <td className="nowrap">{l.status === 'pending' && (
                    <div className="row" style={{ flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => setReview({ leave: l, status: 'approved' })}><Check size={14} /> Approve</button>
                      <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setReview({ leave: l, status: 'rejected' })} aria-label="Reject"><X size={14} /></button>
                    </div>
                  )}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty icon={CalendarX2} text={status === 'pending' ? 'No pending leave applications.' : 'Nothing here.'} />}</Async>
      {review && <Review {...review} onClose={() => setReview(null)} onDone={(r) => { setReview(null); toast(r.leave.status === 'approved' ? `Approved. ${r.marked} day${r.marked === 1 ? '' : 's'} marked as leave.` : 'Rejected.'); state.reload(); window.dispatchEvent(new Event('leaves-changed')) }} />}
    </>
  )
}
