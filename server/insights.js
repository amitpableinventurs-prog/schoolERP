// Rule-based analytics. These work without any AI key and are also the data
// source for the AI assistant's tools, so both always agree on the numbers.
import mongoose from 'mongoose'
import { Attendance, Batch, FeeInstallment, Lead, Mark, Payment, Setting, Student, Staff } from './models.js'
import { addDays, daysBetween, ymd } from './util.js'

const oid = (id) => new mongoose.Types.ObjectId(String(id))

export async function getSettings() {
  return (await Setting.findOne().lean()) || (await Setting.create({})).toObject()
}

export function installmentStatus(inst, today = ymd()) {
  const balance = Math.max(0, inst.amount - (inst.discount || 0) - (inst.paid || 0))
  const status = balance <= 0 ? 'paid' : inst.dueDate < today ? 'overdue' : 'due'
  return { balance, status, daysOverdue: status === 'overdue' ? daysBetween(inst.dueDate, today) : 0 }
}

// { studentId: { present, absent, leave, total, pct } } over the last `days` days.
export async function attendanceSummary({ studentIds, batchId, days = 30 } = {}) {
  const match = { date: { $gte: addDays(ymd(), -days + 1) } }
  if (studentIds) match.student = { $in: studentIds.map(oid) }
  if (batchId) match.batch = oid(batchId)
  const rows = await Attendance.aggregate([
    { $match: match },
    { $group: {
      _id: '$student',
      present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } },
      absent: { $sum: { $cond: [{ $eq: ['$status', 'A'] }, 1, 0] } },
      leave: { $sum: { $cond: [{ $eq: ['$status', 'L'] }, 1, 0] } },
      total: { $sum: 1 },
    } },
  ])
  const map = new Map()
  for (const r of rows) map.set(String(r._id), { ...r, pct: r.total ? Math.round((r.present / r.total) * 100) : null })
  return map
}

// Average percentage over each student's last 3 exams.
export async function examSummary(studentIds) {
  const match = studentIds ? { student: { $in: studentIds.map(oid) } } : {}
  const rows = await Mark.aggregate([
    { $match: { ...match, percent: { $ne: null } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$student', percents: { $push: '$percent' } } },
  ])
  const map = new Map()
  for (const r of rows) {
    const recent = r.percents.slice(0, 3)
    const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
    // Trend: latest exam compared with the average of the earlier ones.
    const trend = recent.length > 1 ? Math.round(recent[0] - recent.slice(1).reduce((a, b) => a + b, 0) / (recent.length - 1)) : 0
    map.set(String(r._id), { avg, latest: recent[0], trend, exams: r.percents.length })
  }
  return map
}

export async function feeSummaryByStudent(studentIds) {
  const today = ymd()
  const match = studentIds ? { student: { $in: studentIds.map(oid) } } : {}
  const list = await FeeInstallment.find(match).lean()
  const map = new Map()
  for (const inst of list) {
    const key = String(inst.student)
    const entry = map.get(key) || { total: 0, paid: 0, balance: 0, overdue: 0, maxDaysOverdue: 0 }
    const s = installmentStatus(inst, today)
    entry.total += inst.amount - (inst.discount || 0)
    entry.paid += inst.paid || 0
    entry.balance += s.balance
    if (s.status === 'overdue') {
      entry.overdue += s.balance
      entry.maxDaysOverdue = Math.max(entry.maxDaysOverdue, s.daysOverdue)
    }
    map.set(key, entry)
  }
  return map
}

// Early-warning score (0-100) combining attendance, marks and overdue fees.
// `scope` (from scope.js) limits the list to a user's wings.
export async function atRiskStudents({ batchId, limit = 50, minScore = 30, scope } = {}) {
  const settings = await getSettings()
  const filter = { status: 'active' }
  if (batchId) filter.batch = batchId
  else if (scope && !scope.all) filter.batch = { $in: scope.batchIds }
  const students = await Student.find(filter).populate('batch', 'name type').lean()
  const ids = students.map((s) => s._id)
  const [att, exams, fees] = await Promise.all([attendanceSummary({ studentIds: ids }), examSummary(ids), feeSummaryByStudent(ids)])

  const result = []
  for (const s of students) {
    const key = String(s._id)
    const a = att.get(key)
    const e = exams.get(key)
    const f = fees.get(key)
    let score = 0
    const reasons = []
    if (a?.pct != null && a.pct < settings.attendanceThreshold) {
      score += Math.min(40, (settings.attendanceThreshold - a.pct) * 1.5 + 10)
      reasons.push(`Attendance ${a.pct}% (below ${settings.attendanceThreshold}%)`)
    }
    if (e) {
      if (e.avg < 50) {
        score += Math.min(35, (50 - e.avg) + 10)
        reasons.push(`Average marks ${e.avg}%`)
      }
      if (e.trend <= -10) {
        score += 10
        reasons.push(`Marks dropped ${Math.abs(e.trend)}% in latest exam`)
      }
    }
    if (f?.overdue > 0) {
      score += Math.min(20, 8 + f.maxDaysOverdue / 5)
      reasons.push(`Fee overdue ₹${f.overdue.toLocaleString('en-IN')} (${f.maxDaysOverdue} days)`)
    }
    score = Math.min(100, Math.round(score))
    if (score >= minScore) {
      result.push({
        student: { _id: s._id, name: s.name, admissionNo: s.admissionNo, guardianPhone: s.guardianPhone, batch: s.batch },
        score,
        level: score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low',
        attendance: a?.pct ?? null,
        avgMarks: e?.avg ?? null,
        overdue: f?.overdue || 0,
        reasons,
      })
    }
  }
  return result.sort((x, y) => y.score - x.score).slice(0, limit)
}

const SOURCE_WEIGHT = { referral: 25, walkin: 22, website: 15, call: 14, social: 10, ads: 8, other: 5 }
const STATUS_WEIGHT = { new: 5, contacted: 15, demo: 30, visited: 35, converted: 100, lost: 0 }

// Conversion-likelihood score for an admission enquiry.
export function scoreLead(lead) {
  if (lead.status === 'converted') return 100
  if (lead.status === 'lost') return 0
  let score = (SOURCE_WEIGHT[lead.source] ?? 5) + (STATUS_WEIGHT[lead.status] ?? 0)
  score += Math.min(15, (lead.followUps?.length || 0) * 5)
  if (lead.email) score += 5
  if (lead.course) score += 5
  const ageDays = lead.createdAt ? daysBetween(ymd(lead.createdAt), ymd()) : 0
  if (ageDays > 30) score -= 15
  else if (ageDays > 14) score -= 8
  if (lead.nextFollowUp && lead.nextFollowUp < ymd()) score -= 10 // missed follow-up
  return Math.max(1, Math.min(99, Math.round(score)))
}

// Dashboard numbers for the whole institute, or for the wings in `scope`.
export async function dashboardStats(scope = { all: true }) {
  const today = ymd()
  const monthStart = today.slice(0, 8) + '01'
  const all = scope.all
  const inBatches = all ? {} : { batch: { $in: scope.batchIds } }
  const studentIds = all ? undefined : await Student.distinct('_id', inBatches)
  const byStudent = all ? {} : { student: { $in: studentIds } }
  const byWing = (field) => (all ? {} : { [field]: { $in: scope.wings } })
  const [studentsByType, staffCount, batches, todayAtt, monthPayments, leadsByStatus, followupsDue] = await Promise.all([
    Student.aggregate([
      { $match: { status: 'active', ...inBatches } },
      { $lookup: { from: 'batches', localField: 'batch', foreignField: '_id', as: 'b' } },
      { $unwind: '$b' },
      { $group: { _id: '$b.type', count: { $sum: 1 } } },
    ]),
    Staff.countDocuments({ status: 'active', ...byWing('wings') }),
    Batch.countDocuments({ status: 'active', ...byWing('type') }),
    Attendance.aggregate([{ $match: { date: today, ...inBatches } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { paidOn: { $gte: monthStart }, ...byStudent } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Lead.aggregate([{ $match: byWing('type') }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Lead.countDocuments({ status: { $nin: ['converted', 'lost'] }, nextFollowUp: { $lte: today }, ...byWing('type') }),
  ])

  // Fee collection for the last 6 months.
  const months = []
  const d = new Date()
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
    months.push(ymd(m).slice(0, 7))
  }
  const collection = await Payment.aggregate([
    { $match: { paidOn: { $gte: `${months[0]}-01` }, ...byStudent } },
    { $group: { _id: { $substr: ['$paidOn', 0, 7] }, total: { $sum: '$amount' } } },
  ])
  const collectionMap = Object.fromEntries(collection.map((c) => [c._id, c.total]))

  // Running totals at each month end (students by admission, staff by joining) and
  // the unpaid balance of installments falling due in each month — for sparklines.
  const monthEnds = months.map((m) => `${m}-31`)
  const [admissions, joinings, duesByMonth] = await Promise.all([
    Student.find({ status: 'active', ...inBatches }, 'admissionDate createdAt').lean(),
    Staff.find({ status: 'active', ...byWing('wings') }, 'joiningDate createdAt').lean(),
    FeeInstallment.aggregate([
      { $match: { dueDate: { $gte: `${months[0]}-01`, $lte: monthEnds[5] }, ...byStudent } },
      { $group: { _id: { $substr: ['$dueDate', 0, 7] }, total: { $sum: { $max: [0, { $subtract: [{ $subtract: ['$amount', { $ifNull: ['$discount', 0] }] }, { $ifNull: ['$paid', 0] }] }] } } } },
    ]),
  ])
  const runningTotal = (rows, field) => {
    const dates = rows.map((r) => r[field] || ymd(r.createdAt))
    return monthEnds.map((end, i) => ({ month: months[i], total: dates.filter((d) => d <= end).length }))
  }
  const duesMap = Object.fromEntries(duesByMonth.map((r) => [r._id, r.total]))

  // Attendance % for the last 14 days (days with any record).
  const trend = await Attendance.aggregate([
    { $match: { date: { $gte: addDays(today, -20) }, ...inBatches } },
    { $group: { _id: '$date', present: { $sum: { $cond: [{ $eq: ['$status', 'P'] }, 1, 0] } }, total: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ])

  const fees = await feeSummaryByStudent(studentIds)
  let outstanding = 0
  let overdue = 0
  let defaulters = 0
  for (const f of fees.values()) {
    outstanding += f.balance
    overdue += f.overdue
    if (f.overdue > 0) defaulters++
  }

  const att = Object.fromEntries(todayAtt.map((r) => [r._id, r.count]))
  const markedToday = (att.P || 0) + (att.A || 0) + (att.L || 0)
  const byType = Object.fromEntries(studentsByType.map((r) => [r._id, r.count]))
  const leads = Object.fromEntries(leadsByStatus.map((r) => [r._id, r.count]))

  return {
    students: { total: Object.values(byType).reduce((a, b) => a + b, 0), byType },
    staff: staffCount,
    batches,
    attendanceToday: { present: att.P || 0, absent: att.A || 0, leave: att.L || 0, marked: markedToday, pct: markedToday ? Math.round(((att.P || 0) / markedToday) * 100) : null },
    fees: { collectedThisMonth: monthPayments[0]?.total || 0, outstanding, overdue, defaulters },
    leads: { byStatus: leads, open: (leads.new || 0) + (leads.contacted || 0) + (leads.demo || 0) + (leads.visited || 0), followupsDue },
    charts: {
      collection: months.map((m) => ({ month: m, total: collectionMap[m] || 0 })),
      students: runningTotal(admissions, 'admissionDate'),
      staff: runningTotal(joinings, 'joiningDate'),
      dues: months.map((m) => ({ month: m, total: duesMap[m] || 0 })),
      attendance: trend.slice(-14).map((t) => ({ date: t._id, pct: Math.round((t.present / t.total) * 100) })),
    },
  }
}
