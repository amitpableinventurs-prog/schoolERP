import bcrypt from 'bcryptjs'
import { Attendance, Batch, Course, CourseProgress, Exam, FeeInstallment, Mark, Payment, Setting, Staff, Student, TimetableSlot, User } from './models.js'
import { getSettings } from './insights.js'
import { config } from './config.js'
import { addDays, grade, ymd } from './util.js'

export const DEFAULT_STUDENT_PASSWORD = 'student123'
export const DEFAULT_PARENT_PASSWORD = 'parent123'

// Splits the batch fee into equal installments, one every `gapDays` from `startDate`.
export async function createFeePlan(student, { startDate = ymd(), gapDays, replace = false } = {}) {
  const batch = await Batch.findById(student.batch).lean()
  if (!batch || !batch.fee) return []
  if (replace) await FeeInstallment.deleteMany({ student: student._id, paid: 0 })
  else if (await FeeInstallment.exists({ student: student._id })) return []
  const count = Math.max(1, batch.installments || 1)
  const gap = gapDays || Math.round(360 / count)
  const base = Math.floor(batch.fee / count)
  const docs = []
  for (let i = 0; i < count; i++) {
    docs.push({
      student: student._id,
      batch: batch._id,
      title: count === 1 ? 'Full fee' : `Installment ${i + 1} of ${count}`,
      // The last installment absorbs the rounding difference.
      amount: i === count - 1 ? batch.fee - base * (count - 1) : base,
      dueDate: addDays(startDate, i * gap),
    })
  }
  return FeeInstallment.insertMany(docs)
}

export async function nextReceiptNo() {
  const prefix = `RCP-${ymd().slice(0, 4)}-`
  const last = await Payment.findOne({ receiptNo: { $regex: `^${prefix}` } }).sort({ receiptNo: -1 }).lean()
  const n = last ? Number(last.receiptNo.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(n).padStart(5, '0')}`
}

// Records a payment and spreads it over the student's oldest unpaid installments
// (or onto one installment when given).
export async function recordPayment({ student, installment, amount, mode, paidOn, reference, note, collectedBy }) {
  let remaining = Number(amount)
  const targets = installment
    ? await FeeInstallment.find({ _id: installment, student })
    : await FeeInstallment.find({ student }).sort({ dueDate: 1 })
  for (const inst of targets) {
    if (remaining <= 0) break
    const balance = inst.amount - (inst.discount || 0) - (inst.paid || 0)
    if (balance <= 0) continue
    const apply = Math.min(balance, remaining)
    inst.paid = (inst.paid || 0) + apply
    remaining -= apply
    await inst.save()
  }
  return Payment.create({
    student, installment: installment || targets.find((t) => t.paid > 0)?._id, amount, mode,
    paidOn: paidOn || ymd(), reference, note, collectedBy, receiptNo: await nextReceiptNo(),
  })
}

// Recalculates totals, percentages, grades and ranks for every student in an exam.
export async function recomputeExam(examId) {
  const exam = await Exam.findById(examId).lean()
  const marks = await Mark.find({ exam: examId })
  const maxBySubject = Object.fromEntries(exam.subjects.map((s) => [s.name, s.maxMarks]))
  for (const m of marks) {
    const scored = m.scores.filter((s) => s.marks != null && maxBySubject[s.subject] != null)
    m.total = scored.reduce((sum, s) => sum + Number(s.marks), 0)
    m.max = scored.reduce((sum, s) => sum + maxBySubject[s.subject], 0)
    m.percent = m.max ? Math.round((m.total / m.max) * 1000) / 10 : null
    m.grade = m.percent == null ? null : grade(m.percent)
  }
  const ranked = [...marks].filter((m) => m.percent != null).sort((a, b) => b.percent - a.percent)
  ranked.forEach((m, i) => {
    // Equal percentages share a rank.
    m.rank = i > 0 && ranked[i - 1].percent === m.percent ? ranked[i - 1].rank : i + 1
  })
  await Promise.all(marks.map((m) => m.save()))
  return marks
}

export async function createStudentLogin(student, password = DEFAULT_STUDENT_PASSWORD) {
  const loginId = student.admissionNo.toLowerCase()
  if (await User.exists({ loginId })) return null
  return User.create({ name: student.name, loginId, passwordHash: await bcrypt.hash(password, 10), role: 'student', student: student._id })
}

export async function nextAdmissionNo(type) {
  const settings = await getSettings()
  const prefix = { school: 'SCH', college: 'CLG', coaching: 'COA' }[type] || 'STU'
  const year = (settings.academicYear || ymd().slice(0, 4)).slice(2, 4)
  const rx = new RegExp(`^${prefix}${year}`)
  const last = await Student.findOne({ admissionNo: rx }).sort({ admissionNo: -1 }).lean()
  const n = last ? Number(last.admissionNo.slice(prefix.length + 2)) + 1 : 1
  return `${prefix}${year}${String(n).padStart(4, '0')}`
}

/* ── Parent logins ── */

// A parent logs in with the guardian mobile number (last 10 digits).
export function parentLoginId(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

// Links the student to the parent account for their guardian phone, creating it when needed.
// Siblings with the same guardian phone share one account.
export async function syncParentLogin(student, passwordHash) {
  const loginId = parentLoginId(student.guardianPhone)
  await User.updateMany({ role: 'parent', children: student._id, loginId: { $ne: loginId } }, { $pull: { children: student._id } })
  if (!loginId) return null
  const existing = await User.findOne({ loginId })
  if (existing) {
    // Never attach children to a staff or student account that happens to use the same ID.
    if (existing.role !== 'parent') return null
    if (!existing.children.some((c) => String(c) === String(student._id))) {
      existing.children.push(student._id)
      await existing.save()
    }
    return existing
  }
  return User.create({
    name: student.guardianName || `Parent of ${student.name}`,
    loginId,
    role: 'parent',
    children: [student._id],
    passwordHash: passwordHash || (await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 10)),
  })
}

// Startup migration: every student with a guardian phone gets a parent login.
export async function ensureParentLogins() {
  const linked = await User.distinct('children', { role: 'parent' })
  const students = await Student.find({ _id: { $nin: linked }, guardianPhone: { $nin: [null, ''] } })
  if (!students.length) return 0
  const hash = await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 10)
  let count = 0
  for (const s of students) if (await syncParentLogin(s, hash)) count++
  if (count) console.log(`[db] Linked ${count} student${count === 1 ? '' : 's'} to parent logins`)
  return count
}

/* ── LMS ── */

export const lessonIds = (course) => course.modules.flatMap((m) => m.lessons.map((l) => String(l._id)))

// Share of the course's current lessons the student has completed.
export function progressOf(course, progress) {
  const ids = lessonIds(course)
  const done = new Set((progress?.completed || []).map((c) => String(c.lesson)))
  const completed = ids.filter((id) => done.has(id)).length
  const quizzes = (progress?.completed || []).filter((c) => c.total && done.has(String(c.lesson)) && ids.includes(String(c.lesson)))
  return {
    total: ids.length,
    completed,
    pct: ids.length ? Math.round((completed / ids.length) * 100) : 0,
    quizPct: quizzes.length ? Math.round((quizzes.reduce((a, q) => a + Math.max(0, q.score) / q.total, 0) / quizzes.length) * 100) : null,
    nextLesson: ids.find((id) => !done.has(id)) || null,
    lastAt: progress?.lastAt || null,
  }
}

// Published courses for a batch with the student's progress in each.
export async function coursesForStudent(student) {
  const batchId = student.batch?._id || student.batch
  const courses = await Course.find({ batches: batchId, status: 'published' }).sort({ updatedAt: -1 }).lean()
  const progress = await CourseProgress.find({ student: student._id, course: { $in: courses.map((c) => c._id) } }).lean()
  const byCourse = Object.fromEntries(progress.map((p) => [String(p.course), p]))
  return courses.map((c) => {
    const p = progressOf(c, byCourse[String(c._id)])
    const next = p.nextLesson && c.modules.flatMap((m) => m.lessons).find((l) => String(l._id) === p.nextLesson)
    return {
      _id: c._id, title: c.title, subject: c.subject, description: c.description, teacherName: c.teacherName,
      modules: c.modules.length, ...p, nextLessonTitle: next?.title || null,
    }
  })
}

/* ── Leave ── */

// Every date in the range except Sundays.
export function leaveDates(from, to) {
  const dates = []
  for (let d = from; d <= to && dates.length < 62; d = addDays(d, 1)) {
    if (new Date(`${d}T00:00:00`).getDay() !== 0) dates.push(d)
  }
  return dates
}

// An approved leave marks the student "L" for those days, except days already marked present.
export async function applyLeaveToAttendance(leave) {
  const student = await Student.findById(leave.student, 'batch').lean()
  if (!student) return 0
  const dates = leaveDates(leave.from, leave.to)
  const present = new Set((await Attendance.find({ student: student._id, date: { $in: dates }, status: 'P' }, 'date').lean()).map((a) => a.date))
  const ops = dates.filter((d) => !present.has(d)).map((date) => ({
    updateOne: { filter: { student: student._id, date }, update: { $set: { status: 'L', batch: student.batch } }, upsert: true },
  }))
  if (ops.length) await Attendance.bulkWrite(ops)
  return ops.length
}

/* ── Super admin & wings ── */

// The institute needs exactly one super admin: the .env admin (or the oldest admin) is promoted.
export async function ensureSuperAdmin() {
  if (await User.exists({ role: 'superadmin' })) return
  const user = (await User.findOne({ loginId: config.auth.initialAdmin.email.toLowerCase(), role: 'admin' }))
    || (await User.findOne({ role: 'admin' }).sort({ createdAt: 1 }))
  if (!user) return
  user.role = 'superadmin'
  user.wings = undefined
  await user.save()
  console.log(`[db] ${user.loginId} is now the super admin`)
}

// One-time: give existing staff the wings of the batches they teach or class-teach.
// Staff who teach nowhere (principal, office) stay institute-wide.
export async function ensureStaffWings() {
  const settings = await getSettings()
  if (settings.migrations?.includes('staff-wings')) return
  const batches = await Batch.find({}, 'type classTeacher').lean()
  const typeOf = Object.fromEntries(batches.map((b) => [String(b._id), b.type]))
  const wings = new Map()
  const add = (staffId, type) => {
    if (!staffId || !type) return
    const key = String(staffId)
    wings.set(key, new Set([...(wings.get(key) || []), type]))
  }
  for (const b of batches) add(b.classTeacher, b.type)
  for (const slot of await TimetableSlot.find({}, 'teacher batch').lean()) add(slot.teacher, typeOf[String(slot.batch)])
  for (const [id, set] of wings) await Staff.updateOne({ _id: id, wings: { $exists: false } }, { wings: [...set].sort() })
  await Setting.updateOne({}, { $addToSet: { migrations: 'staff-wings' } })
  if (wings.size) console.log(`[db] Set wings for ${wings.size} staff members from their timetable`)
}
