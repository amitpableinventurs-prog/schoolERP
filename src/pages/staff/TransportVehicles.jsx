import { useState } from 'react'
import { Pencil, Phone, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { myWings, useAuth, WING_LABEL } from '../../lib/auth.jsx'
import { fmtDate } from '../../lib/format.js'
import { Async, Badge, Confirm, Empty, Field, Modal, PageHead, SearchInput, Segmented, StatusBadge, useAction, useApi, WingPicker } from '../../components/ui.jsx'

const EMPTY = {
  number: '', model: '', type: 'bus', capacity: 40,
  driverName: '', driverPhone: '', driverLicense: '',
  conductorName: '', conductorPhone: '',
  insuranceExpiry: '', fitnessExpiry: '', pucExpiry: '', permitExpiry: '',
  gpsDeviceId: '', status: 'active', notes: '', wings: [],
}
const TYPES = [
  { value: 'bus', label: 'Bus' }, { value: 'van', label: 'Van' },
  { value: 'car', label: 'Car' }, { value: 'auto', label: 'Auto' }, { value: 'tempo', label: 'Tempo' },
]

function VehicleForm({ item, allowed, onClose, onSaved }) {
  const [form, setForm] = useState(item ? { ...EMPTY, ...item, wings: item.wings || [] } : { ...EMPTY, wings: allowed.length === 1 ? [allowed[0]] : [] })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, capacity: Number(form.capacity) || 0 }
    const ok = await run(() => (item ? api.put(`/transport/vehicles/${item._id}`, body) : api.post('/transport/vehicles', body)), 'Saved.')
    if (ok) onSaved()
  }
  return (
    <Modal title={item ? 'Edit vehicle' : 'Add vehicle'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="veh-form" disabled={busy}>Save</button></>}>
      <form id="veh-form" className="form-grid" onSubmit={submit}>
        <Field label="Vehicle number *"><input className="input" value={form.number} onChange={set('number')} placeholder="UP 32 AB 1234" required /></Field>
        <Field label="Model"><input className="input" value={form.model || ''} onChange={set('model')} placeholder="Tata LP 912" /></Field>
        <Field label="Type"><Segmented value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={TYPES} /></Field>
        <Field label="Seating capacity"><input className="input" type="number" value={form.capacity} onChange={set('capacity')} /></Field>
        <Field label="Driver name"><input className="input" value={form.driverName || ''} onChange={set('driverName')} /></Field>
        <Field label="Driver phone"><input className="input" value={form.driverPhone || ''} onChange={set('driverPhone')} /></Field>
        <Field label="Driver licence #"><input className="input" value={form.driverLicense || ''} onChange={set('driverLicense')} /></Field>
        <Field label="Conductor name"><input className="input" value={form.conductorName || ''} onChange={set('conductorName')} /></Field>
        <Field label="Conductor phone"><input className="input" value={form.conductorPhone || ''} onChange={set('conductorPhone')} /></Field>
        <Field label="GPS device id"><input className="input" value={form.gpsDeviceId || ''} onChange={set('gpsDeviceId')} /></Field>
        <Field label="Insurance expiry"><input className="input" type="date" value={form.insuranceExpiry || ''} onChange={set('insuranceExpiry')} /></Field>
        <Field label="Fitness expiry"><input className="input" type="date" value={form.fitnessExpiry || ''} onChange={set('fitnessExpiry')} /></Field>
        <Field label="PUC expiry"><input className="input" type="date" value={form.pucExpiry || ''} onChange={set('pucExpiry')} /></Field>
        <Field label="Permit expiry"><input className="input" type="date" value={form.permitExpiry || ''} onChange={set('permitExpiry')} /></Field>
        <Field label="Status"><select className="select" value={form.status} onChange={set('status')}><option value="active">Active</option><option value="maintenance">In maintenance</option><option value="retired">Retired</option></select></Field>
        <Field label="Wings" hint="Leave empty for whole institute" full>
          <WingPicker value={form.wings} allowed={allowed} onChange={(v) => setForm({ ...form, wings: v })} />
        </Field>
        <Field label="Notes" full><textarea className="input" rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  )
}

const expiryTone = (date) => {
  if (!date) return null
  const today = new Date().toISOString().slice(0, 10)
  if (date < today) return 'bad'
  const soon = new Date(); soon.setDate(soon.getDate() + 30)
  if (date < soon.toISOString().slice(0, 10)) return 'warn'
  return null
}

export default function TransportVehicles() {
  const { user } = useAuth()
  const allowed = myWings(user)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const state = useApi(`/transport/vehicles?${new URLSearchParams({ q, status })}`)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()
  const refresh = () => state.reload()

  return (
    <>
      <PageHead title="Vehicles" subtitle="Buses, vans and other vehicles used for student transport.">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add vehicle</button>
      </PageHead>
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Search by number, driver, model…" />
        <Segmented value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'maintenance', label: 'Maintenance' }, { value: 'retired', label: 'Retired' }]} />
      </div>
      <Async state={state}>{(list) => (list.length ? (
        <div className="grid grid-3">
          {list.map((v) => (
            <div className="card card-pad stack" key={v._id}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-mono, inherit)' }}>{v.number}</h2>
                  <div className="small muted">{v.model || '—'} · {v.type} · {v.capacity} seats</div>
                </div>
                <StatusBadge value={v.status} />
              </div>
              <div className="small">
                <div><strong>Driver:</strong> {v.driverName || '—'} {v.driverPhone && <span className="row" style={{ display: 'inline-flex', gap: 3 }}><Phone size={11} />{v.driverPhone}</span>}</div>
                {v.conductorName && <div><strong>Conductor:</strong> {v.conductorName} {v.conductorPhone && `· ${v.conductorPhone}`}</div>}
              </div>
              <div className="row small" style={{ gap: 6, flexWrap: 'wrap' }}>
                {['insuranceExpiry', 'fitnessExpiry', 'pucExpiry', 'permitExpiry'].map((k) => {
                  if (!v[k]) return null
                  const labels = { insuranceExpiry: 'Insurance', fitnessExpiry: 'Fitness', pucExpiry: 'PUC', permitExpiry: 'Permit' }
                  const tone = expiryTone(v[k])
                  return <Badge key={k} tone={tone || 'info'}>{labels[k]} {fmtDate(v[k])}</Badge>
                })}
              </div>
              <div className="row small" style={{ gap: 6, flexWrap: 'wrap' }}>
                {v.wings?.length ? v.wings.map((w) => <Badge key={w}>{WING_LABEL[w]}</Badge>) : <Badge tone="ai">Whole institute</Badge>}
                {v.routes > 0 && <Badge tone="info">On {v.routes} route{v.routes > 1 ? 's' : ''}</Badge>}
              </div>
              <div className="row">
                <span style={{ flex: 1 }} />
                <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(v)} aria-label="Edit"><Pencil size={14} /></button>
                <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(v)} aria-label="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty text="No vehicles yet. Add your first bus to get started." />)}</Async>
      {editing && <VehicleForm item={editing._id ? editing : null} allowed={allowed} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      {deleting && <Confirm text={deleting.routes ? `${deleting.number} is on ${deleting.routes} route(s). Remove it from the route first.` : `Delete vehicle ${deleting.number}?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (deleting.routes) return setDeleting(null)
        if (await run(() => api.del(`/transport/vehicles/${deleting._id}`), 'Deleted.')) { setDeleting(null); refresh() }
      }} confirmLabel={deleting.routes ? 'OK' : 'Delete'} />}
    </>
  )
}
