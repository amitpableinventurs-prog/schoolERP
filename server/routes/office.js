import { Router } from 'express'
import { allow, staffOnly, superOnly } from '../auth.js'
import { AutomationLog, AutomationRule, Batch, FeeInstallment, Lead, LEAD_STATUSES, Outbox, Payment, Student } from '../models.js'
import { atRiskStudents, getSettings, installmentStatus, scoreLead } from '../insights.js'
import { createFeePlan, createStudentLogin, nextAdmissionNo, recordPayment } from '../services.js'
import { runRule } from '../automation.js'
import { aiEnabled, aiProvider, assistantChat, leadMessage, riskActionPlan } from '../ai.js'
import { asyncHandler, escapeRegex, httpError, pick, ymd } from '../util.js'
import { assertBatch, assertStudent, assertWing, batchFilter, batchInScope, batchQuery, scopeOf, studentFilter, wingFilter } from '../scope.js'

const router = Router()
const accounts = allow('accountant')
const counsellor = allow('counsellor')

/* ── Fees ── */

// Installments with live status. ?status=due|overdue|paid|unpaid, ?batch, ?student, ?q
router.get('/fees/installments', accounts, asyncHandler(async (req, res) => {
  const filter = await batchQuery(req, req.query.batch)
  if (req.query.student) filter.student = req.query.student
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    filter.student = { $in: (await Student.find({ $or: [{ name: rx }, { admissionNo: rx }, { guardianPhone: rx }] }, '_id').lean()).map((s) => s._id) }
  }
  const today = ymd()
  const list = await FeeInstallment.find(filter).populate({ path: 'student', select: 'name admissionNo guardianName guardianPhone status' }).populate('batch', 'name type').sort({ dueDate: 1 }).lean()
  const wanted = req.query.status
  res.json(list
    .map((i) => ({ ...i, ...installmentStatus(i, today) }))
    .filter((i) => !wanted || (wanted === 'unpaid' ? i.status !== 'paid' : i.status === wanted))
    .slice(0, 1000))
}))

router.get('/fees/summary', accounts, asyncHandler(async (req, res) => {
  const today = ymd()
  const list = await FeeInstallment.find(await batchFilter(req)).populate('batch', 'name type').lean()
  const byBatch = {}
  const totals = { billed: 0, collected: 0, outstanding: 0, overdue: 0 }
  for (const i of list) {
    const s = installmentStatus(i, today)
    const key = i.batch?.name || 'Other'
    const b = (byBatch[key] ||= { batch: key, type: i.batch?.type, billed: 0, collected: 0, outstanding: 0, overdue: 0 })
    for (const target of [b, totals]) {
      target.billed += i.amount - (i.discount || 0)
      target.collected += i.paid || 0
      target.outstanding += s.balance
      if (s.status === 'overdue') target.overdue += s.balance
    }
  }
  const todayCollection = await Payment.aggregate([{ $match: { paidOn: today, ...(await studentFilter(req)) } }, { $group: { _id: '$mode', total: { $sum: '$amount' }, n: { $sum: 1 } } }])
  res.json({ totals, byBatch: Object.values(byBatch), today: todayCollection })
}))

router.post('/fees/installments', accounts, asyncHandler(async (req, res) => {
  const data = pick(req.body, ['student', 'title', 'amount', 'dueDate', 'discount'])
  const student = await Student.findById(data.student).lean()
  if (!student) throw httpError(422, 'Choose a student.')
  await assertBatch(req, student.batch)
  res.status(201).json(await FeeInstallment.create({ ...data, batch: student.batch }))
}))

router.put('/fees/installments/:id', accounts, asyncHandler(async (req, res) => {
  const inst = await FeeInstallment.findOne({ _id: req.params.id, ...(await batchFilter(req)) })
  if (!inst) throw httpError(404, 'Installment not found.')
  Object.assign(inst, pick(req.body, ['title', 'amount', 'dueDate', 'discount']))
  if (inst.paid > inst.amount - (inst.discount || 0)) throw httpError(422, 'Amount minus discount cannot be less than what is already paid.')
  await inst.save()
  res.json(inst)
}))

router.delete('/fees/installments/:id', accounts, asyncHandler(async (req, res) => {
  const inst = await FeeInstallment.findOne({ _id: req.params.id, ...(await batchFilter(req)) })
  if (!inst) throw httpError(404, 'Installment not found.')
  if (inst.paid > 0) throw httpError(422, 'This installment has payments and cannot be deleted.')
  await inst.deleteOne()
  res.json({ ok: true })
}))

// (Re)create the standard installment plan from the batch fee.
router.post('/fees/plan/:student', accounts, asyncHandler(async (req, res) => {
  await assertStudent(req, req.params.student)
  const student = await Student.findById(req.params.student)
  if (!student) throw httpError(404, 'Student not found.')
  const created = await createFeePlan(student, { startDate: req.body.startDate || ymd(), replace: true })
  res.json({ created: created.length })
}))

router.get('/fees/payments', accounts, asyncHandler(async (req, res) => {
  const filter = await studentFilter(req)
  if (req.query.student) {
    await assertStudent(req, req.query.student)
    filter.student = req.query.student
  }
  if (req.query.from || req.query.to) filter.paidOn = { ...(req.query.from && { $gte: req.query.from }), ...(req.query.to && { $lte: req.query.to }) }
  res.json(await Payment.find(filter).populate({ path: 'student', select: 'name admissionNo batch', populate: { path: 'batch', select: 'name' } }).populate('installment', 'title').populate('collectedBy', 'name').sort({ paidOn: -1, createdAt: -1 }).limit(500).lean())
}))

router.post('/fees/payments', accounts, asyncHandler(async (req, res) => {
  const { student, installment, amount, mode, paidOn, reference, note } = req.body
  if (!(Number(amount) > 0)) throw httpError(422, 'Enter an amount.')
  await assertStudent(req, student)
  const payment = await recordPayment({ student, installment: installment || undefined, amount: Number(amount), mode, paidOn, reference, note, collectedBy: req.user.id })
  res.status(201).json(payment)
}))

router.get('/fees/receipt/:id', staffOnly, asyncHandler(async (req, res) => {
  const data = await receipt(req.params.id)
  if (!batchInScope(await scopeOf(req), data.payment.student?.batch)) throw httpError(404, 'Receipt not found.')
  res.json(data)
}))

export async function receipt(id) {
  const payment = await Payment.findById(id).populate({ path: 'student', populate: { path: 'batch', select: 'name type program' } }).populate('installment', 'title').populate('collectedBy', 'name').lean()
  if (!payment) throw httpError(404, 'Receipt not found.')
  const installments = await FeeInstallment.find({ student: payment.student._id }).lean()
  const balance = installments.reduce((s, i) => s + installmentStatus(i).balance, 0)
  return { payment, balance, institute: await getSettings() }
}

/* ── Admission enquiries (CRM) ── */

// An enquiry belongs to the wing in its `type` field.
async function scopedLead(req, id = req.params.id) {
  const lead = await Lead.findOne({ _id: id, ...(await wingFilter(req, 'type')) })
  if (!lead) throw httpError(404, 'Lead not found.')
  return lead
}

router.get('/leads', counsellor, asyncHandler(async (req, res) => {
  const filter = await wingFilter(req, 'type')
  if (req.query.type) {
    await assertWing(req, String(req.query.type))
    filter.type = String(req.query.type)
  }
  if (req.query.status) filter.status = req.query.status
  if (req.query.due === '1') Object.assign(filter, { status: { $nin: ['converted', 'lost'] }, nextFollowUp: { $lte: ymd() } })
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    filter.$or = [{ name: rx }, { phone: rx }, { course: rx }]
  }
  const leads = await Lead.find(filter).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(1000).lean()
  res.json(leads.map((l) => ({ ...l, score: scoreLead(l) })))
}))

const LEAD_FIELDS = ['name', 'phone', 'email', 'course', 'type', 'source', 'status', 'nextFollowUp', 'assignedTo', 'notes']
const clean = (data) => {
  for (const key of Object.keys(data)) if (data[key] === '') data[key] = null
  return data
}

router.post('/leads', counsellor, asyncHandler(async (req, res) => {
  const data = clean(pick(req.body, LEAD_FIELDS))
  const scope = await scopeOf(req)
  if (!data.type && !scope.all) data.type = scope.wings[0]
  if (data.type) await assertWing(req, data.type)
  const lead = await Lead.create(data)
  res.status(201).json({ ...lead.toObject(), score: scoreLead(lead) })
}))

router.put('/leads/:id', counsellor, asyncHandler(async (req, res) => {
  const data = clean(pick(req.body, LEAD_FIELDS))
  if (data.status && !LEAD_STATUSES.includes(data.status)) throw httpError(422, 'Unknown status.')
  await scopedLead(req)
  if (data.type) await assertWing(req, data.type)
  const lead = await Lead.findByIdAndUpdate(req.params.id, data, { returnDocument: 'after', runValidators: true })
  if (!lead) throw httpError(404, 'Lead not found.')
  res.json({ ...lead.toObject(), score: scoreLead(lead) })
}))

router.delete('/leads/:id', counsellor, asyncHandler(async (req, res) => {
  await (await scopedLead(req)).deleteOne()
  res.json({ ok: true })
}))

router.post('/leads/:id/followups', counsellor, asyncHandler(async (req, res) => {
  const lead = await scopedLead(req)
  if (!req.body.note) throw httpError(422, 'Write what happened.')
  lead.followUps.push({ note: req.body.note, by: req.user.name })
  if (req.body.nextFollowUp !== undefined) lead.nextFollowUp = req.body.nextFollowUp || undefined
  if (req.body.status && LEAD_STATUSES.includes(req.body.status)) lead.status = req.body.status
  else if (lead.status === 'new') lead.status = 'contacted'
  await lead.save()
  res.json({ ...lead.toObject(), score: scoreLead(lead) })
}))

// Turns an enquiry into an admission (student + fee plan + portal login).
router.post('/leads/:id/convert', counsellor, asyncHandler(async (req, res) => {
  const lead = await scopedLead(req)
  if (lead.convertedStudent) throw httpError(409, 'This enquiry is already admitted.')
  const batch = await Batch.findById(req.body.batch).lean()
  if (!batch) throw httpError(422, 'Choose the batch to admit into.')
  await assertBatch(req, batch._id)
  const student = await Student.create({
    admissionNo: await nextAdmissionNo(batch.type), name: lead.name, phone: lead.phone, email: lead.email,
    guardianName: req.body.guardianName, guardianPhone: req.body.guardianPhone || lead.phone,
    batch: batch._id, rollNo: (await Student.countDocuments({ batch: batch._id })) + 1, admissionDate: ymd(),
  })
  await createFeePlan(student, { startDate: ymd() })
  await createStudentLogin(student)
  lead.status = 'converted'
  lead.convertedStudent = student._id
  lead.followUps.push({ note: `Admitted to ${batch.name} (${student.admissionNo})`, by: req.user.name })
  await lead.save()
  res.json({ student, lead })
}))

router.post('/leads/:id/ai-message', counsellor, asyncHandler(async (req, res) => {
  const lead = (await scopedLead(req)).toObject()
  const settings = await getSettings()
  res.json(await leadMessage(lead, settings.instituteName, req.body.language))
}))

/* ── Automation & outbox ── */

router.get('/automation/rules', staffOnly, asyncHandler(async (req, res) => {
  res.json(await AutomationRule.find().sort({ hour: 1 }).lean())
}))

router.put('/automation/rules/:key', superOnly, asyncHandler(async (req, res) => {
  const update = pick(req.body, ['enabled', 'hour', 'config'])
  const rule = await AutomationRule.findOneAndUpdate({ key: req.params.key }, update, { returnDocument: 'after' })
  if (!rule) throw httpError(404, 'Rule not found.')
  res.json(rule)
}))

router.post('/automation/rules/:key/run', allow('accountant', 'counsellor', 'teacher'), asyncHandler(async (req, res) => {
  res.json(await runRule(req.params.key, 'manual'))
}))

router.post('/automation/run-all', superOnly, asyncHandler(async (req, res) => {
  const rules = await AutomationRule.find({ enabled: true }).lean()
  const results = []
  for (const rule of rules) results.push(await runRule(rule.key, 'manual'))
  res.json(results)
}))

router.get('/automation/logs', staffOnly, asyncHandler(async (req, res) => {
  res.json(await AutomationLog.find().sort({ createdAt: -1 }).limit(100).lean())
}))

router.get('/outbox', staffOnly, asyncHandler(async (req, res) => {
  const scoped = await wingFilter(req, 'wing')
  const filter = { ...scoped }
  if (req.query.status) filter.status = req.query.status
  if (req.query.channel) filter.channel = req.query.channel
  if (req.query.rule) filter.ruleKey = req.query.rule
  const [items, counts] = await Promise.all([
    Outbox.find(filter).sort({ createdAt: -1 }).limit(500).lean(),
    Outbox.aggregate([{ $match: scoped }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ])
  res.json({ items, counts: Object.fromEntries(counts.map((c) => [c._id, c.n])) })
}))

router.put('/outbox/:id', staffOnly, asyncHandler(async (req, res) => {
  const status = req.body.status
  if (!['pending', 'sent', 'skipped'].includes(status)) throw httpError(422, 'Unknown status.')
  const message = await Outbox.findOneAndUpdate({ _id: req.params.id, ...(await wingFilter(req, 'wing')) }, { status, sentAt: status === 'sent' ? new Date() : null }, { returnDocument: 'after' })
  if (!message) throw httpError(404, 'Message not found.')
  res.json(message)
}))

router.post('/outbox/bulk', staffOnly, asyncHandler(async (req, res) => {
  const { ids = [], status } = req.body
  if (!['sent', 'skipped', 'pending'].includes(status)) throw httpError(422, 'Unknown status.')
  const result = await Outbox.updateMany({ _id: { $in: ids }, ...(await wingFilter(req, 'wing')) }, { status, sentAt: status === 'sent' ? new Date() : null })
  res.json({ updated: result.modifiedCount })
}))

router.delete('/outbox', superOnly, asyncHandler(async (req, res) => {
  const result = await Outbox.deleteMany({ status: { $in: ['sent', 'skipped'] } })
  res.json({ deleted: result.deletedCount })
}))

/* ── AI ── */

router.get('/ai/status', staffOnly, (req, res) => res.json({ enabled: aiEnabled, provider: aiProvider }))

router.post('/ai/chat', staffOnly, asyncHandler(async (req, res) => {
  const reply = await assistantChat(Array.isArray(req.body.messages) ? req.body.messages : [], req.user, await scopeOf(req))
  res.json({ reply })
}))

router.post('/ai/risk-plan/:student', staffOnly, asyncHandler(async (req, res) => {
  await assertStudent(req, req.params.student)
  const list = await atRiskStudents({ limit: 500, minScore: 0, scope: await scopeOf(req) })
  const entry = list.find((r) => String(r.student._id) === req.params.student)
  if (!entry) throw httpError(404, 'Student not found.')
  res.json({ plan: await riskActionPlan({ ...entry, student: { name: entry.student.name, batch: entry.student.batch?.name } }) })
}))

export default router
