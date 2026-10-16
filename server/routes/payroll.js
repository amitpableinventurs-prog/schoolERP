// Payroll: salary structures per staff member, monthly payslips (draft → approved
// → paid), salary advances / loans recovered through payslips, and each staff
// member's own payslips. Wing-scoped through the staff member's wings.
import { Router } from 'express'
import { allow } from '../auth.js'
import { Payslip, SalaryAdvance, SalaryStructure, Staff, User } from '../models.js'
import { getSettings } from '../insights.js'
import { asyncHandler, escapeRegex, httpError, pick, ymd } from '../util.js'
import { wingsListFilter } from '../scope.js'

const router = Router()
const payroll = allow('accountant')

const PAY_MODES = ['bank', 'cash', 'cheque', 'upi']
const round = (n) => Math.round(Number(n) || 0)
const sum = (lines) => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
const validMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '')
const thisMonth = () => ymd().slice(0, 7)
const daysInMonth = (month) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/* ── Calculation ── */

const amountOf = (c, basic) => (c.calc === 'percent' ? (basic * (Number(c.value) || 0)) / 100 : Number(c.value) || 0)

// Staff without a saved structure are paid their Staff.salary as a single basic.
function structureFor(staff, saved) {
  const s = saved || { basic: staff.salary || 0 }
  return {
    basic: Number(s.basic) || 0,
    earnings: (s.earnings || []).map((c) => ({ name: c.name, calc: c.calc, value: Number(c.value) || 0 })),
    deductions: (s.deductions || []).map((c) => ({ name: c.name, calc: c.calc, value: Number(c.value) || 0 })),
    pf: !!s.pf,
    pfCap: Number(s.pfCap) || 15000,
    esi: !!s.esi,
    professionalTax: Number(s.professionalTax) || 0,
    tds: Number(s.tds) || 0,
  }
}

const cleanLines = (lines) => (Array.isArray(lines) ? lines : [])
  .map((l) => ({ name: String(l?.name || '').trim(), amount: round(l?.amount) }))
  .filter((l) => l.name && l.amount > 0)

// Earnings are prorated by paid days; PF/ESI follow the earned amounts; fixed
// deductions, PT and TDS are not prorated. Advance recovery is clipped so the
// net pay never goes below zero.
export function computeSlip({ structure, workingDays, paidDays, additions = [], extraDeductions = [], advanceRecovery = [] }) {
  const ratio = workingDays > 0 ? Math.min(1, Math.max(0, paidDays / workingDays)) : 0
  const basic = round(structure.basic * ratio)
  const earnings = [
    { name: 'Basic', amount: basic },
    ...structure.earnings.map((c) => ({ name: c.name, amount: round(amountOf(c, structure.basic) * ratio) })).filter((e) => e.amount > 0),
  ]
  const adds = cleanLines(additions)
  const gross = sum(earnings) + sum(adds)

  const deductions = []
  if (structure.pf && basic > 0) deductions.push({ name: 'Provident Fund (PF)', amount: round(Math.min(basic, structure.pfCap) * 0.12) })
  if (structure.esi && gross > 0 && gross <= 21000) deductions.push({ name: 'ESI', amount: Math.ceil(gross * 0.0075) })
  if (structure.professionalTax && gross > 0) deductions.push({ name: 'Professional Tax', amount: round(structure.professionalTax) })
  if (structure.tds && gross > 0) deductions.push({ name: 'TDS (Income tax)', amount: round(structure.tds) })
  for (const c of structure.deductions) {
    const amount = round(amountOf(c, structure.basic))
    if (amount > 0) deductions.push({ name: c.name, amount })
  }
  const extras = cleanLines(extraDeductions)
  let room = Math.max(0, gross - sum(deductions) - sum(extras))
  const recovery = []
  for (const r of advanceRecovery) {
    const amount = Math.min(round(r.amount), room)
    if (amount > 0) recovery.push({ advance: r.advance, amount })
    room -= amount
  }
  const totalDeductions = sum(deductions) + sum(extras) + sum(recovery)
  return {
    earnings,
    additions: adds,
    deductions,
    extraDeductions: extras,
    advanceRecovery: recovery,
    gross,
    totalDeductions,
    net: Math.max(0, gross - totalDeductions),
  }
}

// Full-month figures for the structures list.
const monthlyFigures = (structure) => {
  const r = computeSlip({ structure, workingDays: 30, paidDays: 30 })
  return { gross: r.gross, deductions: r.totalDeductions, net: r.net }
}

async function scopedStaff(req, id) {
  const staff = await Staff.findOne({ _id: id, ...(await wingsListFilter(req)) }).lean()
  if (!staff) throw httpError(404, 'Staff member not found in your wing.')
  return staff
}

async function scopedSlip(req, id) {
  const slip = await Payslip.findOne({ _id: id, ...(await wingsListFilter(req)) })
  if (!slip) throw httpError(404, 'Payslip not found.')
  return slip
}

// Open advances of a staff member → this month's recovery lines.
async function recoveryFor(staffId) {
  const open = await SalaryAdvance.find({ staff: staffId, status: 'open' }).sort({ givenOn: 1 }).lean()
  return open
    .map((a) => ({ advance: a._id, amount: Math.min(a.monthlyDeduction, a.amount - (a.recovered || 0)) }))
    .filter((r) => r.amount > 0)
}

/* ── Salary structures ── */

router.get('/payroll/structures', payroll, asyncHandler(async (req, res) => {
  const filter = { ...(await wingsListFilter(req)) }
  if (req.query.status !== 'all') filter.status = 'active'
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    filter.$or = [{ name: rx }, { designation: rx }, { department: rx }]
  }
  const staff = await Staff.find(filter).sort({ name: 1 }).lean()
  const saved = await SalaryStructure.find({ staff: { $in: staff.map((s) => s._id) } }).lean()
  const byStaff = Object.fromEntries(saved.map((s) => [String(s.staff), s]))
  res.json(staff.map((s) => {
    const structure = byStaff[String(s._id)] || null
    return { staff: s, structure, configured: !!structure, ...monthlyFigures(structureFor(s, structure)) }
  }))
}))

const STRUCTURE_FIELDS = ['basic', 'pf', 'pfCap', 'esi', 'professionalTax', 'tds', 'paymentMode', 'bankName', 'accountNo', 'ifsc', 'pan', 'uan', 'notes']
const cleanComponents = (list) => (Array.isArray(list) ? list : [])
  .map((c) => ({ name: String(c?.name || '').trim(), calc: c?.calc === 'percent' ? 'percent' : 'fixed', value: Math.max(0, Number(c?.value) || 0) }))
  .filter((c) => c.name)

router.put('/payroll/structures/:staffId', payroll, asyncHandler(async (req, res) => {
  const staff = await scopedStaff(req, req.params.staffId)
  const data = pick(req.body, STRUCTURE_FIELDS)
  for (const k of ['basic', 'pfCap', 'professionalTax', 'tds']) if (data[k] !== undefined) data[k] = Math.max(0, Number(data[k]) || 0)
  if (data.paymentMode && !PAY_MODES.includes(data.paymentMode)) throw httpError(422, 'Unknown payment mode.')
  if (req.body.earnings !== undefined) data.earnings = cleanComponents(req.body.earnings)
  if (req.body.deductions !== undefined) data.deductions = cleanComponents(req.body.deductions)
  const structure = await SalaryStructure.findOneAndUpdate({ staff: staff._id }, { $set: data }, { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true })
  // Keep the directory's "monthly salary" in step with the structure's gross.
  const { gross } = monthlyFigures(structureFor(staff, structure.toObject()))
  await Staff.updateOne({ _id: staff._id }, { $set: { salary: gross } })
  res.json(structure)
}))

/* ── Payslips ── */

router.get('/payroll/payslips', payroll, asyncHandler(async (req, res) => {
  const filter = { ...(await wingsListFilter(req)) }
  if (req.query.month) filter.month = String(req.query.month)
  if (req.query.staff) filter.staff = String(req.query.staff)
  if (req.query.status) filter.status = String(req.query.status)
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    filter.$or = [{ staffName: rx }, { designation: rx }, { department: rx }, { slipNo: rx }]
  }
  const list = await Payslip.find(filter).sort({ month: -1, staffName: 1 }).limit(2000).lean()
  // Bank details for the bank-transfer sheet.
  const banks = await SalaryStructure.find({ staff: { $in: list.map((p) => p.staff) } }, 'staff paymentMode bankName accountNo ifsc').lean()
  const byStaff = Object.fromEntries(banks.map((b) => [String(b.staff), b]))
  res.json(list.map((p) => ({ ...p, bank: byStaff[String(p.staff)] || null })))
}))

router.get('/payroll/summary', payroll, asyncHandler(async (req, res) => {
  const month = validMonth(req.query.month) ? req.query.month : thisMonth()
  const scope = await wingsListFilter(req)
  const [slips, activeStaff, advances] = await Promise.all([
    Payslip.find({ month, ...scope }, 'staff status gross totalDeductions net').lean(),
    Staff.countDocuments({ status: 'active', ...scope }),
    SalaryAdvance.find({ status: 'open', ...scope }, 'amount recovered').lean(),
  ])
  const by = (status) => slips.filter((s) => s.status === status)
  res.json({
    month,
    workingDays: daysInMonth(month),
    activeStaff,
    slips: slips.length,
    missing: Math.max(0, activeStaff - slips.length),
    gross: sum(slips.map((s) => ({ amount: s.gross }))),
    deductions: sum(slips.map((s) => ({ amount: s.totalDeductions }))),
    net: sum(slips.map((s) => ({ amount: s.net }))),
    draft: by('draft').length,
    approved: by('approved').length,
    paid: by('paid').length,
    paidAmount: sum(by('paid').map((s) => ({ amount: s.net }))),
    payable: sum(by('approved').map((s) => ({ amount: s.net }))) + sum(by('draft').map((s) => ({ amount: s.net }))),
    advancesOutstanding: advances.reduce((t, a) => t + a.amount - (a.recovered || 0), 0),
  })
}))

// Creates a draft payslip for every active staff member in scope who has none for
// the month. With refreshDrafts, existing drafts are recalculated from the current
// structure (their paid days and one-off lines are kept).
router.post('/payroll/generate', payroll, asyncHandler(async (req, res) => {
  const month = String(req.body.month || thisMonth())
  if (!validMonth(month)) throw httpError(422, 'Month must be YYYY-MM.')
  const calendarDays = daysInMonth(month)
  const workingDays = Math.min(31, Math.max(1, Number(req.body.workingDays) || calendarDays))
  const filter = { status: 'active', ...(await wingsListFilter(req)) }
  if (Array.isArray(req.body.staff) && req.body.staff.length) filter._id = { $in: req.body.staff }
  const staffList = await Staff.find(filter).lean()
  const saved = await SalaryStructure.find({ staff: { $in: staffList.map((s) => s._id) } }).lean()
  const byStaff = Object.fromEntries(saved.map((s) => [String(s.staff), s]))
  const existing = await Payslip.find({ month, staff: { $in: staffList.map((s) => s._id) } })
  const slipOf = Object.fromEntries(existing.map((p) => [String(p.staff), p]))
  let seq = await Payslip.countDocuments({ month })

  let created = 0
  let refreshed = 0
  let skipped = 0
  for (const staff of staffList) {
    // Not yet joined this month → no payslip; joined mid-month → paid from the joining day.
    if (staff.joiningDate && staff.joiningDate.slice(0, 7) > month) { skipped++; continue }
    const structure = structureFor(staff, byStaff[String(staff._id)])
    const old = slipOf[String(staff._id)]
    if (old) {
      if (old.status !== 'draft' || !req.body.refreshDrafts) { skipped++; continue }
      const calc = computeSlip({ structure, workingDays: old.workingDays, paidDays: old.paidDays, additions: old.additions, extraDeductions: old.extraDeductions, advanceRecovery: await recoveryFor(staff._id) })
      Object.assign(old, calc, { structure, staffName: staff.name, designation: staff.designation, department: staff.department, wings: staff.wings || [] })
      await old.save()
      refreshed++
      continue
    }
    let paidDays = workingDays
    if (staff.joiningDate?.slice(0, 7) === month) paidDays = Math.max(0, workingDays - (Number(staff.joiningDate.slice(8, 10)) - 1))
    const calc = computeSlip({ structure, workingDays, paidDays, advanceRecovery: await recoveryFor(staff._id) })
    if (!calc.gross) { skipped++; continue }
    for (let attempt = 0; ; attempt++) {
      seq++
      try {
        await Payslip.create({
          staff: staff._id,
          month,
          slipNo: `PS-${month.replace('-', '')}-${String(seq).padStart(4, '0')}`,
          wings: staff.wings || [],
          staffName: staff.name,
          designation: staff.designation,
          department: staff.department,
          structure,
          workingDays,
          paidDays,
          ...calc,
        })
        created++
        break
      } catch (error) {
        // Another run took this slip number; try the next one.
        if (error.code !== 11000 || !error.keyPattern?.slipNo || attempt >= 5) throw error
      }
    }
  }
  res.json({ month, workingDays, created, refreshed, skipped, staff: staffList.length })
}))

router.get('/payroll/payslips/:id', payroll, asyncHandler(async (req, res) => {
  const slip = await scopedSlip(req, req.params.id)
  res.json(await slipDocument(slip.toObject()))
}))

async function slipDocument(slip) {
  const [staff, bank, institute] = await Promise.all([
    Staff.findById(slip.staff, 'name designation department phone email joiningDate').lean(),
    SalaryStructure.findOne({ staff: slip.staff }, 'paymentMode bankName accountNo ifsc pan uan').lean(),
    getSettings(),
  ])
  return { payslip: slip, staff, bank, institute }
}

// Edit a draft: paid days, one-off additions / deductions, note.
router.put('/payroll/payslips/:id', payroll, asyncHandler(async (req, res) => {
  const slip = await scopedSlip(req, req.params.id)
  if (slip.status !== 'draft') throw httpError(422, 'Only draft payslips can be edited. Move it back to draft first.')
  const workingDays = req.body.workingDays !== undefined ? Math.min(31, Math.max(1, Number(req.body.workingDays) || 1)) : slip.workingDays
  const paidDays = req.body.paidDays !== undefined ? Number(req.body.paidDays) : slip.paidDays
  if (!(paidDays >= 0 && paidDays <= workingDays)) throw httpError(422, `Paid days must be between 0 and ${workingDays}.`)
  const calc = computeSlip({
    structure: slip.structure,
    workingDays,
    paidDays,
    additions: req.body.additions !== undefined ? req.body.additions : slip.additions,
    extraDeductions: req.body.extraDeductions !== undefined ? req.body.extraDeductions : slip.extraDeductions,
    advanceRecovery: await recoveryFor(slip.staff),
  })
  Object.assign(slip, calc, { workingDays, paidDays })
  if (req.body.note !== undefined) slip.note = req.body.note
  await slip.save()
  res.json(slip)
}))

router.delete('/payroll/payslips/:id', payroll, asyncHandler(async (req, res) => {
  const slip = await scopedSlip(req, req.params.id)
  if (slip.status !== 'draft') throw httpError(422, 'Only draft payslips can be deleted.')
  await slip.deleteOne()
  res.json({ ok: true })
}))

const idsOf = (body) => (Array.isArray(body.ids) ? body.ids.map(String) : [])

router.post('/payroll/approve', payroll, asyncHandler(async (req, res) => {
  const r = await Payslip.updateMany(
    { _id: { $in: idsOf(req.body) }, status: 'draft', ...(await wingsListFilter(req)) },
    { $set: { status: 'approved', approvedBy: req.user.name, approvedAt: new Date() } },
  )
  res.json({ updated: r.modifiedCount })
}))

router.post('/payroll/unapprove', payroll, asyncHandler(async (req, res) => {
  const r = await Payslip.updateMany(
    { _id: { $in: idsOf(req.body) }, status: 'approved', ...(await wingsListFilter(req)) },
    { $set: { status: 'draft' }, $unset: { approvedBy: 1, approvedAt: 1 } },
  )
  res.json({ updated: r.modifiedCount })
}))

// Marks approved payslips paid and books their advance recoveries.
router.post('/payroll/pay', payroll, asyncHandler(async (req, res) => {
  const mode = req.body.mode || 'bank'
  if (!PAY_MODES.includes(mode)) throw httpError(422, 'Unknown payment mode.')
  const paidOn = req.body.paidOn || ymd()
  const slips = await Payslip.find({ _id: { $in: idsOf(req.body) }, status: 'approved', ...(await wingsListFilter(req)) })
  let paid = 0
  let amount = 0
  for (const slip of slips) {
    // Claim the slip first so a double click cannot book the recovery twice.
    const claimed = await Payslip.updateOne(
      { _id: slip._id, status: 'approved' },
      { $set: { status: 'paid', paidOn, mode, reference: req.body.reference || '', paidBy: req.user.id } },
    )
    if (!claimed.modifiedCount) continue
    for (const r of slip.advanceRecovery || []) {
      const advance = await SalaryAdvance.findByIdAndUpdate(r.advance, { $inc: { recovered: r.amount } }, { returnDocument: 'after' })
      if (advance && advance.recovered >= advance.amount && advance.status !== 'closed') {
        advance.status = 'closed'
        await advance.save()
      }
    }
    paid++
    amount += slip.net
  }
  res.json({ paid, amount })
}))

/* ── Advances & loans ── */

router.get('/payroll/advances', payroll, asyncHandler(async (req, res) => {
  const filter = { ...(await wingsListFilter(req)) }
  if (req.query.status) filter.status = String(req.query.status)
  if (req.query.staff) filter.staff = String(req.query.staff)
  const list = await SalaryAdvance.find(filter).populate('staff', 'name designation department').sort({ status: -1, givenOn: -1 }).lean()
  res.json(list.map((a) => ({ ...a, balance: Math.max(0, a.amount - (a.recovered || 0)) })))
}))

router.post('/payroll/advances', payroll, asyncHandler(async (req, res) => {
  const staff = await scopedStaff(req, req.body.staff)
  const amount = round(req.body.amount)
  const monthlyDeduction = round(req.body.monthlyDeduction) || amount
  if (!(amount > 0)) throw httpError(422, 'Enter the amount given.')
  if (monthlyDeduction > amount) throw httpError(422, 'Monthly deduction cannot be more than the amount.')
  if (req.body.mode && !PAY_MODES.includes(req.body.mode)) throw httpError(422, 'Unknown payment mode.')
  const advance = await SalaryAdvance.create({
    staff: staff._id,
    kind: req.body.kind === 'loan' ? 'loan' : 'advance',
    amount,
    monthlyDeduction,
    givenOn: req.body.givenOn || ymd(),
    mode: req.body.mode || 'cash',
    note: req.body.note,
    wings: staff.wings || [],
    createdBy: req.user.id,
  })
  res.status(201).json(advance)
}))

router.put('/payroll/advances/:id', payroll, asyncHandler(async (req, res) => {
  const advance = await SalaryAdvance.findOne({ _id: req.params.id, ...(await wingsListFilter(req)) })
  if (!advance) throw httpError(404, 'Advance not found.')
  if (req.body.monthlyDeduction !== undefined) {
    const m = round(req.body.monthlyDeduction)
    if (!(m > 0)) throw httpError(422, 'Monthly deduction must be more than zero.')
    advance.monthlyDeduction = m
  }
  if (req.body.note !== undefined) advance.note = req.body.note
  // Closing early = written off / settled in cash outside payroll.
  if (req.body.status && ['open', 'closed'].includes(req.body.status)) advance.status = req.body.status
  await advance.save()
  res.json(advance)
}))

router.delete('/payroll/advances/:id', payroll, asyncHandler(async (req, res) => {
  const advance = await SalaryAdvance.findOne({ _id: req.params.id, ...(await wingsListFilter(req)) })
  if (!advance) throw httpError(404, 'Advance not found.')
  if (advance.recovered > 0) throw httpError(422, 'Part of this advance is already recovered. Close it instead.')
  const pending = await Payslip.countDocuments({ 'advanceRecovery.advance': advance._id, status: { $ne: 'paid' } })
  if (pending) throw httpError(422, 'A draft or approved payslip recovers this advance. Recalculate or delete that payslip first.')
  await advance.deleteOne()
  res.json({ ok: true })
}))

/* ── A staff member's own payslips ── */

async function myStaffId(req) {
  const user = await User.findById(req.user.id, 'staff').lean()
  return user?.staff || null
}

router.get('/payroll/my', allow('teacher', 'accountant', 'counsellor'), asyncHandler(async (req, res) => {
  const staff = await myStaffId(req)
  if (!staff) return res.json({ linked: false, payslips: [] })
  const payslips = await Payslip.find({ staff, status: { $in: ['approved', 'paid'] } }, 'month slipNo gross totalDeductions net status paidOn').sort({ month: -1 }).limit(60).lean()
  res.json({ linked: true, payslips })
}))

router.get('/payroll/my/:id', allow('teacher', 'accountant', 'counsellor'), asyncHandler(async (req, res) => {
  const staff = await myStaffId(req)
  const slip = staff && await Payslip.findOne({ _id: req.params.id, staff, status: { $in: ['approved', 'paid'] } }).lean()
  if (!slip) throw httpError(404, 'Payslip not found.')
  res.json(await slipDocument(slip))
}))

export default router
