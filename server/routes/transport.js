// Transport: vehicles, routes with stops, student assignments, pickup/drop
// attendance, and monthly transport invoices. Wing-scoped like the rest of the app.
import { Router } from 'express'
import mongoose from 'mongoose'
import { allow, staffOnly } from '../auth.js'
import {
  Student,
  TransportAssignment,
  TransportAttendance,
  TransportInvoice,
  TransportRoute,
  Vehicle,
  VEHICLE_TYPES,
} from '../models.js'
import { asyncHandler, escapeRegex, httpError, pick, ymd } from '../util.js'
import {
  assertStudent,
  mergeWings,
  scopeOf,
  wingsListFilter,
} from '../scope.js'

const router = Router()
const transport = allow('teacher', 'accountant')
const accounts = allow('accountant')

const toObjectId = (id) => (mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : null)

// Keep assignment.monthlyFee aligned with the stop's fee (or the route default).
const feeForStop = (route, stopId) => {
  const stop = route.stops.find((s) => String(s._id) === String(stopId))
  if (!stop) return 0
  return Number(stop.fee) > 0 ? Number(stop.fee) : Number(route.monthlyFee) || 0
}

// A route the current user is allowed to see.
async function scopedRoute(req, id) {
  const scope = await scopeOf(req)
  const filter = { _id: id, ...(scope.all ? {} : { $or: [{ wings: { $in: scope.wings } }, { wings: { $size: 0 } }, { wings: null }] }) }
  const route = await TransportRoute.findOne(filter)
  if (!route) throw httpError(404, 'Route not found.')
  return route
}

async function routeInScope(req) {
  const scope = await scopeOf(req)
  if (scope.all) return {}
  return { $or: [{ wings: { $in: scope.wings } }, { wings: { $size: 0 } }, { wings: null }] }
}

/* ── Vehicles ── */

router.get('/transport/vehicles', transport, asyncHandler(async (req, res) => {
  const filter = await wingsListFilter(req)
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    filter.$or = [{ number: rx }, { model: rx }, { driverName: rx }, { driverPhone: rx }]
  }
  if (req.query.status) filter.status = req.query.status
  const list = await Vehicle.find(filter).sort({ status: 1, number: 1 }).lean()
  // Which routes use each vehicle, so the UI can block deletion of an in-use one.
  const used = await TransportRoute.aggregate([
    { $match: { vehicle: { $ne: null } } },
    { $group: { _id: '$vehicle', routes: { $sum: 1 } } },
  ])
  const byVehicle = Object.fromEntries(used.map((u) => [String(u._id), u.routes]))
  res.json(list.map((v) => ({ ...v, routes: byVehicle[String(v._id)] || 0 })))
}))

const VEHICLE_FIELDS = [
  'number', 'model', 'type', 'capacity',
  'driverName', 'driverPhone', 'driverLicense',
  'conductorName', 'conductorPhone',
  'insuranceExpiry', 'fitnessExpiry', 'pucExpiry', 'permitExpiry',
  'gpsDeviceId', 'status', 'notes',
]

router.post('/transport/vehicles', transport, asyncHandler(async (req, res) => {
  const data = pick(req.body, VEHICLE_FIELDS)
  if (!data.number) throw httpError(422, 'Vehicle number is required.')
  if (data.type && !VEHICLE_TYPES.includes(data.type)) throw httpError(422, 'Unknown vehicle type.')
  data.wings = await mergeWings(req, req.body.wings, [])
  const vehicle = await Vehicle.create(data)
  res.status(201).json(vehicle)
}))

router.put('/transport/vehicles/:id', transport, asyncHandler(async (req, res) => {
  const existing = await Vehicle.findOne({ _id: req.params.id, ...(await wingsListFilter(req)) })
  if (!existing) throw httpError(404, 'Vehicle not found.')
  const data = pick(req.body, VEHICLE_FIELDS)
  if (data.type && !VEHICLE_TYPES.includes(data.type)) throw httpError(422, 'Unknown vehicle type.')
  if (req.body.wings !== undefined) data.wings = await mergeWings(req, req.body.wings, existing.wings)
  Object.assign(existing, data)
  await existing.save()
  res.json(existing)
}))

router.delete('/transport/vehicles/:id', transport, asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findOne({ _id: req.params.id, ...(await wingsListFilter(req)) })
  if (!vehicle) throw httpError(404, 'Vehicle not found.')
  const inUse = await TransportRoute.countDocuments({ vehicle: vehicle._id })
  if (inUse) throw httpError(422, `Vehicle is attached to ${inUse} route(s). Detach it first.`)
  await vehicle.deleteOne()
  res.json({ ok: true })
}))

/* ── Routes & stops ── */

router.get('/transport/routes', transport, asyncHandler(async (req, res) => {
  const filter = await routeInScope(req)
  if (req.query.status) filter.status = req.query.status
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    filter.$or = [{ name: rx }, { code: rx }, { 'stops.name': rx }]
  }
  const routes = await TransportRoute.find(filter).populate('vehicle', 'number model type capacity driverName driverPhone').populate('incharge', 'name phone').sort({ status: 1, name: 1 }).lean()
  const ids = routes.map((r) => r._id)
  // Live assignment counts so the list shows "32/40 students" per route.
  const counts = await TransportAssignment.aggregate([
    { $match: { route: { $in: ids }, status: 'active' } },
    { $group: { _id: '$route', students: { $sum: 1 } } },
  ])
  const byRoute = Object.fromEntries(counts.map((c) => [String(c._id), c.students]))
  res.json(routes.map((r) => ({ ...r, students: byRoute[String(r._id)] || 0 })))
}))

router.get('/transport/routes/:id', transport, asyncHandler(async (req, res) => {
  const route = await scopedRoute(req, req.params.id)
  const populated = await TransportRoute.findById(route._id).populate('vehicle').populate('incharge', 'name phone').lean()
  const assignments = await TransportAssignment.find({ route: route._id, status: 'active' }).populate({ path: 'student', select: 'name admissionNo batch guardianPhone', populate: { path: 'batch', select: 'name type' } }).lean()
  res.json({ ...populated, assignments })
}))

const ROUTE_FIELDS = ['name', 'code', 'vehicle', 'incharge', 'startTime', 'endTime', 'totalKm', 'monthlyFee', 'status', 'notes']

router.post('/transport/routes', transport, asyncHandler(async (req, res) => {
  const data = pick(req.body, ROUTE_FIELDS)
  if (!data.name) throw httpError(422, 'Route name is required.')
  data.wings = await mergeWings(req, req.body.wings, [])
  data.stops = Array.isArray(req.body.stops) ? req.body.stops : []
  const route = await TransportRoute.create(data)
  res.status(201).json(route)
}))

router.put('/transport/routes/:id', transport, asyncHandler(async (req, res) => {
  const route = await scopedRoute(req, req.params.id)
  const data = pick(req.body, ROUTE_FIELDS)
  if (req.body.wings !== undefined) data.wings = await mergeWings(req, req.body.wings, route.wings)
  Object.assign(route, data)
  await route.save()
  res.json(route)
}))

router.delete('/transport/routes/:id', transport, asyncHandler(async (req, res) => {
  const route = await scopedRoute(req, req.params.id)
  const active = await TransportAssignment.countDocuments({ route: route._id, status: 'active' })
  if (active) throw httpError(422, `${active} students are on this route. Reassign them first.`)
  await TransportAssignment.deleteMany({ route: route._id, status: { $ne: 'active' } })
  await route.deleteOne()
  res.json({ ok: true })
}))

// Replace the stop list in one shot — order and ids are preserved for existing ids.
router.put('/transport/routes/:id/stops', transport, asyncHandler(async (req, res) => {
  const route = await scopedRoute(req, req.params.id)
  const stops = Array.isArray(req.body.stops) ? req.body.stops : []
  // Validate and renumber sequence left-to-right.
  const clean = stops.map((s, idx) => ({
    _id: s._id && mongoose.isValidObjectId(s._id) ? s._id : new mongoose.Types.ObjectId(),
    name: String(s.name || '').trim(),
    sequence: Number.isFinite(Number(s.sequence)) ? Number(s.sequence) : idx + 1,
    pickupTime: s.pickupTime || '',
    dropTime: s.dropTime || '',
    fee: Number(s.fee) || 0,
    landmark: s.landmark || '',
    lat: s.lat != null ? Number(s.lat) : undefined,
    lng: s.lng != null ? Number(s.lng) : undefined,
  })).filter((s) => s.name)
  // Guard: a stop with active riders cannot be removed.
  const incoming = new Set(clean.map((s) => String(s._id)))
  const stillUsed = await TransportAssignment.find({ route: route._id, status: 'active' }, 'stop stopName').lean()
  const orphan = stillUsed.find((a) => !incoming.has(String(a.stop)))
  if (orphan) throw httpError(422, `Stop "${orphan.stopName || 'unnamed'}" has active riders. Reassign them before removing it.`)
  route.stops = clean
  await route.save()
  res.json(route)
}))

/* ── Assignments (student ↔ route+stop) ── */

router.get('/transport/assignments', transport, asyncHandler(async (req, res) => {
  const filter = { ...(req.query.status ? { status: req.query.status } : {}) }
  if (req.query.route) filter.route = req.query.route
  if (req.query.student) filter.student = req.query.student
  // Limit to routes the user may see.
  const scope = await scopeOf(req)
  if (!scope.all) {
    const allowed = await TransportRoute.find({ $or: [{ wings: { $in: scope.wings } }, { wings: { $size: 0 } }, { wings: null }] }, '_id').lean()
    filter.route = filter.route ? filter.route : { $in: allowed.map((r) => r._id) }
  }
  const list = await TransportAssignment.find(filter)
    .populate({ path: 'student', select: 'name admissionNo guardianPhone batch', populate: { path: 'batch', select: 'name type' } })
    .populate({ path: 'route', select: 'name code vehicle', populate: { path: 'vehicle', select: 'number' } })
    .sort({ status: 1, updatedAt: -1 })
    .limit(1000).lean()
  res.json(list)
}))

router.post('/transport/assignments', transport, asyncHandler(async (req, res) => {
  const { student, route: routeId, stop } = req.body
  if (!student || !routeId || !stop) throw httpError(422, 'Student, route and stop are required.')
  await assertStudent(req, student)
  const route = await scopedRoute(req, routeId)
  const stopId = toObjectId(stop)
  const stopObj = stopId && route.stops.find((s) => String(s._id) === String(stopId))
  if (!stopObj) throw httpError(422, 'Choose a valid stop on this route.')
  const active = await TransportAssignment.findOne({ student, status: 'active' })
  if (active) throw httpError(409, 'This student already has an active transport assignment. Cancel the old one first.')
  const data = {
    student,
    route: route._id,
    stop: stopObj._id,
    stopName: stopObj.name,
    pickup: req.body.pickup !== false,
    drop: req.body.drop !== false,
    monthlyFee: Number(req.body.monthlyFee) || feeForStop(route, stopObj._id),
    startDate: req.body.startDate || ymd(),
    endDate: req.body.endDate || undefined,
    notes: req.body.notes,
  }
  const created = await TransportAssignment.create(data)
  res.status(201).json(created)
}))

router.put('/transport/assignments/:id', transport, asyncHandler(async (req, res) => {
  const existing = await TransportAssignment.findById(req.params.id)
  if (!existing) throw httpError(404, 'Assignment not found.')
  await assertStudent(req, existing.student)
  const route = await scopedRoute(req, req.body.route || existing.route)
  const stopId = toObjectId(req.body.stop || existing.stop)
  const stopObj = stopId && route.stops.find((s) => String(s._id) === String(stopId))
  if (!stopObj) throw httpError(422, 'Choose a valid stop on this route.')
  existing.route = route._id
  existing.stop = stopObj._id
  existing.stopName = stopObj.name
  if (req.body.pickup !== undefined) existing.pickup = !!req.body.pickup
  if (req.body.drop !== undefined) existing.drop = !!req.body.drop
  if (req.body.monthlyFee !== undefined) existing.monthlyFee = Number(req.body.monthlyFee) || 0
  if (req.body.startDate !== undefined) existing.startDate = req.body.startDate
  if (req.body.endDate !== undefined) existing.endDate = req.body.endDate || undefined
  if (req.body.status && ['active', 'paused', 'cancelled'].includes(req.body.status)) existing.status = req.body.status
  if (req.body.notes !== undefined) existing.notes = req.body.notes
  await existing.save()
  res.json(existing)
}))

router.delete('/transport/assignments/:id', transport, asyncHandler(async (req, res) => {
  const existing = await TransportAssignment.findById(req.params.id)
  if (!existing) throw httpError(404, 'Assignment not found.')
  await assertStudent(req, existing.student)
  // Preserve history: cancel if there are already invoices or attendance rows.
  const [invoices, attendance] = await Promise.all([
    TransportInvoice.countDocuments({ assignment: existing._id }),
    TransportAttendance.countDocuments({ student: existing.student, route: existing.route }),
  ])
  if (invoices || attendance) {
    existing.status = 'cancelled'
    existing.endDate = existing.endDate || ymd()
    await existing.save()
    return res.json({ ok: true, cancelled: true })
  }
  await existing.deleteOne()
  res.json({ ok: true })
}))

/* ── Attendance (pickup / drop) ── */

// Route sheet: active riders with each one's status for the day/direction.
router.get('/transport/attendance', transport, asyncHandler(async (req, res) => {
  const routeId = req.query.route
  if (!routeId) throw httpError(422, 'Route is required.')
  await scopedRoute(req, routeId)
  const date = req.query.date || ymd()
  const direction = req.query.direction === 'drop' ? 'drop' : 'pickup'
  const riders = await TransportAssignment.find({ route: routeId, status: 'active' })
    .populate({ path: 'student', select: 'name admissionNo guardianPhone batch', populate: { path: 'batch', select: 'name' } })
    .lean()
  const marks = await TransportAttendance.find({ route: routeId, date, direction }).lean()
  const byStudent = Object.fromEntries(marks.map((m) => [String(m.student), m]))
  const rows = riders
    .filter((r) => direction === 'pickup' ? r.pickup !== false : r.drop !== false)
    .map((r) => ({
      _id: r._id,
      student: r.student,
      stopName: r.stopName,
      stop: r.stop,
      status: byStudent[String(r.student?._id)]?.status || null,
      at: byStudent[String(r.student?._id)]?.at || null,
    }))
    .sort((a, b) => (a.student?.name || '').localeCompare(b.student?.name || ''))
  res.json({ route: routeId, date, direction, rows })
}))

router.post('/transport/attendance', transport, asyncHandler(async (req, res) => {
  const { route: routeId, date = ymd(), direction = 'pickup', entries } = req.body
  if (!routeId || !Array.isArray(entries)) throw httpError(422, 'Route and entries are required.')
  if (!['pickup', 'drop'].includes(direction)) throw httpError(422, 'Direction must be pickup or drop.')
  await scopedRoute(req, routeId)
  let saved = 0
  for (const e of entries) {
    if (!e.student || !['boarded', 'absent', 'skipped'].includes(e.status)) continue
    await TransportAttendance.updateOne(
      { student: e.student, date, direction },
      { $set: { route: routeId, status: e.status, stopName: e.stopName || '', markedBy: req.user.id, at: new Date() } },
      { upsert: true },
    )
    saved += 1
  }
  res.json({ ok: true, saved })
}))

/* ── Monthly invoices ── */

const monthFromToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const dueDateFor = (month) => `${month}-10` // default: 10th of the billed month

const invoiceStatus = (inv, today = ymd()) => {
  if (inv.status === 'waived') return 'waived'
  if (inv.paid >= inv.amount - (inv.discount || 0)) return 'paid'
  if (inv.dueDate && inv.dueDate < today) return 'overdue'
  return 'due'
}

router.get('/transport/invoices', transport, asyncHandler(async (req, res) => {
  const filter = {}
  if (req.query.month) filter.month = req.query.month
  if (req.query.route) filter.route = req.query.route
  if (req.query.student) filter.student = req.query.student
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status
  const scope = await scopeOf(req)
  if (!scope.all) {
    const allowed = await TransportRoute.find({ $or: [{ wings: { $in: scope.wings } }, { wings: { $size: 0 } }, { wings: null }] }, '_id').lean()
    filter.route = filter.route ? filter.route : { $in: allowed.map((r) => r._id) }
  }
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    const students = await Student.find({ $or: [{ name: rx }, { admissionNo: rx }, { guardianPhone: rx }] }, '_id').lean()
    filter.student = { $in: students.map((s) => s._id) }
  }
  const list = await TransportInvoice.find(filter)
    .populate({ path: 'student', select: 'name admissionNo batch guardianPhone', populate: { path: 'batch', select: 'name' } })
    .populate('route', 'name code')
    .sort({ month: -1, createdAt: -1 })
    .limit(1000)
    .lean()
  const today = ymd()
  res.json(list.map((i) => ({ ...i, liveStatus: invoiceStatus(i, today) })))
}))

// Create an invoice per active assignment for a given YYYY-MM, idempotent.
router.post('/transport/invoices/generate', transport, asyncHandler(async (req, res) => {
  const month = (req.body.month || monthFromToday()).slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) throw httpError(422, 'Month must be YYYY-MM.')
  const routeFilter = req.body.route ? { _id: req.body.route } : await routeInScope(req)
  const routes = await TransportRoute.find(routeFilter, '_id').lean()
  const assignments = await TransportAssignment.find({ status: 'active', route: { $in: routes.map((r) => r._id) } }).lean()
  const dueDate = req.body.dueDate || dueDateFor(month)
  let created = 0
  for (const a of assignments) {
    const existing = await TransportInvoice.findOne({ student: a.student, month })
    if (existing) continue
    const amount = Number(a.monthlyFee) || 0
    if (!amount) continue
    await TransportInvoice.create({
      student: a.student,
      route: a.route,
      assignment: a._id,
      month,
      amount,
      dueDate,
      status: 'due',
    })
    created += 1
  }
  res.json({ month, created, assignments: assignments.length })
}))

router.put('/transport/invoices/:id', transport, asyncHandler(async (req, res) => {
  const inv = await TransportInvoice.findById(req.params.id)
  if (!inv) throw httpError(404, 'Invoice not found.')
  await assertStudent(req, inv.student)
  const data = pick(req.body, ['amount', 'discount', 'dueDate', 'note'])
  if (data.amount !== undefined) data.amount = Number(data.amount) || 0
  if (data.discount !== undefined) data.discount = Number(data.discount) || 0
  Object.assign(inv, data)
  if (inv.paid > inv.amount - (inv.discount || 0)) throw httpError(422, 'Amount minus discount cannot be less than what is already paid.')
  await inv.save()
  res.json(inv)
}))

router.post('/transport/invoices/:id/pay', accounts, asyncHandler(async (req, res) => {
  const inv = await TransportInvoice.findById(req.params.id)
  if (!inv) throw httpError(404, 'Invoice not found.')
  await assertStudent(req, inv.student)
  const amount = Number(req.body.amount) || 0
  if (!(amount > 0)) throw httpError(422, 'Enter an amount.')
  const net = inv.amount - (inv.discount || 0)
  if (inv.paid + amount > net) throw httpError(422, `Only ${net - inv.paid} is pending on this invoice.`)
  inv.paid += amount
  inv.paidOn = req.body.paidOn || ymd()
  inv.mode = req.body.mode || 'cash'
  inv.receiptNo = req.body.receiptNo || `TR-${Date.now().toString().slice(-7)}`
  inv.collectedBy = req.user.id
  if (req.body.note) inv.note = req.body.note
  if (inv.paid >= net) inv.status = 'paid'
  await inv.save()
  res.json(inv)
}))

router.post('/transport/invoices/:id/waive', transport, asyncHandler(async (req, res) => {
  const inv = await TransportInvoice.findById(req.params.id)
  if (!inv) throw httpError(404, 'Invoice not found.')
  await assertStudent(req, inv.student)
  inv.status = 'waived'
  inv.note = req.body.note || inv.note
  await inv.save()
  res.json(inv)
}))

router.delete('/transport/invoices/:id', accounts, asyncHandler(async (req, res) => {
  const inv = await TransportInvoice.findById(req.params.id)
  if (!inv) throw httpError(404, 'Invoice not found.')
  await assertStudent(req, inv.student)
  if (inv.paid > 0) throw httpError(422, 'This invoice already has a payment. Waive it instead.')
  await inv.deleteOne()
  res.json({ ok: true })
}))

/* ── Dashboard summary ── */

router.get('/transport/summary', transport, asyncHandler(async (req, res) => {
  const scope = await scopeOf(req)
  const routeFilter = scope.all ? {} : { $or: [{ wings: { $in: scope.wings } }, { wings: { $size: 0 } }, { wings: null }] }
  const [routes, vehicles, activeAssignments, pending, today, soonExpiry] = await Promise.all([
    TransportRoute.countDocuments(routeFilter),
    Vehicle.countDocuments(await wingsListFilter(req)),
    TransportAssignment.countDocuments({ status: 'active' }),
    TransportInvoice.aggregate([
      { $match: { status: { $in: ['due', 'overdue'] } } },
      { $group: { _id: null, outstanding: { $sum: { $subtract: ['$amount', { $add: ['$paid', { $ifNull: ['$discount', 0] }] }] } }, n: { $sum: 1 } } },
    ]),
    TransportAttendance.countDocuments({ date: ymd() }),
    (async () => {
      const in30 = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) })()
      return Vehicle.find({
        ...(await wingsListFilter(req)),
        $or: [
          { insuranceExpiry: { $lte: in30, $ne: null } },
          { fitnessExpiry: { $lte: in30, $ne: null } },
          { pucExpiry: { $lte: in30, $ne: null } },
          { permitExpiry: { $lte: in30, $ne: null } },
        ],
      }, 'number model insuranceExpiry fitnessExpiry pucExpiry permitExpiry').limit(20).lean()
    })(),
  ])
  res.json({
    routes,
    vehicles,
    activeAssignments,
    todayMarks: today,
    outstanding: pending[0]?.outstanding || 0,
    pendingInvoices: pending[0]?.n || 0,
    expiringVehicles: soonExpiry,
  })
}))

/* ── Views mounted on the student/parent portal ── */

export async function myTransport(student) {
  const assignment = await TransportAssignment.findOne({ student: student._id, status: 'active' })
    .populate({ path: 'route', populate: { path: 'vehicle', select: 'number model driverName driverPhone conductorName conductorPhone' } })
    .lean()
  const [invoices, recent] = await Promise.all([
    TransportInvoice.find({ student: student._id }).sort({ month: -1 }).limit(24).lean(),
    TransportAttendance.find({ student: student._id }).sort({ date: -1 }).limit(30).lean(),
  ])
  const today = ymd()
  return {
    assignment,
    invoices: invoices.map((i) => ({ ...i, liveStatus: invoiceStatus(i, today) })),
    recentAttendance: recent,
  }
}

export default router
