// Daily automation rules. Each rule looks at the data and queues messages in the
// Outbox; a unique dedupeKey per message makes re-running a rule safe.
import { Assignment, Attempt, Attendance, AutomationLog, AutomationRule, Batch, Exam, FeeInstallment, Lead, Mark, Outbox, Student, Submission } from './models.js'
import { attendanceSummary, getSettings, installmentStatus } from './insights.js'
import { addDays, fillTemplate, money, ymd } from './util.js'
import { config } from './config.js'

const epochDay = () => Math.floor(Date.now() / 86400000)
const prettyDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export const DEFAULT_RULES = [
  {
    key: 'fee_reminder',
    name: 'Fee due reminder',
    description: 'Reminds guardians about installments due in the next few days or already overdue. Overdue reminders repeat every few days.',
    hour: 10,
    config: {
      daysBefore: 3,
      repeatEveryDays: 3,
      template: 'Dear {guardian}, {installment} fee of {amount} for {student} {dueText}. Kindly pay at the earliest. Ignore if already paid. - {institute}',
    },
  },
  {
    key: 'absent_alert',
    name: 'Absent alert to parents',
    description: 'Messages the guardian of every student marked absent today.',
    hour: 11,
    config: { template: 'Dear {guardian}, {student} was absent today ({date}) from {batch}. Please inform us of the reason. - {institute}' },
  },
  {
    key: 'low_attendance',
    name: 'Low attendance warning',
    description: 'Weekly warning to guardians when 30-day attendance falls below the threshold set in Settings.',
    hour: 12,
    config: { template: 'Dear {guardian}, {student}\'s attendance in the last 30 days is {pct}%, below the required {threshold}%. Please ensure regular attendance. - {institute}' },
  },
  {
    key: 'lead_followup',
    name: 'Admission follow-ups',
    description: 'For enquiries whose follow-up date has arrived: queues a WhatsApp message to the lead and a task for the counsellor.',
    hour: 9,
    config: { template: 'Hello {name}, thank you for your interest in {course} at {institute}. Would you like to visit the campus or attend a free demo class this week? Reply and we will set it up.' },
  },
  {
    key: 'birthday_wish',
    name: 'Birthday wishes',
    description: 'Sends a birthday wish to students on their birthday.',
    hour: 8,
    config: { template: 'Happy Birthday {student}! 🎂 Wishing you a wonderful year full of learning and success. - Team {institute}' },
  },
  {
    key: 'exam_result',
    name: 'Exam result to parents',
    description: 'Sends each student\'s result to the guardian once the exam is published.',
    hour: 17,
    config: { template: 'Dear {guardian}, {student} scored {percent}% (Grade {grade}, Rank {rank}) in {exam}. Login to the student portal for the full report card. - {institute}' },
  },
  {
    key: 'test_result',
    name: 'Online test score',
    description: 'Sends the online test score to the guardian after the student submits.',
    hour: 18,
    config: { template: 'Dear {guardian}, {student} scored {score}/{total} in the online test "{test}". - {institute}' },
  },
  {
    key: 'assignment_due',
    name: 'Assignment pending reminder',
    description: 'Reminds guardians when an LMS assignment is due soon and their child has not submitted it yet.',
    hour: 16,
    config: {
      daysBefore: 1,
      template: 'Dear {guardian}, {student} has not yet submitted the assignment "{assignment}" ({subject}), due on {due}. Please ask them to submit it on the student portal. - {institute}',
    },
  },
]

export async function ensureRules() {
  for (const rule of DEFAULT_RULES) {
    await AutomationRule.updateOne({ key: rule.key }, { $setOnInsert: rule }, { upsert: true })
  }
}

// Inserts messages, skipping ones already queued (same dedupeKey).
async function queue(messages) {
  if (!messages.length) return 0
  const existing = await Outbox.find({ dedupeKey: { $in: messages.map((m) => m.dedupeKey) } }, 'dedupeKey').lean()
  const seen = new Set(existing.map((m) => m.dedupeKey))
  const fresh = messages.filter((m) => !seen.has(m.dedupeKey))
  if (fresh.length) await Outbox.insertMany(fresh)
  return fresh.length
}

const runners = {
  async fee_reminder(rule, ctx) {
    const { daysBefore = 3, repeatEveryDays = 3, template } = rule.config
    const horizon = addDays(ctx.today, daysBefore)
    const list = await FeeInstallment.find({ dueDate: { $lte: horizon } }).populate('student').lean()
    const bucket = Math.floor(epochDay() / Math.max(1, repeatEveryDays))
    const messages = []
    for (const inst of list) {
      const s = installmentStatus(inst, ctx.today)
      if (s.balance <= 0 || !inst.student || inst.student.status !== 'active') continue
      const dueText = s.status === 'overdue'
        ? `was due on ${prettyDate(inst.dueDate)} (${s.daysOverdue} days overdue)`
        : `is due on ${prettyDate(inst.dueDate)}`
      messages.push({
        channel: 'whatsapp',
        toName: inst.student.guardianName || inst.student.name,
        phone: inst.student.guardianPhone || inst.student.phone,
        message: fillTemplate(template, { guardian: inst.student.guardianName || 'Parent', student: inst.student.name, installment: inst.title, amount: money(s.balance), dueText, institute: ctx.institute }),
        ruleKey: rule.key,
        wing: ctx.wingOf(inst.batch || inst.student.batch),
        dedupeKey: `fee:${inst._id}:${s.status === 'overdue' ? bucket : 'due'}`,
      })
    }
    return messages
  },

  async absent_alert(rule, ctx) {
    const rows = await Attendance.find({ date: ctx.today, status: 'A' }).populate('student').populate('batch', 'name').lean()
    return rows.filter((r) => r.student).map((r) => ({
      channel: 'whatsapp',
      toName: r.student.guardianName || r.student.name,
      phone: r.student.guardianPhone || r.student.phone,
      message: fillTemplate(rule.config.template, { guardian: r.student.guardianName || 'Parent', student: r.student.name, date: prettyDate(ctx.today), batch: r.batch?.name || '', institute: ctx.institute }),
      ruleKey: rule.key,
      wing: ctx.wingOf(r.batch?._id),
      dedupeKey: `absent:${r.student._id}:${ctx.today}`,
    }))
  },

  async low_attendance(rule, ctx) {
    const students = await Student.find({ status: 'active' }).lean()
    const att = await attendanceSummary({ studentIds: students.map((s) => s._id) })
    const week = Math.floor(epochDay() / 7)
    const messages = []
    for (const s of students) {
      const a = att.get(String(s._id))
      if (!a || a.total < 5 || a.pct >= ctx.settings.attendanceThreshold) continue
      messages.push({
        channel: 'whatsapp',
        toName: s.guardianName || s.name,
        phone: s.guardianPhone || s.phone,
        message: fillTemplate(rule.config.template, { guardian: s.guardianName || 'Parent', student: s.name, pct: a.pct, threshold: ctx.settings.attendanceThreshold, institute: ctx.institute }),
        ruleKey: rule.key,
        wing: ctx.wingOf(s.batch),
        dedupeKey: `lowatt:${s._id}:${week}`,
      })
    }
    return messages
  },

  async lead_followup(rule, ctx) {
    const leads = await Lead.find({ status: { $nin: ['converted', 'lost'] }, nextFollowUp: { $lte: ctx.today } }).populate('assignedTo', 'name').lean()
    const messages = []
    for (const lead of leads) {
      messages.push({
        channel: 'whatsapp',
        toName: lead.name,
        phone: lead.phone,
        message: fillTemplate(rule.config.template, { name: lead.name, course: lead.course || 'our courses', institute: ctx.institute }),
        ruleKey: rule.key,
        wing: lead.type,
        dedupeKey: `lead:${lead._id}:${ctx.today}`,
      })
      messages.push({
        channel: 'app',
        toName: lead.assignedTo?.name || 'Counsellor',
        message: `Follow-up due: ${lead.name} (${lead.phone}) — ${lead.course || 'enquiry'}, status "${lead.status}"${lead.nextFollowUp < ctx.today ? `, overdue since ${prettyDate(lead.nextFollowUp)}` : ''}.`,
        ruleKey: rule.key,
        wing: lead.type,
        dedupeKey: `leadtask:${lead._id}:${ctx.today}`,
      })
    }
    return messages
  },

  async birthday_wish(rule, ctx) {
    const md = ctx.today.slice(5)
    const students = await Student.find({ status: 'active', dob: { $regex: `-${md}$` } }).lean()
    return students.map((s) => ({
      channel: 'whatsapp',
      toName: s.name,
      phone: s.phone || s.guardianPhone,
      message: fillTemplate(rule.config.template, { student: s.name.split(' ')[0], institute: ctx.institute }),
      ruleKey: rule.key,
      wing: ctx.wingOf(s.batch),
      dedupeKey: `bday:${s._id}:${ctx.today.slice(0, 4)}`,
    }))
  },

  async exam_result(rule, ctx) {
    const exams = await Exam.find({ published: true }).lean()
    const marks = await Mark.find({ exam: { $in: exams.map((e) => e._id) } }).populate('student').lean()
    const examName = Object.fromEntries(exams.map((e) => [String(e._id), e.name]))
    return marks.filter((m) => m.student).map((m) => ({
      channel: 'whatsapp',
      toName: m.student.guardianName || m.student.name,
      phone: m.student.guardianPhone || m.student.phone,
      message: fillTemplate(rule.config.template, { guardian: m.student.guardianName || 'Parent', student: m.student.name, percent: m.percent, grade: m.grade, rank: m.rank ?? '-', exam: examName[String(m.exam)], institute: ctx.institute }),
      ruleKey: rule.key,
      wing: ctx.wingOf(m.student.batch),
      dedupeKey: `result:${m._id}`,
    }))
  },

  async test_result(rule, ctx) {
    const attempts = await Attempt.find({ submittedAt: { $ne: null } }).populate('student').populate('test', 'title').lean()
    return attempts.filter((a) => a.student && a.test).map((a) => ({
      channel: 'whatsapp',
      toName: a.student.guardianName || a.student.name,
      phone: a.student.guardianPhone || a.student.phone,
      message: fillTemplate(rule.config.template, { guardian: a.student.guardianName || 'Parent', student: a.student.name, score: a.score, total: a.total, test: a.test.title, institute: ctx.institute }),
      ruleKey: rule.key,
      wing: ctx.wingOf(a.student.batch),
      dedupeKey: `test:${a._id}`,
    }))
  },

  async assignment_due(rule, ctx) {
    const { daysBefore = 1, template } = rule.config
    const list = await Assignment.find({ status: 'published', dueDate: { $gte: ctx.today, $lte: addDays(ctx.today, daysBefore) } }).lean()
    const messages = []
    for (const a of list) {
      const [students, subs] = await Promise.all([
        Student.find({ batch: a.batch, status: 'active' }).lean(),
        Submission.find({ assignment: a._id, status: { $ne: 'returned' } }, 'student').lean(),
      ])
      const done = new Set(subs.map((x) => String(x.student)))
      for (const s of students) {
        if (done.has(String(s._id))) continue
        messages.push({
          channel: 'whatsapp',
          toName: s.guardianName || s.name,
          phone: s.guardianPhone || s.phone,
          message: fillTemplate(template, { guardian: s.guardianName || 'Parent', student: s.name, assignment: a.title, subject: a.subject || 'General', due: prettyDate(a.dueDate), institute: ctx.institute }),
          ruleKey: rule.key,
          wing: ctx.wingOf(a.batch),
          dedupeKey: `assign:${a._id}:${s._id}`,
        })
      }
    }
    return messages
  },
}

export async function runRule(key, trigger = 'manual') {
  const rule = await AutomationRule.findOne({ key }).lean()
  if (!rule || !runners[key]) throw new Error(`Unknown automation rule "${key}".`)
  const settings = await getSettings()
  // Every message is tagged with its wing, so wing admins only see their own in the outbox.
  const wingOfBatch = Object.fromEntries((await Batch.find({}, 'type').lean()).map((b) => [String(b._id), b.type]))
  const ctx = { today: ymd(), settings, institute: settings.instituteName, wingOf: (id) => wingOfBatch[String(id?._id || id)] }
  const candidates = await runners[key](rule, ctx)
  const queued = await queue(candidates)
  const summary = queued
    ? `${queued} new message${queued === 1 ? '' : 's'} queued (${candidates.length} matched).`
    : candidates.length ? `${candidates.length} matched, all already queued earlier.` : 'Nothing to send today.'
  await AutomationRule.updateOne({ key }, { lastRunAt: new Date(), lastRunDate: ctx.today, lastResult: summary })
  await AutomationLog.create({ ruleKey: key, ruleName: rule.name, queued, summary, trigger })
  return { key, queued, matched: candidates.length, summary }
}

export async function runDueRules() {
  const today = ymd()
  const hour = new Date().getHours()
  const rules = await AutomationRule.find({ enabled: true, lastRunDate: { $ne: today }, hour: { $lte: hour } }).lean()
  for (const rule of rules) {
    try {
      const result = await runRule(rule.key, 'schedule')
      console.log(`[automation] ${rule.name}: ${result.summary}`)
    } catch (error) {
      console.error(`[automation] ${rule.name} failed:`, error.message)
    }
  }
}

export function startScheduler() {
  const tick = () => runDueRules().catch((error) => console.error('[automation]', error.message))
  setTimeout(tick, 10_000)
  setInterval(tick, config.automationTickMinutes * 60_000)
}
