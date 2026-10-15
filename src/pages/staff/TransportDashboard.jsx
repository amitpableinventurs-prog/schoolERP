import { Link } from 'react-router-dom'
import { AlertTriangle, Bus, ClipboardCheck, IndianRupee, Map, Route as RouteIcon } from 'lucide-react'
import { fmtDate, money } from '../../lib/format.js'
import { Async, Empty, PageHead, StatTile, useApi } from '../../components/ui.jsx'

export default function TransportDashboard() {
  const state = useApi('/transport/summary')
  return (
    <>
      <PageHead title="Transport Dashboard" subtitle="Buses, routes, student assignments and transport fees at a glance." />
      <Async state={state}>{(data) => (
        <>
          <div className="grid grid-4 mb">
            <StatTile icon={RouteIcon} label="Routes" value={data.routes} />
            <StatTile icon={Bus} label="Vehicles" value={data.vehicles} />
            <StatTile icon={Map} label="Students on transport" value={data.activeAssignments} tone="good" />
            <StatTile icon={ClipboardCheck} label="Trips marked today" value={data.todayMarks} />
          </div>
          <div className="grid grid-2 mb">
            <StatTile icon={IndianRupee} label="Fees outstanding" value={money(data.outstanding)} foot={`${data.pendingInvoices} unpaid invoices`} tone={data.outstanding ? 'bad' : 'good'} />
            <StatTile icon={AlertTriangle} label="Documents expiring soon" value={data.expiringVehicles?.length || 0} foot="Insurance / fitness / PUC / permit within 30 days" tone={data.expiringVehicles?.length ? 'bad' : 'good'} />
          </div>
          <div className="card">
            <div className="card-head"><h2>Vehicle paperwork alerts</h2></div>
            {data.expiringVehicles?.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Vehicle</th><th>Insurance</th><th>Fitness</th><th>PUC</th><th>Permit</th><th></th></tr></thead>
                  <tbody>{data.expiringVehicles.map((v) => (
                    <tr key={v._id}>
                      <td><strong>{v.number}</strong>{v.model ? <div className="small muted">{v.model}</div> : null}</td>
                      <td>{fmtDate(v.insuranceExpiry)}</td>
                      <td>{fmtDate(v.fitnessExpiry)}</td>
                      <td>{fmtDate(v.pucExpiry)}</td>
                      <td>{fmtDate(v.permitExpiry)}</td>
                      <td><Link className="btn btn-sm" to="/transport/vehicles">Open</Link></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <Empty text="All vehicle papers are up to date." />}
          </div>
          <div className="row mt" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn" to="/transport/vehicles"><Bus size={14} /> Vehicles</Link>
            <Link className="btn" to="/transport/routes"><RouteIcon size={14} /> Routes & Stops</Link>
            <Link className="btn" to="/transport/assignments"><Map size={14} /> Student Assignments</Link>
            <Link className="btn" to="/transport/attendance"><ClipboardCheck size={14} /> Trip Attendance</Link>
            <Link className="btn" to="/transport/fees"><IndianRupee size={14} /> Transport Fees</Link>
          </div>
        </>
      )}</Async>
    </>
  )
}
