import { Bus, Clock, MapPin, Phone, Route as RouteIcon } from 'lucide-react'
import { fmtDate, money } from '../../lib/format.js'
import { Async, Badge, Empty, PageHead, StatTile, StatusBadge, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

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
