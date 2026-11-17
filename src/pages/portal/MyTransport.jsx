import { useEffect, useMemo, useState } from 'react'
import { Bus, Clock, MapPin, Navigation, Phone, Route as RouteIcon, Send } from 'lucide-react'
import { api as http } from '../../lib/api.js'
import { fmtDate, money, timeAgo, today } from '../../lib/format.js'
import { distanceM, etaMinutes, fmtDistance, FRESH_LABEL, FRESH_TONE, freshness } from '../../lib/geo.js'
import LiveMap from '../../components/LiveMap.jsx'
import { Async, Badge, Empty, Field, Modal, PageHead, StatTile, StatusBadge, useAction, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

const REQ_TONE = { pending: 'warn', approved: 'good', rejected: 'bad', cancelled: '' }

// Apply for a seat (or a change of route / stop). The office approves it.
function ApplyForm({ base, change, onClose, onSaved }) {
  const options = useApi(`${base}/transport/options`)
  const [form, setForm] = useState({ route: '', stop: '', pickup: true, drop: true, startDate: today(), note: '' })
  const [run, busy] = useAction()
  const route = (options.data || []).find((r) => r._id === form.route)
  const stop = route?.stops.find((s) => s._id === form.stop)
  const submit = async (e) => {
    e.preventDefault()
    if (await run(() => http.post(`${base}/transport/requests`, form), 'Application sent. The school office will confirm your seat.')) onSaved()
  }
  return (
    <Modal title={change ? 'Change route / stop' : 'Apply for school transport'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="transport-form" disabled={busy || !form.stop}><Send size={15} /> {busy ? 'Sending…' : 'Send application'}</button></>}>
      <Async state={options}>{(routes) => routes.length ? (
        <form id="transport-form" className="form-grid" onSubmit={submit}>
          <Field label="Route *" full>
            <select className="select" value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value, stop: '' })} required>
              <option value="">Choose a route…</option>
              {routes.map((r) => <option key={r._id} value={r._id}>{r.name}{r.code ? ` (${r.code})` : ''}{r.vehicle?.number ? ` · ${r.vehicle.number}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Your stop *" full>
            <select className="select" value={form.stop} onChange={(e) => setForm({ ...form, stop: e.target.value })} required disabled={!route}>
              <option value="">{route ? 'Choose the nearest stop…' : 'Choose a route first'}</option>
              {route?.stops.map((s) => <option key={s._id} value={s._id}>{s.name}{s.pickupTime ? ` · pickup ${s.pickupTime}` : ''}{s.fee ? ` · ${money(s.fee)}/month` : ''}</option>)}
            </select>
          </Field>
          {stop && (
            <div className="full alert alert-info small">
              <strong>{stop.name}</strong>{stop.landmark ? ` (${stop.landmark})` : ''} · Pickup {stop.pickupTime || '—'} · Drop {stop.dropTime || '—'} · Fee <strong>{money(stop.fee)}</strong> per month
            </div>
          )}
          <Field label="Needed for">
            <div className="row" style={{ gap: 14 }}>
              <label className="check"><input type="checkbox" checked={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.checked })} /> Morning pickup</label>
              <label className="check"><input type="checkbox" checked={form.drop} onChange={(e) => setForm({ ...form, drop: e.target.checked })} /> Drop home</label>
            </div>
          </Field>
          <Field label="Start from"><input className="input" type="date" min={today()} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></Field>
          <Field label="Note for the office (optional)" full><textarea className="textarea" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ minHeight: 60 }} placeholder="e.g. Exact pickup point, sibling on the same bus…" /></Field>
        </form>
      ) : <Empty icon={Bus} text="No bus routes are open for applications yet. Please contact the school office." />}</Async>
    </Modal>
  )
}

function Requests({ base, requests, onChanged }) {
  const [run] = useAction()
  if (!requests?.length) return null
  const cancel = async (id) => { if (await run(() => http.del(`${base}/transport/requests/${id}`), 'Application cancelled.')) onChanged() }
  return (
    <div className="card mb">
      <div className="card-head"><h2>Transport applications</h2></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Applied</th><th>Route & stop</th><th>From</th><th>Status</th><th /></tr></thead>
          <tbody>{requests.map((r) => (
            <tr key={r._id}>
              <td className="small nowrap">{fmtDate(r.createdAt)}<div className="cell-sub">by {r.requestedByName || '—'}</div></td>
              <td>{r.route?.name || '—'}<div className="cell-sub">{r.stopName}{r.monthlyFee ? ` · ${money(r.monthlyFee)}/mo` : ''}</div></td>
              <td className="nowrap">{fmtDate(r.startDate)}</td>
              <td><Badge tone={REQ_TONE[r.status]}>{r.status === 'pending' ? 'Waiting for approval' : r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge>{r.reviewNote && <div className="small muted">{r.reviewNote}</div>}</td>
              <td>{r.status === 'pending' && <button className="btn btn-sm" onClick={() => cancel(r._id)}>Cancel</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  )
}

// Where the bus is now, and roughly how far it is from the student's stop.
function LiveBus({ base }) {
  const live = useApi(`${base}/transport/live`)
  const { reload } = live
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => { reload(); setNow(Date.now()) }, 15_000)
    return () => clearInterval(timer)
  }, [reload])
  const d = live.data
  const stops = useMemo(() => (d?.route?.stops || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    .map((s) => ({ id: s._id, lat: s.lat, lng: s.lng, name: s.name, mine: String(s._id) === String(d.assignment?.stop) })), [d])
  const pins = useMemo(() => (d?.location ? [{ id: 'bus', lat: d.location.lat, lng: d.location.lng, label: d.vehicle.number, live: freshness(d.location.at, now) === 'live' }] : []), [d, now])
  if (live.error || !d?.assignment) return null
  const mine = stops.find((s) => s.mine)
  const f = freshness(d.location?.at || d.lastSeenAt, now)
  const away = d.location && mine?.lat != null ? distanceM(d.location, mine) : null
  return (
    <div className="card card-pad stack mb">
      <div className="row between">
        <h2 className="row"><Navigation size={17} /> Live bus location</h2>
        <Badge tone={FRESH_TONE[d.location ? f : 'none']}>{d.location ? FRESH_LABEL[f] : 'Not on the road'}</Badge>
      </div>
      {d.location ? (
        <>
          <div className="row small" style={{ gap: 16, flexWrap: 'wrap' }}>
            <span>Bus <strong>{d.vehicle.number}</strong></span>
            {away != null && <span><strong>{fmtDistance(away)}</strong> from {mine.name}{away > 150 ? <> · about <strong>{etaMinutes(away, d.location.speed)} min</strong></> : ' · at your stop'}</span>}
            {d.location.speed != null && <span>{Math.round(d.location.speed)} km/h</span>}
            <span className="muted">updated {timeAgo(d.location.at)}</span>
          </div>
          <LiveMap vehicles={pins} stops={stops} fitKey={`${Boolean(d)}`} height={360} />
          {mine?.lat == null && <p className="small muted" style={{ margin: 0 }}>Your stop is not marked on the map yet, so the distance cannot be shown.</p>}
          <p className="small muted" style={{ margin: 0 }}>Times are approximate (straight-line distance, traffic not counted).</p>
        </>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>The bus is not sharing its location right now{d.lastSeenAt ? ` (last seen ${timeAgo(d.lastSeenAt)})` : ''}. It shows here as soon as the trip starts.</p>
      )}
    </div>
  )
}

const monthLabel = (m) => {
  if (!m) return '—'
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export default function MyTransport() {
  const { api, my } = useScope()
  const state = useApi(`${api}/transport`)
  const [applying, setApplying] = useState(false)
  const pending = state.data?.requests?.some((r) => r.status === 'pending')
  return (
    <>
      <PageHead title={my('transport')} subtitle="Bus route, stop timings, transport fees, and applying for a seat.">
        {state.data && !pending && <button className="btn btn-primary" onClick={() => setApplying(true)}><Bus size={15} /> {state.data.assignment ? 'Change route / stop' : 'Apply for transport'}</button>}
      </PageHead>
      {applying && <ApplyForm base={api} change={Boolean(state.data?.assignment)} onClose={() => setApplying(false)} onSaved={() => { setApplying(false); state.reload() }} />}
      <Async state={state}>{({ assignment, invoices, recentAttendance, requests }) => {
        if (!assignment) {
          return (
            <>
              <Requests base={api} requests={requests} onChanged={state.reload} />
              {!pending && (
                <Empty icon={Bus} text="Not using school transport yet.">
                  <button className="btn btn-primary" onClick={() => setApplying(true)}><Bus size={15} /> Apply for transport</button>
                </Empty>
              )}
            </>
          )
        }
        const route = assignment.route
        const stop = (route?.stops || []).find((s) => String(s._id) === String(assignment.stop))
        const vehicle = route?.vehicle
        const outstanding = invoices.filter((i) => i.liveStatus !== 'paid' && i.liveStatus !== 'waived').reduce((s, i) => s + (i.amount - (i.discount || 0) - (i.paid || 0)), 0)
        const paidCount = invoices.filter((i) => i.liveStatus === 'paid').length
        const presentCount = recentAttendance.filter((r) => r.status === 'boarded').length
        return (
          <>
            <Requests base={api} requests={requests} onChanged={state.reload} />
            <LiveBus base={api} />
            <div className="grid grid-3 mb">
              <StatTile icon={RouteIcon} label="Route" value={route?.name || '—'} foot={route?.code} />
              <StatTile icon={MapPin} label="Boarding stop" value={assignment.stopName} foot={stop?.landmark} />
              <StatTile icon={Bus} label="Vehicle" value={vehicle?.number || '—'} foot={vehicle?.model} />
            </div>
            <div className="grid grid-2 mb">
              <div className="card card-pad stack">
                <div className="card-head"><h2>Trip details</h2></div>
                <div className="small">
                  <div className="row" style={{ gap: 6 }}><Clock size={13} /> Pickup <strong>{stop?.pickupTime || '—'}</strong></div>
                  <div className="row" style={{ gap: 6 }}><Clock size={13} /> Drop <strong>{stop?.dropTime || '—'}</strong></div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    {assignment.pickup && <Badge tone="info">Pickup</Badge>}
                    {assignment.drop && <Badge tone="info">Drop</Badge>}
                    <Badge>Fee {money(assignment.monthlyFee)}/mo</Badge>
                  </div>
                </div>
                {(vehicle?.driverName || vehicle?.driverPhone) && (
                  <div className="small">
                    <div><strong>Driver:</strong> {vehicle?.driverName || '—'} {vehicle?.driverPhone && <span className="row" style={{ display: 'inline-flex', gap: 3 }}><Phone size={11} />{vehicle.driverPhone}</span>}</div>
                    {vehicle?.conductorName && <div><strong>Conductor:</strong> {vehicle.conductorName} {vehicle.conductorPhone && `· ${vehicle.conductorPhone}`}</div>}
                  </div>
                )}
                <div className="small muted">Started on {fmtDate(assignment.startDate)}</div>
              </div>
              <div className="card card-pad stack">
                <div className="card-head"><h2>At a glance</h2></div>
                <div className="grid grid-2">
                  <StatTile label="Outstanding" value={money(outstanding)} tone={outstanding ? 'bad' : 'good'} />
                  <StatTile label="Paid months" value={paidCount} tone="good" />
                  <StatTile label="Recent trips" value={recentAttendance.length} />
                  <StatTile label="Boarded" value={presentCount} tone="good" />
                </div>
              </div>
            </div>
            <div className="grid grid-2">
              <div className="card">
                <div className="card-head"><h2>Fee invoices</h2></div>
                {invoices.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Month</th><th className="num">Amount</th><th className="num">Paid</th><th>Due</th><th>Status</th></tr></thead>
                      <tbody>{invoices.map((i) => (
                        <tr key={i._id}>
                          <td>{monthLabel(i.month)}</td>
                          <td className="num">{money(i.amount - (i.discount || 0))}</td>
                          <td className="num">{money(i.paid || 0)}</td>
                          <td>{fmtDate(i.dueDate)}</td>
                          <td><StatusBadge value={i.liveStatus} /></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <Empty text="No invoices yet." />}
              </div>
              <div className="card">
                <div className="card-head"><h2>Recent trips</h2></div>
                {recentAttendance.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Date</th><th>Direction</th><th>Status</th><th>Stop</th></tr></thead>
                      <tbody>{recentAttendance.map((r) => (
                        <tr key={r._id}>
                          <td>{fmtDate(r.date)}</td>
                          <td style={{ textTransform: 'capitalize' }}>{r.direction}</td>
                          <td>
                            {r.status === 'boarded' ? <Badge tone="good">Boarded</Badge>
                              : r.status === 'absent' ? <Badge tone="bad">Absent</Badge>
                                : <Badge>Skipped</Badge>}
                          </td>
                          <td>{r.stopName || '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <Empty text="No trips marked yet." />}
              </div>
            </div>
          </>
        )
      }}</Async>
    </>
  )
}
