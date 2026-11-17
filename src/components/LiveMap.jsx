import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { loadGoogleMaps, onGoogleMapsFailure } from '../lib/googleMaps.js'

const INDIA = [22.5, 79]
const BUS_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const round6 = (n) => Math.round(n * 1e6) / 1e6
const busHtml = (v) => `<div class="bus-pin${v.live ? ' live' : ''}${v.selected ? ' sel' : ''}"><span class="bus-dot">${BUS_SVG}</span><span class="bus-label">${esc(v.label)}</span></div>`

// Everything the map should zoom to.
function fitPoints({ vehicles, stops, path, picked, focusPicked }) {
  if (focusPicked && picked?.lat != null) return [[picked.lat, picked.lng]]
  return [
    ...vehicles.filter((v) => v.lat != null && (v.selected || !vehicles.some((x) => x.selected))).map((v) => [v.lat, v.lng]),
    ...stops.filter((s) => s.lat != null).map((s) => [s.lat, s.lng]),
    ...path,
    ...(picked?.lat != null ? [[picked.lat, picked.lng]] : []),
  ]
}

// Map with buses, route stops and a driven path. Google Maps when the server has a
// GOOGLE_MAPS_API_KEY, otherwise OpenStreetMap.
//   vehicles: [{ id, lat, lng, label, live, selected, title }]
//   stops:    [{ id, lat, lng, name, mine }]
//   path:     [[lat, lng], â€¦]
//   fitKey:   change it to zoom to everything shown
//   onPick:   click on the map â†’ ({ lat, lng }) (to set a stop's position)
export default function LiveMap(props) {
  const [google, setGoogle] = useState(undefined) // undefined = still deciding
  useEffect(() => {
    let live = true
    loadGoogleMaps().then((g) => live && setGoogle(g))
    const off = onGoogleMapsFailure(() => live && setGoogle(null))
    return () => { live = false; off() }
  }, [])
  if (google === undefined) return <div className="live-map" style={{ height: props.height ?? 440 }} />
  return google ? <GoogleLiveMap {...props} google={google} /> : <OsmLiveMap {...props} />
}

/* â”€â”€ Google Maps â”€â”€ */

// A 0Ã—0 box at the point; its content is centred on it (same as the Leaflet pins).
function pinElement(html) {
  const el = document.createElement('div')
  el.style.cssText = 'width:0;height:0;position:relative'
  el.innerHTML = html
  return el
}
const dotHtml = ({ radius, color, fill, weight = 2, label }) => `
  <div style="position:absolute;left:0;top:0;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center">
    <span style="display:block;width:${radius * 2}px;height:${radius * 2}px;border-radius:50%;border:${weight}px solid ${color};background:${fill};box-sizing:border-box"></span>
    ${label ? `<span class="bus-label" style="position:absolute;bottom:${radius * 2 + 4}px">${esc(label)}</span>` : ''}
  </div>`

function GoogleLiveMap({ google, vehicles = [], stops = [], path = [], fitKey, focusPicked, onSelect, onPick, picked, height = 440 }) {
  const { maps, mapId } = google
  const box = useRef(null)
  const map = useRef(null)
  const markers = useRef(new Map())
  const drawn = useRef({ stops: [], path: null, pick: null })
  const handlers = useRef({ onSelect, onPick })
  useEffect(() => { handlers.current = { onSelect, onPick } })

  useEffect(() => {
    const m = new maps.Map(box.current, {
      center: { lat: INDIA[0], lng: INDIA[1] }, zoom: 5, mapId,
      clickableIcons: false, streetViewControl: false, fullscreenControl: true, mapTypeControl: true,
    })
    m.addListener('click', (e) => handlers.current.onPick?.({ lat: round6(e.latLng.lat()), lng: round6(e.latLng.lng()) }))
    map.current = m
    const all = markers.current
    const shapes = drawn.current
    return () => {
      for (const mk of all.values()) mk.map = null
      all.clear()
      shapes.stops.forEach((mk) => { mk.map = null })
      shapes.path?.setMap(null)
      if (shapes.pick) shapes.pick.map = null
      drawn.current = { stops: [], path: null, pick: null }
      map.current = null
    }
  }, [maps, mapId])

  // Buses: markers move instead of being recreated, so the map does not flicker.
  useEffect(() => {
    const seen = new Set()
    for (const v of vehicles) {
      if (v.lat == null || v.lng == null) continue
      seen.add(v.id)
      let mk = markers.current.get(v.id)
      if (!mk) {
        mk = new maps.marker.AdvancedMarkerElement({ map: map.current, position: { lat: v.lat, lng: v.lng }, content: pinElement(busHtml(v)) })
        mk.addListener('click', () => handlers.current.onSelect?.(v.id))
        markers.current.set(v.id, mk)
      } else {
        mk.position = { lat: v.lat, lng: v.lng }
        mk.content.innerHTML = busHtml(v)
      }
      mk.zIndex = v.selected ? 2000 : 1000
      mk.title = v.title || ''
    }
    for (const [id, mk] of markers.current) if (!seen.has(id)) { mk.map = null; markers.current.delete(id) }
  }, [vehicles, maps])

  useEffect(() => {
    drawn.current.stops.forEach((mk) => { mk.map = null })
    drawn.current.stops = stops.filter((s) => s.lat != null && s.lng != null).map((s, i) => new maps.marker.AdvancedMarkerElement({
      map: map.current,
      position: { lat: s.lat, lng: s.lng },
      title: `${s.mine ? 'â˜… ' : ''}${i + 1}. ${s.name || ''}`,
      zIndex: s.mine ? 500 : 100,
      content: pinElement(dotHtml({ radius: s.mine ? 9 : 6, color: s.mine ? '#d03b3b' : '#2a78d6', fill: '#fff', label: s.mine ? `â˜… ${i + 1}. ${s.name || ''}` : '' })),
    }))
  }, [stops, maps])

  useEffect(() => {
    drawn.current.path?.setMap(null)
    drawn.current.path = path.length > 1
      ? new maps.Polyline({ map: map.current, path: path.map(([lat, lng]) => ({ lat, lng })), strokeColor: '#2a78d6', strokeWeight: 4, strokeOpacity: 0.7, clickable: false })
      : null
  }, [path, maps])

  useEffect(() => {
    if (drawn.current.pick) drawn.current.pick.map = null
    drawn.current.pick = picked?.lat != null
      ? new maps.marker.AdvancedMarkerElement({ map: map.current, position: { lat: picked.lat, lng: picked.lng }, zIndex: 3000, content: pinElement(dotHtml({ radius: 10, color: '#d03b3b', fill: 'rgba(208, 59, 59, 0.35)', weight: 3 })) })
      : null
  }, [picked, maps])

  // Zoom to what is shown when asked (first load, another bus selected).
  useEffect(() => {
    const m = map.current
    if (!m) return
    const points = fitPoints({ vehicles, stops, path, picked, focusPicked })
    if (points.length === 1) {
      m.setCenter({ lat: points[0][0], lng: points[0][1] })
      m.setZoom(15)
    } else if (points.length) {
      const bounds = new maps.LatLngBounds()
      points.forEach(([lat, lng]) => bounds.extend({ lat, lng }))
      m.fitBounds(bounds, 30)
      maps.event.addListenerOnce(m, 'idle', () => { if (m.getZoom() > 16) m.setZoom(16) })
    }
    // Only when fitKey changes - not on every position update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, maps])

  return <div ref={box} className="live-map" style={{ height }} />
}

/* â”€â”€ OpenStreetMap (Leaflet) â”€â”€ */

const busIcon = (v) => L.divIcon({ className: '', html: busHtml(v), iconSize: [0, 0], iconAnchor: [0, 0] })

function OsmLiveMap({ vehicles = [], stops = [], path = [], fitKey, focusPicked, onSelect, onPick, picked, height = 440 }) {
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
    m.on('click', (e) => handlers.current.onPick?.({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) }))
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
        .bindTooltip(`${s.mine ? 'â˜… ' : ''}${i + 1}. ${esc(s.name)}`, { direction: 'top', permanent: Boolean(s.mine) })
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
    const points = fitPoints({ vehicles, stops, path, picked, focusPicked })
    if (points.length === 1) m.setView(points[0], 15)
    else if (points.length) m.fitBounds(points, { padding: [30, 30], maxZoom: 16 })
    // Only when fitKey changes - not on every position update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey])

  return <div ref={box} className="live-map" style={{ height }} />
}
