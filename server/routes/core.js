import crypto from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { allow, clearSessionCookie, isAdmin, requireAuth, setSessionCookie, staffOnly, superOnly } from '../auth.js'
import { crudRouter } from '../crud.js'
import { config } from '../config.js'
import { Attendance, Batch, FeeInstallment, Mark, Notice, Payment, Setting, Staff, Student, StoredFile, User } from '../models.js'
import { atRiskStudents, attendanceSummary, dashboardStats, getSettings, installmentStatus } from '../insights.js'
import { createFeePlan, createStudentLogin, DEFAULT_PARENT_PASSWORD, DEFAULT_STUDENT_PASSWORD, nextAdmissionNo, parentLoginId, syncParentLogin } from '../services.js'
import { asyncHandler, httpError, pick } from '../util.js'
import { assertBatch, assertStudent, assertWing, batchFilter, mergeWings, scopeOf, wingsListFilter } from '../scope.js'
import { logActivity } from '../activity.js'
import { mailEnabled, publicBase, resetEmail, sendMail } from '../mailer.js'

const router = Router()
// Never send password / reset hashes to the browser.
const HIDDEN = '-passwordHash -resetTokenHash -resetTokenExpires'
const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex')

/* ── Auth ── */

// Login URL of each portal and who may use it (mirrors src/lib/portals.js).
const PORTAL_ROLES = {
  superadmin: { name: 'Super Admin Console', login: '/superadmin/login', roles: ['superadmin'] },
  admin: { name: 'Admin Panel', login: '/admin/login', roles: ['admin'] },
  staff: { name: 'Staff Portal', login: '/staff/login', roles: ['teacher', 'accountant', 'counsellor'] },
  student: { name: 'Student Portal', login: '/student/login', roles: ['student'] },
  parent: { name: 'Parent Portal', login: '/parent/login', roles: ['parent'] },
}

const loginAttempts = new Map()
router.post('/auth/login', asyncHandler(async (req, res) => {
  // Basic brute-force protection: 10 failed tries per IP per 15 minutes.
  const key = req.ip
  const entry = loginAttempts.get(key) || { count: 0, until: 0 }
  if (entry.count >= 10 && entry.until > Date.now()) throw httpError(429, 'Too many attempts. Please wait 15 minutes.')

  const loginId = String(req.body.loginId || '').trim().toLowerCase()
  const user = loginId && (await User.findOne({ loginId }))
  const ok = user && user.active && (await bcrypt.compare(String(req.body.password || ''), user.passwordHash))
  if (!ok) {
    loginAttempts.set(key, { count: entry.count + 1, until: Date.now() + 15 * 60_000 })
    // Failed staff logins (and unknown IDs) are recorded for the super admin.
    if (!user || !['student', 'parent'].includes(user.role)) {
      await logActivity(req, { action: 'login_failed', module: 'auth', summary: `Failed login for "${loginId.slice(0, 80)}"`, actor: user || null })
    }
    throw httpError(401, 'Wrong login ID or password.')
  }
  // Each portal has its own login URL; keep each one to its own accounts.
  const portal = PORTAL_ROLES[req.body.as]
  if (portal && !portal.roles.includes(user.role)) {
    const own = Object.values(PORTAL_ROLES).find((p) => p.roles.includes(user.role))
    throw httpError(403, `This account cannot sign in to the ${portal.name}. Please use the ${own.name} at ${own.login}`)
  }
  loginAttempts.delete(key)
  user.lastLoginAt = new Date()
  await user.save()
  setSessionCookie(res, user)
  if (!['student', 'parent'].includes(user.role)) await logActivity(req, { action: 'login', module: 'auth', summary: 'Logged in', actor: user })
  res.json({ user: { id: user._id, name: user.name, role: user.role, loginId: user.loginId } })
}))

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

/* ── Forgot password ── */

// A few tries per address per 15 minutes, so the endpoints cannot be used to spam or guess.
function tooMany(map, key, max) {
  const now = Date.now()
  const hit = map.get(key)
  const entry = hit && hit.until > now ? hit : { count: 0, until: now + 15 * 60_000 }
  entry.count++
  map.set(key, entry)
  if (map.size > 5000) map.clear()
  return entry.count > max
}
const forgotHits = new Map()
const resetHits = new Map()
const RESET_MINUTES = 30
const realEmail = (e) => (e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !/\.local$/i.test(e) ? e : null)

// Where a reset link can be sent: the staff login email, the student's email
// (or the guardian's), or a guardian email saved on one of the parent's children.
async function emailFor(user) {
  if (user.role === 'student') {
    const s = await Student.findById(user.student, 'email guardianEmail').lean()
    return realEmail(s?.email) || realEmail(s?.guardianEmail)
  }
  if (user.role === 'parent') {
    const kids = await Student.find({ _id: { $in: user.children || [] } }, 'guardianEmail').lean()
    return kids.map((k) => realEmail(k.guardianEmail)).find(Boolean) || null
  }
  if (realEmail(user.loginId)) return user.loginId
  const staff = user.staff && (await Staff.findById(user.staff, 'email').lean())
  return realEmail(staff?.email)
}

// Emails a one-time link when an address is on record; otherwise (or if sending fails)
// the request appears for the office under "Password requests". The answer is the same
// for every login ID, so nobody can use it to find out which IDs exist.
router.post('/auth/forgot', asyncHandler(async (req, res) => {
  if (tooMany(forgotHits, req.ip, 5)) throw httpError(429, 'Too many requests. Please wait 15 minutes and try again.')
  const loginId = String(req.body.loginId || '').trim().toLowerCase()
  if (!loginId) throw httpError(422, 'Enter your login ID.')
  const user = await User.findOne({ loginId })
  const portal = PORTAL_ROLES[req.body.as]
  if (user?.active && (!portal || portal.roles.includes(user.role))) {
    const email = mailEnabled ? await emailFor(user) : null
    let sent = false
    if (email) {
      const token = crypto.randomBytes(32).toString('hex')
      user.resetTokenHash = sha256(token)
      user.resetTokenExpires = new Date(Date.now() + RESET_MINUTES * 60_000)
      await user.save()
      const { instituteName } = await getSettings()
      try {
        await sendMail({ to: email, toName: user.name, ...resetEmail({ name: user.name, institute: instituteName, minutes: RESET_MINUTES, link: `${publicBase(req)}/reset-password?token=${token}` }) })
        sent = true
      } catch (error) {
        console.error('[mail] reset email failed:', error.message)
      }
    }
    if (!sent) {
      user.resetRequestedAt = new Date()
      await user.save()
    }
  }
  res.json({
    ok: true,
    emailed: mailEnabled,
    message: mailEnabled
      ? 'If this login ID is registered, a link to reset your password has been emailed to the address on record. If no email is on record, the school office has been asked to reset your password.'
      : 'Your request has been sent to the school office. They will reset your password and share the new one with you.',
  })
}))

router.post('/auth/reset', asyncHandler(async (req, res) => {
  if (tooMany(resetHits, req.ip, 10)) throw httpError(429, 'Too many tries. Please wait 15 minutes.')
  const token = String(req.body.token || '')
  const password = String(req.body.password || '')
  if (password.length < 6) throw httpError(422, 'The new password must be at least 6 characters.')
  const user = token && (await User.findOne({ resetTokenHash: sha256(token), resetTokenExpires: { $gt: new Date() } }))
  if (!user) throw httpError(400, 'This reset link is invalid or has expired. Please ask for a new one from the login page.')
  if (!user.active) throw httpError(403, 'Your account is disabled. Please contact the school office.')
  user.passwordHash = await bcrypt.hash(password, 10)
  user.resetTokenHash = undefined
  user.resetTokenExpires = undefined
  user.resetRequestedAt = undefined
  await user.save()
  const portal = Object.entries(PORTAL_ROLES).find(([, p]) => p.roles.includes(user.role))
  res.json({ ok: true, portal: portal?.[0], login: portal?.[1].login })
}))

router.use(requireAuth)

router.get('/auth/me', asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean()
  if (!user || !user.active) {
    clearSessionCookie(res)
    throw httpError(401, 'Please log in.')
  }
  const settings = await getSettings()
  // Parents get their linked children for the child switcher.
  const children = user.role === 'parent'
    ? await Student.find({ _id: { $in: user.children || [] } }, 'name admissionNo batch status photo').populate('batch', 'name type').sort({ name: 1 }).lean()
    : undefined
  const photo = user.role === 'student' ? (await Student.findById(user.student, 'photo').lean())?.photo : undefined
  res.json({
    user: { id: user._id, name: user.name, role: user.role, loginId: user.loginId, student: user.student, photo, children, wings: user.role === 'superadmin' || !user.wings?.length ? null : user.wings, modules: req.modules || null },
    institute: { ...pick(settings, ['instituteName', 'tagline', 'phone', 'email', 'address', 'academicYear', 'logo']), appUrl: publicBase(req) },
    desktop: config.mode === 'desktop',
  })
}))

router.post('/auth/password', asyncHandler(async (req, res) => {
  const current = String(req.body.current || '')
  const next = String(req.body.next || '')
  if (next.length < 6) throw httpError(422, 'The new password must be at least 6 characters.')
  if (next.length > 100) throw httpError(422, 'The new password is too long.')
  const user = await User.findById(req.user.id)
  if (!user) throw httpError(401, 'Please log in.')
  if (!(await bcrypt.compare(current, user.passwordHash))) throw httpError(422, 'The current password is wrong.')
  if (current === next) throw httpError(422, 'The new password must be different from the current one.')
  user.passwordHash = await bcrypt.hash(next, 10)
  user.resetRequestedAt = undefined
  await user.save()
  res.json({ ok: true })
}))

/* ── Forgotten-password requests (no email on record): the office resets them ── */

const tempPassword = () => `${crypto.randomInt(100000, 999999)}`

// Requests this user may handle: students / parents of their wings (teachers and
// admins), and staff logins (admins: same rules as Settings → Users).
async function resetRequestFilter(req) {
  const scope = await scopeOf(req)
  const kinds = []
  if (isAdmin(req.user) || req.user.role === 'teacher') {
    if (scope.all) kinds.push({ role: { $in: ['student', 'parent'] } })
    else {
      const ids = await Student.distinct('_id', { batch: { $in: scope.batchIds } })
      kinds.push({ role: 'student', student: { $in: ids } }, { role: 'parent', children: { $in: ids } })
    }
  }
  if (isAdmin(req.user)) kinds.push(await usersFilter(req))
  return kinds.length ? { resetRequestedAt: { $ne: null }, active: true, $or: kinds } : null
}

router.get('/reset-requests', staffOnly, asyncHandler(async (req, res) => {
  const filter = await resetRequestFilter(req)
  if (!filter) return res.json([])
  const users = await User.find(filter, 'name loginId role student children resetRequestedAt')
    .populate({ path: 'student', select: 'name admissionNo guardianPhone batch', populate: { path: 'batch', select: 'name' } })
    .populate('children', 'name admissionNo').sort({ resetRequestedAt: -1 }).limit(200).lean()
  res.json(users)
}))

router.get('/reset-requests/count', staffOnly, asyncHandler(async (req, res) => {
  const filter = await resetRequestFilter(req)
  res.json({ count: filter ? await User.countDocuments(filter) : 0 })
}))

router.post('/reset-requests/:id/:action', staffOnly, asyncHandler(async (req, res) => {
  const filter = await resetRequestFilter(req)
  const user = filter && (await User.findOne({ ...filter, _id: req.params.id }))
  if (!user) throw httpError(404, 'This request was already handled or is not in your wing.')
  user.resetRequestedAt = undefined
  if (req.params.action === 'dismiss') {
    await user.save()
    return res.json({ ok: true })
  }
  if (req.params.action !== 'reset') throw httpError(404, 'Not found.')
  const password = String(req.body.password || '') || tempPassword()
  if (password.length < 6) throw httpError(422, 'Password must be at least 6 characters.')
  user.passwordHash = await bcrypt.hash(password, 10)
  user.resetTokenHash = undefined
  user.resetTokenExpires = undefined
  await user.save()
  // Where to send the new password: the guardian's / student's WhatsApp.
  const student = user.role === 'student' ? await Student.findById(user.student, 'guardianPhone phone').lean()
    : user.role === 'parent' ? await Student.findOne({ _id: { $in: user.children } }, 'guardianPhone').lean() : null
  const portal = Object.values(PORTAL_ROLES).find((p) => p.roles.includes(user.role))
  res.json({ name: user.name, loginId: user.loginId, password, phone: student?.guardianPhone || student?.phone || null, loginUrl: `${publicBase(req)}${portal?.login || '/login'}` })
}))

/* ── Settings & users (admin) ── */

router.get('/settings', staffOnly, asyncHandler(async (req, res) => res.json(await getSettings())))

router.put('/settings', superOnly, asyncHandler(async (req, res) => {
  const data = pick(req.body, ['instituteName', 'tagline', 'phone', 'email', 'address', 'academicYear', 'attendanceThreshold', 'passPercent', 'logo', 'libraryLoanDays', 'libraryFinePerDay', 'libraryMaxBooks'])
  if (data.logo === '') data.logo = null
  if (data.logo && !(await StoredFile.exists({ _id: data.logo, purpose: 'logo' }))) throw httpError(422, 'Upload the logo again.')
  const settings = await Setting.findOneAndUpdate({}, data, { returnDocument: 'after', upsert: true, runValidators: true })
  res.json(settings)
}))

// Staff logins. The super admin manages everyone (including admins); a wing admin
// manages the teachers, accountants and counsellors of their own wings.
const STAFF_LOGIN_ROLES = ['teacher', 'accountant', 'counsellor']
const rolesFor = (user) => (user.role === 'superadmin' ? ['admin', ...STAFF_LOGIN_ROLES] : STAFF_LOGIN_ROLES)

async function usersFilter(req) {
  return req.user.role === 'superadmin'
    ? { role: { $nin: ['student', 'parent'] } }
    : { role: { $in: STAFF_LOGIN_ROLES }, ...(await wingsListFilter(req)) }
}

router.get('/users', allow(), asyncHandler(async (req, res) => {
  const filter = await usersFilter(req)
  if (req.query.role) filter.role = String(req.query.role)
  const users = await User.find(filter, HIDDEN).populate('staff', 'name designation').populate('createdBy', 'name').sort({ role: 1, name: 1 }).lean()
  // A role filter must not widen what usersFilter allows.
  res.json(users.filter((u) => req.user.role === 'superadmin' ? !['student', 'parent'].includes(u.role) : STAFF_LOGIN_ROLES.includes(u.role)))
}))

// Wings to store for a login: "whole institute" (undefined) is only for super-admin-made logins.
async function loginWings(req, previous) {
  if (req.body.allWings === true && req.user.role === 'superadmin') return undefined
  return mergeWings(req, req.body.wings, previous)
}

router.post('/users', allow(), asyncHandler(async (req, res) => {
  const { name, loginId, password, role, staff } = req.body
  if (!rolesFor(req.user).includes(role)) throw httpError(422, req.user.role === 'superadmin' ? 'Choose a role.' : 'You can create teacher, accountant and counsellor logins.')
  if (!password || password.length < 6) throw httpError(422, 'Password must be at least 6 characters.')
  const wings = await loginWings(req)
  if (role === 'admin' && !wings?.length && req.body.allWings !== true) throw httpError(422, 'Allocate at least one wing to the admin, or choose "Whole institute".')
  const user = await User.create({ name, loginId, role, staff: staff || undefined, wings, createdBy: req.user.id, passwordHash: await bcrypt.hash(password, 10) })
  res.status(201).json({ ...user.toObject(), passwordHash: undefined })
}))

router.put('/users/:id', allow(), asyncHandler(async (req, res) => {
  const target = await User.findOne({ _id: req.params.id, ...(await usersFilter(req)) })
  if (!target) throw httpError(404, 'Login not found.')
  const self = String(target._id) === req.user.id
  const data = pick(req.body, ['name', 'role', 'active'])
  if (data.role && data.role !== target.role && (self || !rolesFor(req.user).includes(data.role))) throw httpError(422, 'You cannot give that role.')
  if (self && data.active === false) throw httpError(422, 'You cannot deactivate your own account.')
  if (req.body.wings !== undefined || req.body.allWings !== undefined) {
    if (self) throw httpError(422, 'You cannot change your own wings.')
    const wings = await loginWings(req, target.wings)
    if ((data.role || target.role) === 'admin' && req.body.allWings !== true && !wings?.length) throw httpError(422, 'Allocate at least one wing to the admin.')
    target.wings = wings
  }
  if (req.body.password) {
    if (req.body.password.length < 6) throw httpError(422, 'Password must be at least 6 characters.')
    data.passwordHash = await bcrypt.hash(req.body.password, 10)
  }
  if (data.passwordHash) target.resetRequestedAt = undefined
  target.set(data)
  await target.save()
  res.json({ ...target.toObject(), passwordHash: undefined, resetTokenHash: undefined, resetTokenExpires: undefined })
}))

/* ── Dashboard ── */

router.get('/dashboard', staffOnly, asyncHandler(async (req, res) => {
  const scope = await scopeOf(req)
  const noticeFilter = scope.all ? {} : { $or: [{ batch: { $in: scope.batchIds } }, { batch: null }] }
  const paymentFilter = scope.all ? {} : { student: { $in: await Student.distinct('_id', { batch: { $in: scope.batchIds } }) } }
  const [stats, risk, payments, notices] = await Promise.all([
    dashboardStats(scope),
    atRiskStudents({ limit: 6, minScore: 40, scope }),
    Payment.find(paymentFilter).sort({ createdAt: -1 }).limit(12).populate('student', 'name').lean(),
    Notice.find(noticeFilter).sort({ pinned: -1, createdAt: -1 }).limit(8).lean(),
  ])
  // One feed of recent fee payments and notices, newest first.
  const activity = [
    ...payments.map((p) => ({ type: 'fee', id: String(p._id), at: p.createdAt, title: `${p.student?.name || 'A student'} paid`, amount: p.amount, mode: p.mode, link: `/fees/receipt/${p._id}` })),
    ...notices.map((n) => ({ type: 'notice', id: String(n._id), at: n.createdAt, title: n.title, audience: n.audience, link: '/notices' })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 14)
  const updates = notices.slice(0, 5).map((n) => ({ id: String(n._id), title: n.title, at: n.createdAt, pinned: n.pinned }))
  res.json({ ...stats, atRisk: risk, activity, updates })
}))

router.get('/insights/at-risk', staffOnly, asyncHandler(async (req, res) => {
  if (req.query.batch) await assertBatch(req, req.query.batch)
  res.json(await atRiskStudents({ batchId: req.query.batch || undefined, limit: 200, minScore: Number(req.query.min ?? 30), scope: await scopeOf(req) }))
}))

/* ── Staff ── */

router.use('/staff', crudRouter(Staff, {
  fields: ['name', 'designation', 'department', 'subjects', 'phone', 'email', 'salary', 'joiningDate', 'status'],
  search: ['name', 'designation', 'department', 'phone'],
  filters: ['status', 'department'],
  sort: { name: 1 },
  read: staffOnly,
  write: allow(),
  scope: (req) => wingsListFilter(req),
  beforeSave: async (data, req, id) => {
    if (req.body.wings === undefined && id) return
    const previous = id ? (await Staff.findById(id, 'wings').lean())?.wings : []
    // [] = institute-wide (undefined would be dropped from the update and change nothing).
    data.wings = (await mergeWings(req, req.body.wings, previous)) || []
  },
}))

/* ── Batches / classes / courses ── */

router.get('/batches/summary', staffOnly, asyncHandler(async (req, res) => {
  const scope = await scopeOf(req)
  const [batches, counts] = await Promise.all([
    Batch.find(scope.all ? {} : { type: { $in: scope.wings } }).populate('classTeacher', 'name').sort({ type: 1, name: 1 }).lean(),
    Student.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$batch', n: { $sum: 1 } } }]),
  ])
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.n]))
  res.json(batches.map((b) => ({ ...b, students: countMap[String(b._id)] || 0 })))
}))

router.delete('/batches/:id', allow(), asyncHandler(async (req, res, next) => {
  await assertBatch(req, req.params.id)
  if (await Student.exists({ batch: req.params.id })) throw httpError(409, 'Move or remove the students of this batch first, or mark it completed.')
  next()
}))

router.use('/batches', crudRouter(Batch, {
  fields: ['name', 'type', 'program', 'section', 'academicYear', 'subjects', 'classTeacher', 'room', 'timing', 'capacity', 'fee', 'installments', 'status'],
  search: ['name', 'program'],
  filters: ['type', 'status'],
  populate: 'classTeacher',
  sort: { type: 1, name: 1 },
  read: staffOnly,
  write: allow(),
  scope: async (req) => {
    const scope = await scopeOf(req)
    return scope.all ? {} : { type: { $in: scope.wings } }
  },
  beforeSave: async (data, req) => {
    if (data.type) await assertWing(req, data.type)
  },
}))

/* ── Students ── */

const STUDENT_FIELDS = [
  'admissionNo', 'name', 'gender', 'dob', 'phone', 'email', 'guardianName', 'guardianPhone', 'address', 'batch', 'rollNo', 'admissionDate', 'status', 'notes',
  'guardianRelation', 'guardianEmail', 'guardianOccupation', 'fatherName', 'motherName', 'emergencyPhone', 'bloodGroup', 'photo',
]

router.get('/students', staffOnly, asyncHandler(async (req, res) => {
  const conditions = [await batchFilter(req)]
  const filter = { $and: conditions }
  if (req.query.batch) conditions.push({ batch: String(req.query.batch) })
  if (req.query.status) filter.status = req.query.status
  if (req.query.type) conditions.push({ batch: { $in: (await Batch.find({ type: req.query.type }, '_id').lean()).map((b) => b._id) } })
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    filter.$or = [{ name: rx }, { admissionNo: rx }, { phone: rx }, { guardianPhone: rx }, { guardianName: rx }]
  }
  const students = await Student.find(filter).populate('batch', 'name type').sort({ batch: 1, rollNo: 1, name: 1 }).limit(1000).lean()
  res.json(students)
}))

router.get('/students/next-admission-no', staffOnly, asyncHandler(async (req, res) => {
  if (req.query.type) await assertWing(req, req.query.type)
  res.json({ admissionNo: await nextAdmissionNo(req.query.type) })
}))

router.get('/students/:id', staffOnly, asyncHandler(async (req, res) => {
  await assertStudent(req, req.params.id)
  const student = await Student.findById(req.params.id).populate({ path: 'batch', populate: { path: 'classTeacher', select: 'name' } }).lean()
  if (!student) throw httpError(404, 'Student not found.')
  const ids = [student._id]
  const [att, installments, payments, marks, recentAttendance, login] = await Promise.all([
    attendanceSummary({ studentIds: ids, days: 90 }),
    FeeInstallment.find({ student: student._id }).sort({ dueDate: 1 }).lean(),
    Payment.find({ student: student._id }).sort({ paidOn: -1 }).lean(),
    Mark.find({ student: student._id }).populate('exam', 'name date type subjects').sort({ createdAt: -1 }).lean(),
    Attendance.find({ student: student._id }).sort({ date: -1 }).limit(30).lean(),
    User.findOne({ student: student._id }, 'loginId active lastLoginAt').lean(),
  ])
  const parent = await User.findOne({ role: 'parent', children: student._id }, 'name loginId active lastLoginAt children').populate('children', 'name admissionNo').lean()
  res.json({
    student,
    login,
    parent,
    attendance: { summary: att.get(String(student._id)) || null, recent: recentAttendance },
    fees: installments.map((i) => ({ ...i, ...installmentStatus(i) })),
    payments,
    marks,
  })
}))

router.post('/students', allow('teacher', 'accountant', 'counsellor'), asyncHandler(async (req, res) => {
  const data = pick(req.body, STUDENT_FIELDS)
  for (const key of Object.keys(data)) if (data[key] === '') delete data[key]
  const batch = await Batch.findById(data.batch).lean()
  if (!batch) throw httpError(422, 'Choose a class / course / batch.')
  await assertBatch(req, batch._id)
  if (!data.admissionNo) data.admissionNo = await nextAdmissionNo(batch.type)
  if (!data.rollNo) data.rollNo = (await Student.countDocuments({ batch: batch._id })) + 1
  const student = await Student.create(data)
  if (req.body.createFeePlan !== false) await createFeePlan(student, { startDate: data.admissionDate })
  await createStudentLogin(student, req.body.password || DEFAULT_STUDENT_PASSWORD)
  await syncParentLogin(student)
  res.status(201).json(student)
}))

router.put('/students/:id', allow('teacher', 'accountant', 'counsellor'), asyncHandler(async (req, res) => {
  const data = pick(req.body, STUDENT_FIELDS)
  for (const key of Object.keys(data)) if (data[key] === '') data[key] = null
  if (data.batch === null || data.admissionNo === null || data.name === null) throw httpError(422, 'Name, admission number and batch are required.')
  await assertStudent(req, req.params.id)
  if (data.photo && !(await StoredFile.exists({ _id: data.photo, purpose: 'photo' }))) throw httpError(422, 'Upload the photo again.')
  if (data.batch) await assertBatch(req, data.batch)
  const student = await Student.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after', runValidators: true })
  if (!student) throw httpError(404, 'Student not found.')
  await User.updateOne({ student: student._id }, { name: student.name, loginId: student.admissionNo.toLowerCase(), active: student.status === 'active' })
  await syncParentLogin(student)
  res.json(student)
}))

router.post('/students/:id/reset-password', allow('teacher'), asyncHandler(async (req, res) => {
  await assertStudent(req, req.params.id)
  const student = await Student.findById(req.params.id)
  if (!student) throw httpError(404, 'Student not found.')
  const password = req.body.password || DEFAULT_STUDENT_PASSWORD
  const user = await User.findOne({ student: student._id })
  if (user) {
    user.passwordHash = await bcrypt.hash(password, 10)
    user.resetRequestedAt = undefined
    await user.save()
  } else {
    await createStudentLogin(student, password)
  }
  res.json({ loginId: student.admissionNo.toLowerCase(), password })
}))

// Creates the parent login if missing, or resets its password. Login ID = guardian mobile.
router.post('/students/:id/parent-login', allow('teacher'), asyncHandler(async (req, res) => {
  await assertStudent(req, req.params.id)
  const student = await Student.findById(req.params.id)
  if (!student) throw httpError(404, 'Student not found.')
  const loginId = parentLoginId(student.guardianPhone)
  if (!loginId) throw httpError(422, 'Add a 10-digit guardian phone number to the student first.')
  const password = req.body.password || DEFAULT_PARENT_PASSWORD
  if (String(password).length < 6) throw httpError(422, 'Password must be at least 6 characters.')
  const parent = await syncParentLogin(student)
  if (!parent) throw httpError(409, `The ID ${loginId} is already used by a staff or student login.`)
  parent.passwordHash = await bcrypt.hash(String(password), 10)
  parent.resetRequestedAt = undefined
  parent.active = true
  await parent.save()
  res.json({ loginId, password, children: parent.children.length })
}))

router.delete('/students/:id', allow(), asyncHandler(async (req, res) => {
  await assertStudent(req, req.params.id)
  const student = await Student.findById(req.params.id)
  if (!student) throw httpError(404, 'Student not found.')
  if (await Payment.exists({ student: student._id })) {
    // Keep financial history: mark inactive instead of deleting.
    student.status = 'inactive'
    await student.save()
    await User.updateOne({ student: student._id }, { active: false })
    return res.json({ ok: true, deactivated: true })
  }
  await Promise.all([
    Attendance.deleteMany({ student: student._id }), FeeInstallment.deleteMany({ student: student._id }),
    Mark.deleteMany({ student: student._id }), User.deleteMany({ student: student._id }),
    User.updateMany({ role: 'parent', children: student._id }, { $pull: { children: student._id } }),
  ])
  await student.deleteOne()
  res.json({ ok: true })
}))

export default router
