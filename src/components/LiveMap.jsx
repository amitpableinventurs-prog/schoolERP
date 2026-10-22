import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const INDIA = [22.5, 79]
const BUS_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const busIcon = (v) => L.divIcon({
  className: '',
  html: `<div class="bus-pin${v.live ? ' live' : ''}${v.selected ? ' sel' : ''}"><span class="bus-dot">${BUS_SVG}</span><span class="bus-label">${esc(v.label)}</span></div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
})

// OpenStreetMap with buses, route stops and a driven path.
//   vehicles: [{ id, lat, lng, label, live, selected, title }]
//   stops:    [{ id, lat, lng, name, mine }]
//   path:     [[lat, lng], …]
//   fitKey:   change it to zoom to everything shown
//   onPick:   click on the map → ({ lat, lng }) (to set a stop's position)
export default function LiveMap({ vehicles = [], stops = [], path = [], fitKey, onSelect, onPick, picked, height = 440 }) {
  const box = useRef(null)
  const map = useRef(null)
  const layers = useRef(null)
  const markers = useRef(new Map())
  const handlers = useRef({ onSelect, onPick })
  useEffect(() => { handlers.current = { onSelect, onPick } })

  useEffect(() => {
    const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(INDIA, 5)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    layers.current = { stops: L.layerGroup().addTo(m), path: L.layerGroup().addTo(m), buses: L.layerGroup().addTo(m), pick: L.layerGroup().addTo(m) }
    m.on('click', (e) => handlers.current.onPick?.({ lat: Math.round(e.latlng.lat * 1e6) / 1e6, lng: Math.round(e.latlng.lng * 1e6) / 1e6 }))
    map.current = m
    // The map may be created inside a modal that is still sizing itself.
    const t = setTimeout(() => m.invalidateSize(), 150)
    const all = markers.current
    return () => { clearTimeout(t); m.remove(); map.current = null; all.clear() }
  }, [])

  // Buses: markers move instead of being recreated, so the map does not flicker.
  useEffect(() => {
    const seen = new Set()
    for (const v of vehicles) {
      if (v.lat == null || v.lng == null) continue
      seen.add(v.id)
      let mk = markers.current.get(v.id)
      if (!mk) {
        mk = L.marker([v.lat, v.lng], { icon: busIcon(v), zIndexOffset: 1000 }).addTo(layers.current.buses)
        mk.on('click', () => handlers.current.onSelect?.(v.id))
        markers.current.set(v.id, mk)
      } else {
        mk.setLatLng([v.lat, v.lng])
        mk.setIcon(busIcon(v))
      }
      mk.setZIndexOffset(v.selected ? 2000 : 1000)
      if (v.title) mk.bindTooltip(v.title, { direction: 'top', offset: [0, -14] })
    }
    for (const [id, mk] of markers.current) if (!seen.has(id)) { mk.remove(); markers.current.delete(id) }
  }, [vehicles])

  useEffect(() => {
    const group = layers.current.stops
    group.clearLayers()
    stops.filter((s) => s.lat != null && s.lng != null).forEach((s, i) => {
      L.circleMarker([s.lat, s.lng], { radius: s.mine ? 9 : 6, color: s.mine ? '#d03b3b' : '#2a78d6', weight: 2, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(`${s.mine ? '★ ' : ''}${i + 1}. ${esc(s.name)}`, { direction: 'top', permanent: Boolean(s.mine) })
        .addTo(group)
    })
  }, [stops])

  useEffect(() => {
    const group = layers.current.path
    group.clearLayers()
    if (path.length > 1) L.polyline(path, { color: '#2a78d6', weight: 4, opacity: 0.7 }).addTo(group)
  }, [path])

  useEffect(() => {
    const group = layers.current.pick
    group.clearLayers()
    if (picked?.lat != null) L.circleMarker([picked.lat, picked.lng], { radius: 10, color: '#d03b3b', weight: 3, fillColor: '#d03b3b', fillOpacity: 0.35 }).addTo(group)
  }, [picked])

  // Zoom to what is shown when asked (first load, another bus selected).
  useEffect(() => {
    const m = map.current
    if (!m) return
    const points = [
      ...vehicles.filter((v) => v.lat != null && (v.selected || !vehicles.some((x) => x.selected))).map((v) => [v.lat, v.lng]),
      ...stops.filter((s) => s.lat != null).map((s) => [s.lat, s.lng]),
      ...path,
      ...(picked?.lat != null ? [[picked.lat, picked.lng]] : []),
    ]
    if (points.length === 1) m.setView(points[0], 15)
    else if (points.length) m.fitBounds(points, { padding: [30, 30], maxZoom: 16 })
    // Only when fitKey changes - not on every position update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  return <div ref={box} className="live-map" style={{ height }} />
}
