import { useEffect, useMemo, useState } from 'react'
import { Check, Save, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { today } from '../../lib/format.js'
import { Async, Badge, Empty, Field, PageHead, Segmented, StatusBadge, useAction, useApi } from '../../components/ui.jsx'

const STATUSES = [
  { value: 'boarded', label: 'Boarded' },
  { value: 'absent', label: 'Absent' },
  { value: 'skipped', label: 'Skipped' },
]

export default function TransportAttendance() {
  const routes = useApi('/transport/routes?status=active')
  const [routeId, setRouteId] = useState('')
  const [date, setDate] = useState(today())
  const [direction, setDirection] = useState('pickup')
  const url = routeId ? `/transport/attendance?${new URLSearchParams({ route: routeId, date, direction })}` : null
  const state = useApi(url, { skip: !routeId })
  const [marks, setMarks] = useState({}) // studentId -> status
  const [run, busy] = useAction()

  useEffect(() => {
    if (state.data?.rows) {
      const seed = {}
      for (const r of state.data.rows) seed[r.student?._id] = r.status || ''
      setMarks(seed)
    }
  }, [state.version])

  useEffect(() => {
    if (routes.data?.length && !routeId) setRouteId(routes.data[0]._id)
  }, [routes.data, routeId])

  const rows = state.data?.rows || []
  const grouped = useMemo(() => {
    const by = {}
    for (const r of rows) {
      const k = r.stopName || 'Unknown stop'
      ;(by[k] ||= []).push(r)
    }
    return Object.entries(by)
  }, [rows])

  const setAll = (status) => {
    const next = { ...marks }
    for (const r of rows) next[r.student?._id] = status
    setMarks(next)
  }
  const save = async () => {
    const entries = rows.map((r) => ({ student: r.student?._id, status: marks[r.student?._id], stopName: r.stopName })).filter((e) => e.student && e.status)
    if (!entries.length) return
    if (await run(() => api.post('/transport/attendance', { route: routeId, date, direction, entries }), 'Trip saved.')) state.reload()
  }

  const counts = { boarded: 0, absent: 0, skipped: 0, blank: 0 }
  for (const r of rows) {
    const s = marks[r.student?._id] || ''
    if (counts[s] !== undefined) counts[s] += 1
    else counts.blank += 1
  }

  return (
    <>
      <PageHead title="Trip Attendance" subtitle="Mark who boarded, who was absent, and who skipped for every pickup and drop trip.">
        <button className="btn btn-primary" onClick={save} disabled={busy || !rows.length}><Save size={14} /> Save trip</button>
      </PageHead>
      <div className="filters" style={{ flexWrap: 'wrap' }}>
        <Field label="Route">
          <select className="select" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">Choose…</option>
            {(routes.data || []).map((r) => <option key={r._id} value={r._id}>{r.name}{r.code ? ` (${r.code})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Direction">
          <Segmented value={direction} onChange={setDirection} options={[{ value: 'pickup', label: 'Pickup' }, { value: 'drop', label: 'Drop' }]} />
        </Field>
      </div>
      {!routeId ? <Empty text="Choose a route to begin." /> : (
        <Async state={state}>{() => (
          !rows.length ? <Empty text="No active riders in this direction." /> : (
            <>
              <div className="row mb" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Badge tone="good"><Check size={11} /> {counts.boarded} boarded</Badge>
                <Badge tone="bad"><X size={11} /> {counts.absent} absent</Badge>
                <Badge>{counts.skipped} skipped</Badge>
                {counts.blank > 0 && <Badge tone="warn">{counts.blank} unmarked</Badge>}
                <span style={{ flex: 1 }} />
                <button className="btn btn-sm" onClick={() => setAll('boarded')}>Mark all boarded</button>
                <button className="btn btn-sm" onClick={() => setAll('absent')}>Mark all absent</button>
              </div>
              <div className="stack">
                {grouped.map(([stop, group]) => (
                  <div className="card" key={stop}>
                    <div className="card-head"><h2>{stop} <span className="small muted">· {group.length} rider{group.length > 1 ? 's' : ''}</span></h2></div>
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr><th>Student</th><th>Class</th><th>Parent</th><th>Status</th><th>Previous</th></tr></thead>
                        <tbody>{group.map((r) => (
                          <tr key={r._id}>
                            <td><strong>{r.student?.name}</strong><div className="small muted">{r.student?.admissionNo}</div></td>
                            <td>{r.student?.batch?.name || '—'}</td>
                            <td className="small">{r.student?.guardianPhone || '—'}</td>
                            <td>
                              <Segmented
                                value={marks[r.student?._id] || ''}
                                onChange={(v) => setMarks({ ...marks, [r.student?._id]: v })}
                                options={STATUSES}
                              />
                            </td>
                            <td>{r.status ? <StatusBadge value={r.status === 'boarded' ? 'paid' : r.status === 'absent' ? 'overdue' : 'skipped'} label={r.status} /> : <span className="muted small">—</span>}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        )}</Async>
      )}
    </>
  )
}
