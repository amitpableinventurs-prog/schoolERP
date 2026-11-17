import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Pause, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDate, fmtDateTime, money, today } from '../../lib/format.js'
import { Async, Badge, Confirm, Empty, Field, Modal, PageHead, SearchInput, Segmented, StatusBadge, Tabs, useAction, useApi } from '../../components/ui.jsx'

const REQ_TONE = { pending: 'warn', approved: 'good', rejected: 'bad', cancelled: '' }

function ReviewModal({ request: r, approve, onClose, onSaved }) {
  const stop = r.route?.stops?.find((s) => String(s._id) === String(r.stop))
  const fee = Number(stop?.fee) > 0 ? Number(stop.fee) : Number(r.route?.monthlyFee) || r.monthlyFee || 0
  const [form, setForm] = useState({ note: '', monthlyFee: fee })
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    const body = { status: approve ? 'approved' : 'rejected', note: form.note, ...(approve ? { monthlyFee: Number(form.monthlyFee) || 0 } : {}) }
    if (await run(() => api.put(`/transport/requests/${r._id}`, body), approve ? 'Approved — the student is now on the route.' : 'Request rejected.')) {
      window.dispatchEvent(new Event('transport-requests-changed'))
      onSaved()
    }
  }
  return (
    <Modal title={`${approve ? 'Approve' : 'Reject'} transport for ${r.student?.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={`btn ${approve ? 'btn-primary' : 'btn-danger'}`} form="review-form" disabled={busy}>{approve ? 'Approve' : 'Reject'}</button></>}>
      <form id="review-form" className="form-grid" onSubmit={submit}>
        <div className="full small text-2">
          {r.route?.name} → <strong>{r.stopName}</strong> from {fmtDate(r.startDate)} · {[r.pickup && 'pickup', r.drop && 'drop'].filter(Boolean).join(' + ')}
          {r.route?.vehicle?.capacity ? ` · ${r.riders}/${r.route.vehicle.capacity} seats taken` : ` · ${r.riders} riders now`}
          {r.current && <div className="alert alert-info small" style={{ marginTop: 8 }}>Currently on {r.current.route?.name} ({r.current.stopName}). Approving ends that seat and starts the new one.</div>}
        </div>
        {approve && <Field label="Monthly fee (₹)"><input className="input" type="number" min={0} value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: e.target.value })} /></Field>}
        <Field label={approve ? 'Message (optional)' : 'Reason (shown to the parent)'} full><textarea className="textarea" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} required={!approve} style={{ minHeight: 60 }} /></Field>
      </form>
    </Modal>
  )
}

// Applications sent from the student / parent app.
function Requests() {
  const [status, setStatus] = useState('pending')
  const state = useApi(`/transport/requests?status=${status}`)
  const [review, setReview] = useState(null)
  return (
    <>
      <div className="filters">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'pending', label: 'Waiting' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'cancelled', label: 'Cancelled' }]} />
      </div>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Student</th><th>Route → stop</th><th>From</th><th>Applied</th><th>Status</th><th /></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r._id}>
                  <td><Link to={`/students/${r.student?._id}`}><strong>{r.student?.name}</strong></Link><div className="cell-sub">{r.student?.admissionNo} · {r.student?.batch?.name}</div></td>
                  <td>{r.route?.name || '—'}<div className="cell-sub">{r.stopName}{r.monthlyFee ? ` · ${money(r.monthlyFee)}/mo` : ''} · {[r.pickup && 'pickup', r.drop && 'drop'].filter(Boolean).join(' + ')}</div>{r.note && <div className="small text-2">“{r.note}”</div>}</td>
                  <td className="nowrap">{fmtDate(r.startDate)}</td>
                  <td className="small">{fmtDateTime(r.createdAt)}<div className="cell-sub">by {r.requestedByName} ({r.requestedByRole})</div></td>
                  <td><Badge tone={REQ_TONE[r.status]}>{r.status}</Badge>{r.reviewNote && <div className="small muted">{r.reviewNote}</div>}</td>
                  <td>{r.status === 'pending' && (
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => setReview({ r, approve: true })}><Check size={13} /> Approve</button>
                      <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setReview({ r, approve: false })} aria-label="Reject"><X size={14} /></button>
                    </div>
                  )}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty text={status === 'pending' ? 'No transport applications waiting.' : 'Nothing here.'} />}</Async>
      {review && <ReviewModal request={review.r} approve={review.approve} onClose={() => setReview(null)} onSaved={() => { setReview(null); state.reload() }} />}
    </>
  )
}

function AssignmentForm({ item, onClose, onSaved }) {
  const routes = useApi('/transport/routes?status=active')
  const students = useApi('/students?status=active')
  const [form, setForm] = useState(() => item ? {
    student: item.student?._id || '',
    route: item.route?._id || '',
    stop: item.stop || '',
    pickup: item.pickup !== false,
    drop: item.drop !== false,
    monthlyFee: item.monthlyFee || 0,
    startDate: item.startDate || today(),
    endDate: item.endDate || '',
    notes: item.notes || '',
  } : { student: '', route: '', stop: '', pickup: true, drop: true, monthlyFee: 0, startDate: today(), endDate: '', notes: '' })
  const [run, busy] = useAction()
  const route = (routes.data || []).find((r) => r._id === form.route)
  const stops = useMemo(() => (route?.stops || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0)), [route])
  const stop = stops.find((s) => s._id === form.stop)
  const suggestedFee = stop ? (Number(stop.fee) > 0 ? Number(stop.fee) : Number(route?.monthlyFee) || 0) : 0

  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, monthlyFee: Number(form.monthlyFee) || suggestedFee || 0 }
    const ok = await run(() => (item ? api.put(`/transport/assignments/${item._id}`, body) : api.post('/transport/assignments', body)), 'Saved.')
    if (ok) onSaved()
  }
  return (
    <Modal title={item ? 'Edit assignment' : 'Assign student to a route'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="assn-form" disabled={busy}>Save</button></>}>
      <form id="assn-form" className="form-grid" onSubmit={submit}>
        <Field label="Student *" full>
          <select className="select" value={form.student} onChange={(e) => setForm({ ...form, student: e.target.value })} required disabled={!!item}>
            <option value="">—</option>
            {(students.data || []).map((s) => <option key={s._id} value={s._id}>{s.name} · {s.admissionNo} · {s.batch?.name}</option>)}
          </select>
        </Field>
        <Field label="Route *">
          <select className="select" value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value, stop: '' })} required>
            <option value="">—</option>
            {(routes.data || []).map((r) => <option key={r._id} value={r._id}>{r.name}{r.code ? ` (${r.code})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Stop *">
          <select className="select" value={form.stop} onChange={(e) => { const s = stops.find((x) => x._id === e.target.value); setForm({ ...form, stop: e.target.value, monthlyFee: Number(s?.fee) > 0 ? Number(s.fee) : (Number(route?.monthlyFee) || 0) }) }} required>
            <option value="">—</option>
            {stops.map((s) => <option key={s._id} value={s._id}>{s.sequence || 0}. {s.name}{s.pickupTime ? ` · ${s.pickupTime}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Monthly fee (₹)" hint={suggestedFee ? `Stop default: ${money(suggestedFee)}` : 'Falls back to route default'}>
          <input className="input" type="number" value={form.monthlyFee} onChange={(e) => setForm({ ...form, monthlyFee: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Direction">
          <div className="row" style={{ gap: 14 }}>
            <label className="check"><input type="checkbox" checked={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.checked })} /> Pickup</label>
            <label className="check"><input type="checkbox" checked={form.drop} onChange={(e) => setForm({ ...form, drop: e.target.checked })} /> Drop</label>
          </div>
        </Field>
        <Field label="Start date"><input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
        <Field label="End date (optional)"><input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
        <Field label="Notes" full><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </form>
    </Modal>
  )
}

export default function TransportAssignments() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'requests' ? 'requests' : 'riders'
  const tabs = <Tabs value={tab} onChange={(v) => setParams(v === 'requests' ? { tab: 'requests' } : {}, { replace: true })} tabs={[{ value: 'riders', label: 'Students on routes' }, { value: 'requests', label: 'Applications from the app' }]} />
  if (tab === 'requests') {
    return (
      <>
        <PageHead title="Student Assignments" subtitle="Transport applications sent by students and parents from the app. Approving puts the student on the route." />
        {tabs}
        <Requests />
      </>
    )
  }
  return <Riders tabs={tabs} />
}

function Riders({ tabs }) {
  const [status, setStatus] = useState('active')
  const [routeId, setRouteId] = useState('')
  const [q, setQ] = useState('')
  const routes = useApi('/transport/routes')
  const state = useApi(`/transport/assignments?${new URLSearchParams({ status, ...(routeId && { route: routeId }) })}`)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()
  const refresh = () => state.reload()

  const changeStatus = async (a, next) => {
    if (await run(() => api.put(`/transport/assignments/${a._id}`, { status: next }), 'Updated.')) refresh()
  }

  return (
    <>
      <PageHead title="Student Assignments" subtitle="Which students ride which route, where they board, and the monthly fee locked at assignment time.">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Assign student</button>
      </PageHead>
      {tabs}
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Filter by student name or admission #…" />
        <select className="select" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          <option value="">All routes</option>
          {(routes.data || []).map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
        </select>
        <Segmented value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'cancelled', label: 'Cancelled' }, { value: '', label: 'All' }]} />
      </div>
      <Async state={state}>{(list) => {
        const needle = q.trim().toLowerCase()
        const rows = needle ? list.filter((a) => (a.student?.name || '').toLowerCase().includes(needle) || (a.student?.admissionNo || '').toLowerCase().includes(needle)) : list
        if (!rows.length) return <Empty text="No assignments match these filters." />
        return (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Class / Batch</th><th>Route</th><th>Stop</th><th>Direction</th><th className="num">Fee / mo</th><th>Starts</th><th>Status</th><th></th></tr></thead>
                <tbody>{rows.map((a) => (
                  <tr key={a._id}>
                    <td>
                      <Link to={`/students/${a.student?._id}`}><strong>{a.student?.name || '—'}</strong></Link>
                      <div className="small muted">{a.student?.admissionNo} {a.student?.guardianPhone ? `· ${a.student.guardianPhone}` : ''}</div>
                    </td>
                    <td>{a.student?.batch?.name || '—'}</td>
                    <td>{a.route?.name || '—'}{a.route?.vehicle?.number && <div className="small muted">{a.route.vehicle.number}</div>}</td>
                    <td>{a.stopName || '—'}</td>
                    <td className="small">
                      {a.pickup && <Badge tone="info">Pickup</Badge>} {a.drop && <Badge tone="info">Drop</Badge>}
                    </td>
                    <td className="num">{money(a.monthlyFee)}</td>
                    <td>{fmtDate(a.startDate)}</td>
                    <td><StatusBadge value={a.status} /></td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {a.status === 'active' && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => changeStatus(a, 'paused')} title="Pause"><Pause size={14} /></button>}
                        {a.status === 'paused' && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => changeStatus(a, 'active')} title="Resume"><Play size={14} /></button>}
                        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(a)} title="Edit"><Pencil size={14} /></button>
                        <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(a)} title="Cancel/Remove"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )
      }}</Async>
      {editing && <AssignmentForm item={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      {deleting && <Confirm text={`Remove ${deleting.student?.name} from ${deleting.route?.name}? If there are invoices or attendance, the assignment is marked cancelled instead of deleted.`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (await run(() => api.del(`/transport/assignments/${deleting._id}`), 'Removed.')) { setDeleting(null); refresh() }
      }} />}
    </>
  )
}
