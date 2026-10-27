import { useState } from 'react'
import { Clock, GripVertical, LocateFixed, MapPin, MapPinned, Pencil, Plus, Route as RouteIcon, Trash2, Users } from 'lucide-react'
import LiveMap from '../../components/LiveMap.jsx'
import { api } from '../../lib/api.js'
import { myWings, useAuth, WING_LABEL } from '../../lib/auth.jsx'
import { money } from '../../lib/format.js'
import { Async, Badge, Confirm, Empty, Field, Modal, PageHead, SearchInput, StatusBadge, useAction, useApi, WingPicker } from '../../components/ui.jsx'

const EMPTY = { name: '', code: '', vehicle: '', incharge: '', startTime: '', endTime: '', totalKm: 0, monthlyFee: 0, status: 'active', notes: '', wings: [] }

function RouteForm({ item, allowed, onClose, onSaved }) {
  const vehicles = useApi('/transport/vehicles?status=active')
  const staff = useApi('/staff?status=active')
  const [form, setForm] = useState(item ? { ...EMPTY, ...item, vehicle: item.vehicle?._id || '', incharge: item.incharge?._id || '', wings: item.wings || [] } : { ...EMPTY, wings: allowed.length === 1 ? [allowed[0]] : [] })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, totalKm: Number(form.totalKm) || 0, monthlyFee: Number(form.monthlyFee) || 0, vehicle: form.vehicle || null, incharge: form.incharge || null }
    const ok = await run(() => (item ? api.put(`/transport/routes/${item._id}`, body) : api.post('/transport/routes', body)), 'Saved.')
    if (ok) onSaved()
  }
  return (
    <Modal title={item ? 'Edit route' : 'New route'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="route-form" disabled={busy}>Save</button></>}>
      <form id="route-form" className="form-grid" onSubmit={submit}>
        <Field label="Route name *"><input className="input" value={form.name} onChange={set('name')} placeholder="Route A – Civil Lines" required /></Field>
        <Field label="Short code"><input className="input" value={form.code || ''} onChange={set('code')} placeholder="R-A" /></Field>
        <Field label="Vehicle">
          <select className="select" value={form.vehicle || ''} onChange={set('vehicle')}>
            <option value="">—</option>
            {(vehicles.data || []).map((v) => <option key={v._id} value={v._id}>{v.number} · {v.model || v.type}</option>)}
          </select>
        </Field>
        <Field label="Incharge (staff)">
          <select className="select" value={form.incharge || ''} onChange={set('incharge')}>
            <option value="">—</option>
            {(staff.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Start time"><input className="input" type="time" value={form.startTime || ''} onChange={set('startTime')} /></Field>
        <Field label="End time"><input className="input" type="time" value={form.endTime || ''} onChange={set('endTime')} /></Field>
        <Field label="Total distance (km)"><input className="input" type="number" value={form.totalKm} onChange={set('totalKm')} /></Field>
        <Field label="Default monthly fee (₹)" hint="Used when a stop has no fee of its own"><input className="input" type="number" value={form.monthlyFee} onChange={set('monthlyFee')} /></Field>
        <Field label="Status"><select className="select" value={form.status} onChange={set('status')}><option value="active">Active</option><option value="suspended">Suspended</option></select></Field>
        <Field label="Wings" hint="Leave empty for whole institute" full>
          <WingPicker value={form.wings} allowed={allowed} onChange={(v) => setForm({ ...form, wings: v })} />
        </Field>
        <Field label="Notes" full><textarea className="input" rows={2} value={form.notes || ''} onChange={set('notes')} /></Field>
      </form>
    </Modal>
  )
}

// Click on the map (or paste "lat, lng" from Google Maps) to place one stop.
function StopPicker({ stop, others, onClose, onPick }) {
  const [point, setPoint] = useState(stop.lat != null ? { lat: stop.lat, lng: stop.lng } : null)
  const [text, setText] = useState(stop.lat != null ? `${stop.lat}, ${stop.lng}` : '')
  const [error, setError] = useState(null)
  const choose = (p) => { setPoint(p); setText(`${p.lat}, ${p.lng}`); setError(null) }
  const typed = (value) => {
    setText(value)
    const m = value.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/)
    if (m && Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180) { setPoint({ lat: Number(m[1]), lng: Number(m[2]) }); setError(null) }
  }
  const here = () => navigator.geolocation?.getCurrentPosition(
    (p) => choose({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }),
    () => setError('Could not read the location of this device (it needs permission and an https address).'),
    { enableHighAccuracy: true, timeout: 15_000 },
  )
  return (
    <Modal title={`Map position – ${stop.name || 'stop'}`} size="lg" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      {stop.lat != null && <button className="btn btn-ghost" onClick={() => onPick({ lat: undefined, lng: undefined })}>Remove position</button>}
      <button className="btn btn-primary" disabled={!point} onClick={() => onPick(point)}>Use this position</button>
    </>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Zoom in and click exactly where the bus stops. Other stops of this route are shown in blue.</p>
        <LiveMap stops={others} picked={point} onPick={choose} fitKey="open" height={420} />
        <div className="row" style={{ gap: 8 }}>
          <input className="input mono" value={text} onChange={(e) => typed(e.target.value)} placeholder="26.9124, 75.7873 (paste from Google Maps)" />
          <button className="btn" onClick={here} title="Use this device's current location"><LocateFixed size={15} /> I am here</button>
        </div>
        {error && <div className="small" style={{ color: 'var(--bad-text)' }}>{error}</div>}
      </div>
    </Modal>
  )
}

function StopsEditor({ route, onClose, onSaved }) {
  const [stops, setStops] = useState(() => (route.stops || []).map((s) => ({ ...s })))
  const [picking, setPicking] = useState(null) // index of the stop being placed
  const [run, busy] = useAction()
  const add = () => setStops([...stops, { name: '', sequence: stops.length + 1, pickupTime: '', dropTime: '', fee: 0, landmark: '' }])
  const update = (idx, k, v) => setStops(stops.map((s, i) => (i === idx ? { ...s, [k]: v } : s)))
  const remove = (idx) => setStops(stops.filter((_, i) => i !== idx))
  const move = (idx, dir) => {
    const next = [...stops]
    const to = idx + dir
    if (to < 0 || to >= next.length) return
    ;[next[idx], next[to]] = [next[to], next[idx]]
    setStops(next.map((s, i) => ({ ...s, sequence: i + 1 })))
  }
  const save = async () => {
    const ok = await run(() => api.put(`/transport/routes/${route._id}/stops`, { stops }), 'Stops saved.')
    if (ok) onSaved()
  }
  return (
    <>
    <Modal title={`Stops – ${route.name}`} size="lg" onClose={() => picking == null && onClose()} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" onClick={save} disabled={busy}>Save stops</button>
    </>}>
      <div className="stack">
        <p className="small muted">Order the stops from the first pickup to the school. The school/depot is typically the last stop. Riders with active assignments cannot be removed before reassignment.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th style={{ width: 24 }}></th><th>#</th><th>Stop name</th><th>Pickup</th><th>Drop</th><th className="num">Fee (₹/mo)</th><th>Landmark</th><th>Map</th><th></th></tr></thead>
            <tbody>
              {stops.map((s, idx) => (
                <tr key={s._id || idx}>
                  <td><GripVertical size={14} className="muted" /></td>
                  <td className="num">
                    <div className="row" style={{ gap: 2 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => move(idx, -1)} aria-label="Move up">↑</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => move(idx, 1)} aria-label="Move down">↓</button>
                    </div>
                  </td>
                  <td><input className="input" value={s.name} onChange={(e) => update(idx, 'name', e.target.value)} placeholder="Stop name" /></td>
                  <td><input className="input" type="time" value={s.pickupTime || ''} onChange={(e) => update(idx, 'pickupTime', e.target.value)} /></td>
                  <td><input className="input" type="time" value={s.dropTime || ''} onChange={(e) => update(idx, 'dropTime', e.target.value)} /></td>
                  <td><input className="input num" type="number" value={s.fee || 0} onChange={(e) => update(idx, 'fee', Number(e.target.value) || 0)} /></td>
                  <td><input className="input" value={s.landmark || ''} onChange={(e) => update(idx, 'landmark', e.target.value)} placeholder="Near…" /></td>
                  <td><button className={`btn btn-sm${s.lat != null ? '' : ' btn-ghost'}`} onClick={() => setPicking(idx)} title={s.lat != null ? `${s.lat}, ${s.lng}` : 'Set the position on the map'}><MapPinned size={14} /> {s.lat != null ? 'Set' : 'Pick'}</button></td>
                  <td><button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => remove(idx)} aria-label="Remove stop"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div><button className="btn" onClick={add}><Plus size={14} /> Add stop</button></div>
      </div>
    </Modal>
      {picking != null && (
        <StopPicker
          stop={stops[picking]}
          others={stops.filter((s, i) => i !== picking && s.lat != null).map((s) => ({ id: s._id || s.name, lat: s.lat, lng: s.lng, name: s.name }))}
          onClose={() => setPicking(null)}
          onPick={(p) => { setStops(stops.map((s, i) => (i === picking ? { ...s, lat: p.lat, lng: p.lng } : s))); setPicking(null) }}
        />
      )}
    </>
  )
}

export default function TransportRoutes() {
  const { user } = useAuth()
  const allowed = myWings(user)
  const [q, setQ] = useState('')
  const state = useApi(`/transport/routes?${new URLSearchParams({ q })}`)
  const [editing, setEditing] = useState(null)
  const [stopping, setStopping] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()
  const refresh = () => state.reload()

  return (
    <>
      <PageHead title="Routes & Stops" subtitle="A route carries one vehicle through many stops. Students join at a stop and pay a monthly fee.">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> New route</button>
      </PageHead>
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Search by route, code or stop…" />
      </div>
      <Async state={state}>{(list) => (list.length ? (
        <div className="grid grid-2">
          {list.map((r) => (
            <div className="card card-pad stack" key={r._id}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h2><RouteIcon size={16} /> {r.name} {r.code && <span className="small muted">· {r.code}</span>}</h2>
                  <div className="small muted">
                    {r.vehicle ? <>Vehicle <strong>{r.vehicle.number}</strong></> : 'No vehicle'}
                    {r.incharge ? <> · Incharge {r.incharge.name}</> : null}
                  </div>
                </div>
                <StatusBadge value={r.status} />
              </div>
              <div className="row small" style={{ gap: 14 }}>
                <span className="row" style={{ gap: 4 }}><Clock size={13} /> {r.startTime || '—'} → {r.endTime || '—'}</span>
                <span className="row" style={{ gap: 4 }}><MapPin size={13} /> {r.stops?.length || 0} stops · {r.totalKm || 0} km</span>
                <span className="row" style={{ gap: 4 }}><Users size={13} /> {r.students || 0} riders</span>
              </div>
              <div>
                <div className="small muted mb">Stops</div>
                {r.stops?.length ? (
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {r.stops.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map((s, i) => (
                      <Badge key={s._id || i} tone="info" title={`${s.pickupTime || ''} · ${s.fee ? money(s.fee) : money(r.monthlyFee)}`}>{s.sequence || i + 1}. {s.name}</Badge>
                    ))}
                  </div>
                ) : <span className="small muted">No stops added yet.</span>}
              </div>
              <div className="row small" style={{ gap: 6 }}>
                {r.wings?.length ? r.wings.map((w) => <Badge key={w}>{WING_LABEL[w]}</Badge>) : <Badge tone="ai">Whole institute</Badge>}
                <span className="small muted" style={{ marginLeft: 'auto' }}>Default fee {money(r.monthlyFee)}/mo</span>
              </div>
              <div className="row">
                <button className="btn btn-sm" onClick={() => setStopping(r)}><MapPin size={13} /> Edit stops</button>
                <span style={{ flex: 1 }} />
                <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(r)} aria-label="Edit route"><Pencil size={14} /></button>
                <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(r)} aria-label="Delete route"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty text="No routes yet. Create one and then add its stops." />)}</Async>
      {editing && <RouteForm item={editing._id ? editing : null} allowed={allowed} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      {stopping && <StopsEditor route={stopping} onClose={() => setStopping(null)} onSaved={() => { setStopping(null); refresh() }} />}
      {deleting && <Confirm text={deleting.students ? `${deleting.name} has ${deleting.students} active riders. Move them first.` : `Delete route ${deleting.name}?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (deleting.students) return setDeleting(null)
        if (await run(() => api.del(`/transport/routes/${deleting._id}`), 'Deleted.')) { setDeleting(null); refresh() }
      }} confirmLabel={deleting.students ? 'OK' : 'Delete'} />}
    </>
  )
}
