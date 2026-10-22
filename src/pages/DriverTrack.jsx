import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bus, CircleStop, LocateFixed, Play, TriangleAlert } from 'lucide-react'
import { api } from '../lib/api.js'
import { Badge, Loading } from '../components/ui.jsx'

const SEND_EVERY_MS = 8000
const MAX_QUEUE = 300

// Public page for the bus driver (/track/<token>): shares the phone's location while open.
export default function DriverTrack() {
  const { token } = useParams()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [on, setOn] = useState(false)
  const [stat, setStat] = useState({ sent: 0, last: null, fix: null, waiting: 0, problem: null })
  const watch = useRef(null)
  const queue = useRef([])
  const lastQueued = useRef(0)
  const lock = useRef(null)

  useEffect(() => {
    api.get(`/gps/driver/${token}`).then(setInfo, (e) => setError(e.message))
  }, [token])

  // Keep the screen on while tracking (the browser stops GPS when the screen locks).
  useEffect(() => {
    if (!on) return undefined
    const grab = async () => { try { lock.current = await navigator.wakeLock?.request('screen') } catch { /* not supported */ } }
    grab()
    const again = () => document.visibilityState === 'visible' && grab()
    document.addEventListener('visibilitychange', again)
    return () => { document.removeEventListener('visibilitychange', again); lock.current?.release?.(); lock.current = null }
  }, [on])

  // Sends queued fixes; when offline they wait and go out together later.
  useEffect(() => {
    if (!on) return undefined
    let busy = false
    const flush = async () => {
      if (busy || !queue.current.length) return
      busy = true
      try {
        while (queue.current.length) {
          await api.post('/gps/ping', { token, ...queue.current[0] })
          queue.current.shift()
          setStat((s) => ({ ...s, sent: s.sent + 1, last: Date.now(), waiting: queue.current.length, problem: null }))
        }
      } catch (e) {
        setStat((s) => ({ ...s, waiting: queue.current.length, problem: e.status ? e.message : 'No internet - positions are kept and sent when the signal is back.' }))
      } finally {
        busy = false
      }
    }
    const timer = setInterval(flush, 3000)
    return () => clearInterval(timer)
  }, [on, token])

  const start = () => {
    if (!navigator.geolocation) return setStat((s) => ({ ...s, problem: 'This phone or browser cannot share its location.' }))
    if (!window.isSecureContext) return setStat((s) => ({ ...s, problem: 'Location only works on an https:// address. Ask the office for the https link or use the Traccar Client app.' }))
    setOn(true)
    watch.current = navigator.geolocation.watchPosition((pos) => {
      const c = pos.coords
      const fix = { lat: c.latitude, lng: c.longitude, speed: c.speed, heading: c.heading, accuracy: c.accuracy, at: pos.timestamp }
      setStat((s) => ({ ...s, fix }))
      if (pos.timestamp - lastQueued.current < SEND_EVERY_MS) return
      lastQueued.current = pos.timestamp
      queue.current.push(fix)
      if (queue.current.length > MAX_QUEUE) queue.current.splice(0, queue.current.length - MAX_QUEUE)
    }, (e) => {
      setStat((s) => ({ ...s, problem: e.code === 1 ? 'Location permission was denied. Allow location for this site in the browser settings, then tap Start again.' : 'Waiting for GPS signal…' }))
      if (e.code === 1) stop()
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30_000 })
  }

  const stop = () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
    setOn(false)
  }
  useEffect(() => () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current) }, [])

  if (error) {
    return (
      <div className="driver-wrap">
        <div className="card card-pad driver-card stack">
          <h1 className="row"><TriangleAlert size={20} /> Tracking link not valid</h1>
          <p className="text-2">{error}</p>
        </div>
      </div>
    )
  }
  if (!info) return <Loading text="Opening…" />
  const speed = stat.fix?.speed != null && stat.fix.speed >= 0 ? Math.round(stat.fix.speed * 3.6) : null

  return (
    <div className="driver-wrap">
      <div className="card card-pad driver-card stack">
        <div className="row" style={{ gap: 12 }}>
          <span className="auth-logo"><Bus size={20} /></span>
          <div>
            <h1 style={{ margin: 0 }}>{info.vehicle.number}</h1>
            <div className="small muted">{info.routes.map((r) => r.name).join(', ') || 'Bus tracking'}{info.institute ? ` · ${info.institute}` : ''}</div>
          </div>
        </div>
        {on ? (
          <>
            <div className="row" style={{ gap: 8 }}><Badge tone="good"><LocateFixed size={12} /> Sharing location</Badge>{stat.waiting > 0 && <Badge tone="warn">{stat.waiting} waiting to send</Badge>}</div>
            <div className="grid grid-2">
              <div><div className="small muted">Speed</div><strong style={{ fontSize: 24 }}>{speed != null ? `${speed} km/h` : '—'}</strong></div>
              <div><div className="small muted">GPS accuracy</div><strong style={{ fontSize: 24 }}>{stat.fix?.accuracy ? `±${Math.round(stat.fix.accuracy)} m` : '—'}</strong></div>
            </div>
            <div className="small muted">{stat.last ? `Last sent ${new Date(stat.last).toLocaleTimeString('en-IN')} · ${stat.sent} positions sent` : 'Getting the first position…'}</div>
            <p className="small text-2" style={{ margin: 0 }}>Keep this page open and the screen on until the trip ends. Do not use the phone while driving.</p>
            <button className="btn driver-big" onClick={stop}><CircleStop size={20} /> End trip</button>
          </>
        ) : (
          <>
            <p className="text-2" style={{ margin: 0 }}>Tap <strong>Start trip</strong> when the bus leaves. Parents and the school see the bus on the map while this page is open.</p>
            <button className="btn btn-primary driver-big" onClick={start}><Play size={20} /> Start trip</button>
          </>
        )}
        {stat.problem && <div className="alert alert-error small">{stat.problem}</div>}
      </div>
    </div>
  )
}
