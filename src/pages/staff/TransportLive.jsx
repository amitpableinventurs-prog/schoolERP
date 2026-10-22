import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Gauge, MapPinned, MessageCircle, Navigation, RefreshCw, Smartphone } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuth } from '../../lib/auth.jsx'
import { fmtDateTime, timeAgo } from '../../lib/format.js'
import { FRESH_LABEL, FRESH_TONE, freshness } from '../../lib/geo.js'
import LiveMap from '../../components/LiveMap.jsx'
import { Async, Badge, Empty, Modal, PageHead, StatTile, useAction, useApi, useToast } from '../../components/ui.jsx'

const POLL_MS = 10_000

export default function TransportLive() {
  const { desktop } = useAuth()
  if (desktop) {
    return (
      <>
        <PageHead title="Live Bus Tracking" />
        <Empty icon={MapPinned} text="Live tracking needs the internet. Open the institute website to see the buses on the map." />
      </>
    )
  }
  return <LiveBoard />
}

function LiveBoard() {
  const live = useApi('/transport/live')
  const [selected, setSelected] = useState(null)
  const [setup, setSetup] = useState(null)
  const path = useApi(selected ? `/transport/live/${selected}/path` : null)
  const [now, setNow] = useState(() => Date.now())

  const { reload } = live
  useEffect(() => {
    const timer = setInterval(() => { reload(); setNow(Date.now()) }, POLL_MS)
    return () => clearInterval(timer)
  }, [reload])
  useEffect(() => {
    if (!selected) return undefined
    const timer = setInterval(path.reload, 30_000)
    return () => clearInterval(timer)
  }, [selected, path.reload])

  const vehicles = useMemo(() => live.data?.vehicles || [], [live.data])
  const chosen = vehicles.find((v) => v._id === selected)
  const pins = useMemo(() => vehicles.filter((v) => v.location).map((v) => ({
    id: v._id,
    lat: v.location.lat,
    lng: v.location.lng,
    label: v.number,
    live: freshness(v.location.at, now) === 'live',
    selected: v._id === selected,
    title: `${v.number}${v.location.speed != null ? ` · ${Math.round(v.location.speed)} km/h` : ''} · ${timeAgo(v.location.at)}`,
  })), [vehicles, selected, now])
  const stops = useMemo(() => (chosen?.routes || []).flatMap((r) => [...(r.stops || [])].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    .map((s) => ({ id: s._id, lat: s.lat, lng: s.lng, name: `${s.name} (${r.code || r.name})` }))), [chosen])
  const line = useMemo(() => (path.data || []).map(([lat, lng]) => [lat, lng]), [path.data])
  const counts = vehicles.reduce((c, v) => { c[freshness(v.location?.at, now)]++; return c }, { live: 0, stale: 0, offline: 0, none: 0 })

  return (
    <>
      <PageHead title="Live Bus Tracking" subtitle="Where every bus is right now. Positions come from the driver's phone or a GPS tracker and refresh every 10 seconds. Click a bus to see its stops and today's path.">
        <button className="btn" onClick={() => { live.reload(); path.reload() }}><RefreshCw size={15} /> Refresh</button>
      </PageHead>
      <Async state={live}>{() => (
        <>
          <div className="grid grid-4 mb">
            <StatTile icon={Navigation} label="Live now" value={counts.live} tone={counts.live ? 'good' : undefined} foot="Updated in the last 2 minutes" />
            <StatTile icon={Gauge} label="Weak signal" value={counts.stale} foot="2 - 15 minutes old" />
            <StatTile icon={MapPinned} label="Offline" value={counts.offline} foot="Older than 15 minutes" />
            <StatTile icon={Smartphone} label="Not set up" value={vehicles.filter((v) => !v.trackingToken && !v.gpsDeviceId).length} foot="No tracking link or device yet" tone={vehicles.some((v) => !v.trackingToken && !v.gpsDeviceId) ? 'bad' : undefined} />
          </div>
          {vehicles.length ? (
            <div className="live-grid">
              <div className="card card-pad">
                <LiveMap vehicles={pins} stops={stops} path={line} fitKey={`${selected || 'all'}|${Boolean(live.data)}|${path.data ? 'p' : ''}`} onSelect={setSelected} height={560} />
                {chosen && (
                  <div className="row small mt" style={{ gap: 12, flexWrap: 'wrap' }}>
                    <strong>{chosen.number}</strong>
                    {chosen.location ? <span>Last position {fmtDateTime(chosen.location.at)}{chosen.location.accuracy ? ` · ±${Math.round(chosen.location.accuracy)} m` : ''}</span> : <span className="muted">No position yet</span>}
                    <span className="muted">{line.length ? `${line.length} points today` : 'No path today'}</span>
                    <button className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>Show all buses</button>
                  </div>
                )}
                {stops.some((s) => s.lat == null) && <p className="small muted mt">Some stops have no map position yet - set them in Routes &amp; Stops → Edit stops → Pick on map.</p>}
              </div>
              <div className="card live-list">
                {vehicles.map((v) => {
                  const f = freshness(v.location?.at, now)
                  return (
                    <div key={v._id} className={`live-item${v._id === selected ? ' sel' : ''}`} role="button" tabIndex={0}
                      onClick={() => setSelected(v._id === selected ? null : v._id)} onKeyDown={(e) => e.key === 'Enter' && setSelected(v._id)}>
                      <span className={`live-dot ${f}`} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row between">
                          <strong>{v.number}</strong>
                          <Badge tone={FRESH_TONE[f]}>{FRESH_LABEL[f]}</Badge>
                        </div>
                        <div className="small muted">{v.routes.map((r) => r.name).join(', ') || 'No route'}{v.driverName ? ` · ${v.driverName}` : ''}</div>
                        <div className="small">
                          {v.location ? <>{v.location.speed != null ? `${Math.round(v.location.speed)} km/h · ` : ''}{timeAgo(v.location.at)}</> : <span className="muted">No position yet</span>}
                        </div>
                      </div>
                      <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); setSetup(v) }} title="Tracking link and GPS device setup"><Smartphone size={14} /> Setup</button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : <Empty text="No vehicles yet. Add them in Transport → Vehicles." />}
        </>
      )}</Async>
      {setup && <TrackingSetup vehicle={setup} onClose={() => setSetup(null)} onChange={(v) => { setSetup(v); live.reload() }} />}
    </>
  )
}

const waNumber = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length === 10 ? `91${digits}` : digits
}

function TrackingSetup({ vehicle, onClose, onChange }) {
  const [run, busy] = useAction()
  const toast = useToast()
  const origin = window.location.origin
  const token = vehicle.trackingToken
  const driverUrl = token && `${origin}/track/${token}`
  const serverUrl = `${origin}/api/gps/osmand`
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`) } catch { toast(text) }
  }
  const create = () => (!token || window.confirm('Make a new tracking link? The old link and Traccar setting stop working.'))
    && run(async () => onChange({ ...vehicle, ...(await api.post(`/transport/vehicles/${vehicle._id}/tracking`)) }), 'Tracking link ready')
  const secure = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname)
  const message = driverUrl && `Bus ${vehicle.number} tracking: open this link on your phone when you start the trip and tap Start.\n${driverUrl}`

  return (
    <Modal title={`Tracking - ${vehicle.number}`} size="lg" onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <div className="stack">
        <div className="card card-pad stack">
          <h2 className="row"><Smartphone size={17} /> Option 1 - driver's phone (no app)</h2>
          <p className="small text-2" style={{ margin: 0 }}>The driver opens the link, taps <strong>Start trip</strong> and keeps the page open with the screen on. Good for a quick start; the phone must stay on this page.</p>
          {token ? (
            <>
              <div className="row" style={{ gap: 6 }}>
                <input className="input mono" readOnly value={driverUrl} onFocus={(e) => e.target.select()} />
                <button className="btn" onClick={() => copy(driverUrl, 'Link')}><Copy size={14} /></button>
                <a className="btn" href={driverUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /></a>
              </div>
              {vehicle.driverPhone && <a className="btn btn-sm" style={{ alignSelf: 'flex-start' }} href={`https://wa.me/${waNumber(vehicle.driverPhone)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={14} /> Send to {vehicle.driverName || 'driver'} on WhatsApp</a>}
              {!secure && <div className="alert small">Phones only share their location with <strong>https://</strong> websites. On this local address ({origin}) use Option 2 for now; Option 1 works once the site runs on your https domain.</div>}
            </>
          ) : <p className="small muted" style={{ margin: 0 }}>No tracking link yet.</p>}
          <div><button className="btn btn-primary btn-sm" onClick={create} disabled={busy}>{token ? 'Make a new link' : 'Create tracking link'}</button></div>
        </div>

        <div className="card card-pad stack">
          <h2 className="row"><Navigation size={17} /> Option 2 - Traccar Client app or a GPS tracker (recommended)</h2>
          <p className="small text-2" style={{ margin: 0 }}>Install the free <strong>Traccar Client</strong> app (Android / iPhone) on the driver's phone. It keeps sending the location in the background, even with the screen off. In the app set:</p>
          <table className="table">
            <tbody>
              <tr><th>Server URL</th><td className="mono">{serverUrl} <button className="btn btn-ghost btn-sm btn-icon" onClick={() => copy(serverUrl, 'Server URL')}><Copy size={13} /></button></td></tr>
              <tr><th>Device identifier</th><td className="mono">{token || <span className="muted">create the tracking link first</span>} {token && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => copy(token, 'Device identifier')}><Copy size={13} /></button>}</td></tr>
              <tr><th>Frequency</th><td>10 seconds, accuracy High</td></tr>
            </tbody>
          </table>
          <p className="small muted" style={{ margin: 0 }}>A hardware GPS tracker that can send HTTP (OsmAnd protocol) uses the same server URL; put its IMEI in the vehicle's <strong>GPS device id</strong> field (Transport → Vehicles).{vehicle.gpsDeviceId ? ` This bus: ${vehicle.gpsDeviceId}.` : ''}</p>
        </div>
      </div>
    </Modal>
  )
}
