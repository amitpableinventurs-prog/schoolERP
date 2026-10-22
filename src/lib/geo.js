// Small helpers for live bus tracking.

export function distanceM(a, b) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

export const fmtDistance = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`)

// Rough arrival time: roads are ~1.3× the straight line, buses average ~20 km/h in town.
export function etaMinutes(meters, speedKmh) {
  const kmh = Math.max(Number(speedKmh) || 0, 20)
  return Math.max(1, Math.round(((meters * 1.3) / 1000 / kmh) * 60))
}

// live: position from the last 2 minutes; stale: up to 15 minutes; else offline.
export function freshness(at, now = Date.now()) {
  if (!at) return 'none'
  const age = now - new Date(at).getTime()
  return age < 2 * 60_000 ? 'live' : age < 15 * 60_000 ? 'stale' : 'offline'
}

export const FRESH_LABEL = { live: 'Live', stale: 'Signal weak', offline: 'Not moving / offline', none: 'Never tracked' }
export const FRESH_TONE = { live: 'good', stale: 'warn', offline: '', none: '' }
