// Live bus tracking (central server only). Positions come from
//  - the driver's phone: the tracking page /track/<token> posts to /api/gps/ping, or
//  - the Traccar Client app / a GPS tracker speaking the OsmAnd protocol (/api/gps/osmand),
//    identified by the vehicle's tracking token or its GPS device id.
// Staff see every vehicle on a map; students and parents see their own bus.
import crypto from 'node:crypto'
import express, { Router } from 'express'
import { allow } from '../auth.js'
import { Setting, TransportAssignment, TransportRoute, Vehicle, VehicleLocation, VehiclePing } from '../models.js'
import { wingsListFilter } from '../scope.js'
import { currentTenant } from '../tenancy.js'
import { asyncHandler, httpError } from '../util.js'

const KNOTS = 1.852 // OsmAnd query speeds are in knots
const MIN_GAP_MS = 2000 // fixes closer together are ignored
const PATH_EVERY_MS = 30_000 // the path keeps a point every 30 s…
const PATH_EVERY_M = 25 // …or every 25 m driven
const LIVE_FOR_MS = 2 * 3600_000 // students and parents only see a position this fresh

export function distanceM(a, b) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? undefined : Number(v))

function fixTime(raw) {
  const n = Number(raw)
  const t = raw == null || raw === '' ? new Date() : Number.isFinite(n) ? new Date(n > 1e12 ? n : n * 1000) : new Date(raw)
  const now = Date.now()
  if (Number.isNaN(t.getTime()) || t.getTime() > now + 5 * 60_000) return new Date(now)
  return t
}

// Last fix per vehicle (per institute), so pings don't need a read first.
const last = new Map()

async function record(vehicle, fix, source) {
  const lat = num(fix.lat)
  const lng = num(fix.lng)
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) throw httpError(400, 'Invalid position.')
  const at = fixTime(fix.at)
  if (Date.now() - at.getTime() > 86_400_000) return false // older than a day: ignore
  const key = `${currentTenant()?.code || 'main'}:${vehicle._id}`
  const prev = last.get(key) || await (async () => {
    const [loc, ping] = await Promise.all([
      VehicleLocation.findOne({ vehicle: vehicle._id }, 'lat lng at').lean(),
      VehiclePing.findOne({ vehicle: vehicle._id }, 'lat lng at').sort({ at: -1 }).lean(),
    ])
    return { at: loc?.at?.getTime() || 0, ping: ping && { lat: ping.lat, lng: ping.lng, at: ping.at.getTime() } }
  })()
  if (Math.abs(at.getTime() - prev.at) < MIN_GAP_MS) return false
  const point = { lat, lng, speed: num(fix.speed) != null ? Math.max(0, Math.round(num(fix.speed) * 10) / 10) : undefined, at }
  const next = { ...prev }
  // Trackers resend buffered fixes after a signal loss: older ones only add to the path.
  if (at.getTime() > prev.at) {
    await VehicleLocation.updateOne({ vehicle: vehicle._id }, {
      $set: { ...point, heading: num(fix.heading), accuracy: num(fix.accuracy), source },
    }, { upsert: true })
    next.at = at.getTime()
  }
  const accurate = !(num(fix.accuracy) > 200)
  if (accurate && (!prev.ping || Math.abs(at.getTime() - prev.ping.at) >= PATH_EVERY_MS || distanceM(prev.ping, point) >= PATH_EVERY_M)) {
    await VehiclePing.create({ vehicle: vehicle._id, ...point })
    next.ping = { lat, lng, at: at.getTime() }
  }
  if (last.size > 5000) last.clear()
  last.set(key, next)
  return true
}

/* ── Public: positions in, driver page info ── */

export const gpsPublic = Router()
gpsPublic.use(express.urlencoded({ extended: false, limit: '64kb' }))

// Unknown tokens / device ids, per IP, so they cannot be guessed.
const misses = new Map()
async function vehicleFor(req, id, { device = false } = {}) {
  const miss = misses.get(req.ip)
  if (miss && miss.count >= 30 && miss.until > Date.now()) throw httpError(429, 'Too many unknown devices. Please wait 10 minutes.')
  const clean = String(id || '').trim().slice(0, 100)
  const deviceId = clean.replace(/[^\w-]/g, '')
  const vehicle = clean && await Vehicle.findOne({
    status: { $ne: 'retired' },
    $or: [{ trackingToken: clean }, ...(device && deviceId.length >= 4 ? [{ gpsDeviceId: { $regex: `^${deviceId}$`, $options: 'i' } }] : [])],
  }, 'number model type status').lean()
  if (!vehicle) {
    misses.set(req.ip, { count: (miss?.until > Date.now() ? miss.count : 0) + 1, until: Date.now() + 10 * 60_000 })
    if (misses.size > 5000) misses.clear()
    throw httpError(404, 'This tracking link or device is not registered. Ask the transport office for a new one.')
  }
  return vehicle
}

gpsPublic.get('/driver/:token', asyncHandler(async (req, res) => {
  const vehicle = await vehicleFor(req, req.params.token)
  const [routes, setting] = await Promise.all([
    TransportRoute.find({ vehicle: vehicle._id, status: 'active' }, 'name code').lean(),
    Setting.findOne({}, 'instituteName').lean(),
  ])
  res.json({ vehicle, routes, institute: setting?.instituteName || '' })
}))

// The driver's phone (speed in m/s from the browser).
gpsPublic.post('/ping', asyncHandler(async (req, res) => {
  const vehicle = await vehicleFor(req, req.body.token)
  const b = req.body
  const saved = await record(vehicle, { lat: b.lat, lng: b.lng, speed: num(b.speed) != null ? num(b.speed) * 3.6 : undefined, heading: b.heading, accuracy: b.accuracy, at: b.at }, 'phone')
  res.json({ ok: true, saved })
}))

// OsmAnd protocol: Traccar Client (query/form fields, speed in knots, or JSON with
// speed in m/s) and GPS trackers that can post HTTP.
gpsPublic.all('/osmand', asyncHandler(async (req, res) => {
  const q = { ...req.query, ...(typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) }
  const json = q.location && typeof q.location === 'object'
  const fixes = json
    ? [].concat(q.location).map((l) => ({ lat: l.coords?.latitude, lng: l.coords?.longitude, speed: num(l.coords?.speed) != null && num(l.coords.speed) >= 0 ? num(l.coords.speed) * 3.6 : undefined, heading: l.coords?.heading, accuracy: l.coords?.accuracy, at: l.timestamp }))
    : [{ lat: q.lat, lng: q.lon ?? q.lng, speed: num(q.speed) != null ? num(q.speed) * KNOTS : undefined, heading: q.bearing ?? q.heading, accuracy: q.accuracy, at: q.timestamp }]
  const vehicle = await vehicleFor(req, json ? q.device_id : q.id ?? q.deviceid, { device: true })
  for (const fix of fixes.slice(0, 500)) await record(vehicle, fix, 'device')
  res.status(200).end()
}))

/* ── Staff: live map, today's path, tracking links ── */

export const gpsStaff = Router()
const transport = allow('teacher', 'accountant')

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

gpsStaff.get('/transport/live', transport, asyncHandler(async (req, res) => {
  const vehicles = await Vehicle.find({ ...(await wingsListFilter(req)), status: { $ne: 'retired' } },
    'number model type capacity driverName driverPhone status gpsDeviceId trackingToken').sort({ number: 1 }).lean()
  const ids = vehicles.map((v) => v._id)
  const [locations, routes] = await Promise.all([
    VehicleLocation.find({ vehicle: { $in: ids } }).lean(),
    TransportRoute.find({ vehicle: { $in: ids }, status: 'active' }, 'name code vehicle startTime endTime stops').lean(),
  ])
  const locOf = Object.fromEntries(locations.map((l) => [String(l.vehicle), l]))
  res.json({
    now: new Date(),
    vehicles: vehicles.map((v) => ({
      ...v,
      location: locOf[String(v._id)] || null,
      routes: routes.filter((r) => String(r.vehicle) === String(v._id)),
    })),
  })
}))

gpsStaff.get('/transport/live/:id/path', transport, asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findOne({ _id: req.params.id, ...(await wingsListFilter(req)) }, '_id').lean()
  if (!vehicle) throw httpError(404, 'Vehicle not found.')
  const pings = await VehiclePing.find({ vehicle: vehicle._id, at: { $gte: startOfToday() } }, 'lat lng speed at').sort({ at: 1 }).limit(5000).lean()
  res.json(pings.map((p) => [p.lat, p.lng, p.speed ?? null, p.at]))
}))

// New secret for the driver's link and Traccar Client (the old one stops working).
gpsStaff.post('/transport/vehicles/:id/tracking', transport, asyncHandler(async (req, res) => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const token = [...crypto.randomBytes(20)].map((b) => alphabet[b % alphabet.length]).join('')
  const vehicle = await Vehicle.findOneAndUpdate({ _id: req.params.id, ...(await wingsListFilter(req)) }, { trackingToken: token }, { returnDocument: 'after' })
  if (!vehicle) throw httpError(404, 'Vehicle not found.')
  res.json(vehicle)
}))

/* ── Students and parents: their own bus ── */

export async function myBusLive(student) {
  const assignment = await TransportAssignment.findOne({ student: student._id, status: 'active' }, 'route stop stopName pickup drop')
    .populate({ path: 'route', select: 'name code stops vehicle', populate: { path: 'vehicle', select: 'number model type driverName driverPhone' } })
    .lean()
  const vehicle = assignment?.route?.vehicle
  if (!vehicle) return { assignment: null }
  const loc = await VehicleLocation.findOne({ vehicle: vehicle._id }, 'lat lng speed heading at').lean()
  const fresh = loc && Date.now() - new Date(loc.at).getTime() < LIVE_FOR_MS
  return {
    assignment: { stop: assignment.stop, stopName: assignment.stopName },
    route: { name: assignment.route.name, code: assignment.route.code, stops: assignment.route.stops.map((s) => pickStop(s)) },
    vehicle,
    location: fresh ? loc : null,
    lastSeenAt: loc?.at || null,
  }
}

const pickStop = (s) => ({ _id: s._id, name: s.name, sequence: s.sequence, pickupTime: s.pickupTime, dropTime: s.dropTime, lat: s.lat, lng: s.lng })
