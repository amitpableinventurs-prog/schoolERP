import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDate, money, today } from '../../lib/format.js'
import { Async, Badge, Confirm, Empty, Field, Modal, PageHead, SearchInput, Segmented, StatusBadge, useAction, useApi } from '../../components/ui.jsx'

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
