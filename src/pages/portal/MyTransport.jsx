import { useEffect, useMemo, useState } from 'react'
import { Bus, Clock, MapPin, Navigation, Phone, Route as RouteIcon } from 'lucide-react'
import { fmtDate, money, timeAgo } from '../../lib/format.js'
import { distanceM, etaMinutes, fmtDistance, FRESH_LABEL, FRESH_TONE, freshness } from '../../lib/geo.js'
import LiveMap from '../../components/LiveMap.jsx'
import { Async, Badge, Empty, PageHead, StatTile, StatusBadge, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

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
  return (
    <>
      <PageHead title={my('transport')} subtitle="Bus route, stop timings and transport fee invoices." />
      <Async state={state}>{({ assignment, invoices, recentAttendance }) => {
        if (!assignment) return <Empty text="No transport assignment yet. Please contact the office." />
        const route = assignment.route
        const stop = (route?.stops || []).find((s) => String(s._id) === String(assignment.stop))
        const vehicle = route?.vehicle
        const outstanding = invoices.filter((i) => i.liveStatus !== 'paid' && i.liveStatus !== 'waived').reduce((s, i) => s + (i.amount - (i.discount || 0) - (i.paid || 0)), 0)
        const paidCount = invoices.filter((i) => i.liveStatus === 'paid').length
        const presentCount = recentAttendance.filter((r) => r.status === 'boarded').length
        return (
          <>
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
