// Super admin: wings overview, allocated admins, the activity log and the
// institute's desktop app keys. Creating and editing admin logins goes through /users (core.js).
import fs from 'node:fs'
import { Router } from 'express'
import { superOnly } from '../auth.js'
import { config } from '../config.js'
import { ActivityLog, Batch, INSTITUTION_TYPES, Student, User } from '../models.js'
import { addDays, asyncHandler, escapeRegex, httpError, pick, ymd } from '../util.js'
import { changeInstallation, createInstallation, deleteInstallation, Installation, installationView, LISTED, renewInstallation, resetInstallationDevice } from '../platform/store.js'

const router = Router()
router.use(['/admin', '/activity', '/desktop-apps'], superOnly)

const sinceDays = (n) => new Date(`${addDays(ymd(), -n + 1)}T00:00:00`)

// One card per wing: size, and who manages it.
router.get('/admin/overview', asyncHandler(async (req, res) => {
  const [batches, students, admins] = await Promise.all([
    Batch.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$type', n: { $sum: 1 } } }]),
    Student.aggregate([
      { $match: { status: 'active' } },
      { $lookup: { from: 'batches', localField: 'batch', foreignField: '_id', as: 'b' } },
      { $unwind: '$b' },
      { $group: { _id: '$b.type', n: { $sum: 1 } } },
    ]),
    User.find({ role: 'admin' }, 'name loginId wings active lastLoginAt').lean(),
  ])
  const count = (list, wing) => list.find((x) => x._id === wing)?.n || 0
  res.json({
    wings: INSTITUTION_TYPES.map((wing) => ({
      wing,
      batches: count(batches, wing),
      students: count(students, wing),
      admins: admins.filter((a) => a.wings?.includes(wing)).map((a) => ({ _id: a._id, name: a.name, active: a.active })),
    })),
    wholeInstitute: admins.filter((a) => !a.wings?.length).map((a) => ({ _id: a._id, name: a.name, active: a.active })),
  })
}))

// Admins (and optionally all staff logins) with their recent activity.
router.get('/admin/admins', asyncHandler(async (req, res) => {
  const roles = req.query.all === '1' ? ['superadmin', 'admin', 'teacher', 'accountant', 'counsellor'] : ['admin']
  const users = await User.find({ role: { $in: roles } }, '-passwordHash').populate('createdBy', 'name').sort({ role: 1, name: 1 }).lean()
  const since = sinceDays(7)
  const stats = await ActivityLog.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) }, createdAt: { $gte: since } } },
    { $group: {
      _id: '$user',
      actions: { $sum: { $cond: [{ $in: ['$action', ['create', 'update', 'delete', 'ai']] }, 1, 0] } },
      deletes: { $sum: { $cond: [{ $eq: ['$action', 'delete'] }, 1, 0] } },
      logins: { $sum: { $cond: [{ $eq: ['$action', 'login'] }, 1, 0] } },
      failed: { $sum: { $cond: [{ $eq: ['$action', 'login_failed'] }, 1, 0] } },
      lastAt: { $max: '$createdAt' },
    } },
  ])
  const byUser = Object.fromEntries(stats.map((s) => [String(s._id), s]))
  res.json(users.map((u) => ({ ...u, activity: byUser[String(u._id)] || { actions: 0, deletes: 0, logins: 0, failed: 0, lastAt: null } })))
}))

// Filterable, newest-first activity log. Paginate with ?before=<createdAt of the last row>.
router.get('/activity', asyncHandler(async (req, res) => {
  const filter = {}
  const { user, role, wing, module, action, from, to, q, before } = req.query
  if (user) filter.user = user
  if (role) filter.role = role
  if (wing === 'all') filter.wings = { $size: 0 }
  else if (wing) filter.wings = wing
  if (module) filter.module = module
  if (action) filter.action = action
  if (from || to || before) {
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = new Date(`${from}T00:00:00`)
    if (to) filter.createdAt.$lte = new Date(`${to}T23:59:59.999`)
    if (before) filter.createdAt.$lt = new Date(before)
  }
  if (q) {
    const rx = new RegExp(escapeRegex(String(q)), 'i')
    filter.$or = [{ summary: rx }, { userName: rx }, { path: rx }]
  }
  const limit = Math.min(200, Number(req.query.limit) || 100)
  const rows = await ActivityLog.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean()
  res.json({ rows: rows.slice(0, limit), more: rows.length > limit })
}))

// Numbers for the top of the monitoring page.
router.get('/activity/summary', asyncHandler(async (req, res) => {
  const today = sinceDays(1)
  const week = sinceDays(7)
  const [todayByAction, perDay, topUsers, failed, modules] = await Promise.all([
    ActivityLog.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: '$action', n: { $sum: 1 } } }]),
    ActivityLog.aggregate([
      { $match: { createdAt: { $gte: week }, action: { $in: ['create', 'update', 'delete', 'ai'] } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: '+05:30' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    ActivityLog.aggregate([
      { $match: { createdAt: { $gte: week }, action: { $in: ['create', 'update', 'delete', 'ai'] } } },
      { $group: { _id: '$user', name: { $last: '$userName' }, role: { $last: '$role' }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 6 },
    ]),
    ActivityLog.find({ action: 'login_failed', createdAt: { $gte: week } }).sort({ createdAt: -1 }).limit(8).lean(),
    ActivityLog.distinct('module'),
  ])
  const days = Array.from({ length: 7 }, (_, i) => addDays(ymd(), i - 6))
  const dayMap = Object.fromEntries(perDay.map((d) => [d._id, d.n]))
  res.json({
    today: Object.fromEntries(todayByAction.map((a) => [a._id, a.n])),
    perDay: days.map((d) => ({ date: d, n: dayMap[d] || 0 })),
    topUsers,
    failed,
    modules: modules.filter(Boolean).sort(),
  })
}))

/* ── Desktop app (Windows .exe) keys of this institute ── */

// Keys live on the central server, so they are managed online (the desktop app
// shows its own licence on the same page instead).
router.use('/desktop-apps', (req, res, next) => {
  if (config.mode === 'desktop') return next(httpError(409, 'Desktop app keys are managed online. Open the institute website as super admin.'))
  next()
})

const installer = () => fs.readdirSync(config.platform.installerDir, { withFileTypes: true }).some((f) => f.isFile() && /setup.*\.exe$/i.test(f.name))

router.get('/desktop-apps', asyncHandler(async (req, res) => {
  const tenant = req.tenant
  const rows = await Installation.find({ tenant: tenant._id, ...LISTED }, '-sync.conflicts').sort({ createdAt: -1 }).lean()
  let hasInstaller = false
  try { hasInstaller = installer() } catch { /* no release folder yet */ }
  res.json({
    installations: rows.map((i) => installationView(tenant, i)),
    modules: tenant.modules,
    limit: tenant.maxInstallations || null,
    active: rows.filter((i) => i.status === 'active').length,
    offlineDays: tenant.offlineGraceDays ?? config.platform.offlineGraceDays,
    serverUrl: config.platform.publicUrl,
    installer: hasInstaller,
  })
}))

router.post('/desktop-apps', asyncHandler(async (req, res) => {
  res.status(201).json(await createInstallation(req.tenant, req.body))
}))

const own = async (req) => {
  const inst = await Installation.findOne({ _id: req.params.id, tenant: req.tenant._id, ...LISTED })
  if (!inst) throw httpError(404, 'Desktop app not found.')
  return inst
}

router.put('/desktop-apps/:id', asyncHandler(async (req, res) => {
  res.json(await changeInstallation(req.tenant, await own(req), pick(req.body, ['label', 'modules', 'status', 'plan', 'expiresAt'])))
}))

router.post('/desktop-apps/:id/reset-device', asyncHandler(async (req, res) => {
  res.json(await resetInstallationDevice({ _id: (await own(req))._id }))
}))

router.post('/desktop-apps/:id/renew', asyncHandler(async (req, res) => {
  res.json(await renewInstallation(await own(req)))
}))

router.delete('/desktop-apps/:id', asyncHandler(async (req, res) => {
  res.json(await deleteInstallation({ _id: (await own(req))._id }))
}))

export default router
