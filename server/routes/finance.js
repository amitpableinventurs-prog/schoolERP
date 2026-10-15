// Finance: a ledger of income and expenses other than fees and salaries
// (rent, electricity, donations…), and an overview that puts fee collection,
// transport fees, other income, salaries and expenses side by side.
import { Router } from 'express'
import { allow } from '../auth.js'
import { FeeInstallment, FinanceEntry, Payment, Payslip, SalaryAdvance, TransportInvoice } from '../models.js'
import { asyncHandler, escapeRegex, httpError, pick, ymd } from '../util.js'
import { assertWing, scopeOf, studentFilter, wingFilter, wingsListFilter } from '../scope.js'

const router = Router()
const finance = allow('accountant')

export const EXPENSE_CATEGORIES = ['Rent', 'Electricity', 'Water', 'Internet & Phone', 'Repairs & Maintenance', 'Stationery & Printing', 'Lab & Library', 'Events & Functions', 'Fuel', 'Vehicle Maintenance', 'Marketing', 'Housekeeping', 'Security', 'Taxes & Fees', 'Bank Charges', 'Furniture & Equipment', 'Miscellaneous']
export const INCOME_CATEGORIES = ['Donation', 'Grant', 'Admission Form Sale', 'Books & Uniform Sale', 'Canteen', 'Hall / Ground Rent', 'Interest', 'Scrap Sale', 'Miscellaneous']
const MODES = ['cash', 'upi', 'card', 'bank', 'cheque']
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '')

async function scopedEntry(req, id) {
  const entry = await FinanceEntry.findOne({ _id: id, ...(await wingFilter(req, 'wing')) })
  if (!entry) throw httpError(404, 'Entry not found.')
  return entry
}

// Scoped users must tag an entry with one of their wings; others may leave it institute-wide.
async function wingFor(req, wing) {
  const scope = await scopeOf(req)
  if (!wing) {
    if (scope.all) return null
    if (scope.wings.length === 1) return scope.wings[0]
    throw httpError(422, 'Choose the wing this entry belongs to.')
  }
  await assertWing(req, wing)
  return wing
}

/* ── Ledger ── */

router.get('/finance/categories', finance, asyncHandler(async (req, res) => {
  const used = await FinanceEntry.aggregate([{ $group: { _id: { type: '$type', category: '$category' } } }])
  const extra = (type) => used.filter((u) => u._id.type === type).map((u) => u._id.category)
  res.json({
    expense: [...new Set([...EXPENSE_CATEGORIES, ...extra('expense')])],
    income: [...new Set([...INCOME_CATEGORIES, ...extra('income')])],
  })
}))

router.get('/finance/entries', finance, asyncHandler(async (req, res) => {
  const filter = { ...(await wingFilter(req, 'wing')) }
  if (req.query.type) filter.type = String(req.query.type)
  if (req.query.category) filter.category = String(req.query.category)
  if (req.query.wing) filter.wing = String(req.query.wing) === 'none' ? null : String(req.query.wing)
  if (isDate(req.query.from) || isDate(req.query.to)) {
    filter.date = {}
    if (isDate(req.query.from)) filter.date.$gte = req.query.from
    if (isDate(req.query.to)) filter.date.$lte = req.query.to
  }
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    filter.$or = [{ party: rx }, { reference: rx }, { note: rx }, { voucherNo: rx }, { category: rx }]
  }
  res.json(await FinanceEntry.find(filter).sort({ date: -1, createdAt: -1 }).limit(2000).lean())
}))

const ENTRY_FIELDS = ['type', 'category', 'amount', 'date', 'mode', 'party', 'reference', 'note']

function cleanEntry(body) {
  const data = pick(body, ENTRY_FIELDS)
  if (data.type !== undefined && !['income', 'expense'].includes(data.type)) throw httpError(422, 'Type must be income or expense.')
  if (data.amount !== undefined) {
    data.amount = Math.round((Number(data.amount) || 0) * 100) / 100
    if (!(data.amount > 0)) throw httpError(422, 'Enter an amount.')
  }
  if (data.date !== undefined && !isDate(data.date)) throw httpError(422, 'Enter a valid date.')
  if (data.mode !== undefined && !MODES.includes(data.mode)) throw httpError(422, 'Unknown payment mode.')
  if (data.category !== undefined) data.category = String(data.category).trim()
  return data
}

router.post('/finance/entries', finance, asyncHandler(async (req, res) => {
  const data = cleanEntry({ date: ymd(), ...req.body })
  if (!data.type || !data.category || !data.amount) throw httpError(422, 'Type, category and amount are required.')
  data.wing = await wingFor(req, req.body.wing)
  data.createdBy = req.user.id
  data.createdByName = req.user.name
  const prefix = `${data.type === 'income' ? 'INC' : 'EXP'}-${data.date.slice(0, 4)}-`
  let seq = await FinanceEntry.countDocuments({ voucherNo: new RegExp(`^${prefix}`) })
  for (let attempt = 0; ; attempt++) {
    seq++
    try {
      const entry = await FinanceEntry.create({ ...data, voucherNo: `${prefix}${String(seq).padStart(5, '0')}` })
      return res.status(201).json(entry)
    } catch (error) {
      if (error.code !== 11000 || !error.keyPattern?.voucherNo || attempt >= 5) throw error
    }
  }
}))

router.put('/finance/entries/:id', finance, asyncHandler(async (req, res) => {
  const entry = await scopedEntry(req, req.params.id)
  const data = cleanEntry(req.body)
  if (!data.category && data.category !== undefined) throw httpError(422, 'Category is required.')
  if (req.body.wing !== undefined) data.wing = await wingFor(req, req.body.wing)
  Object.assign(entry, data)
  await entry.save()
  res.json(entry)
}))

router.delete('/finance/entries/:id', finance, asyncHandler(async (req, res) => {
  const entry = await scopedEntry(req, req.params.id)
  await entry.deleteOne()
  res.json({ ok: true })
}))

/* ── Overview ── */

const monthsBetween = (from, to) => {
  const out = []
  let [y, m] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  while ((y < ty || (y === ty && m <= tm)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

// Sum of `amountExpr` per month (YYYY-MM of `dateField`) for documents matching `match`.
const byMonth = (Model, match, dateField, amountExpr) => Model.aggregate([
  { $match: match },
  { $group: { _id: { $substrBytes: [`$${dateField}`, 0, 7] }, total: { $sum: amountExpr } } },
])

router.get('/finance/summary', finance, asyncHandler(async (req, res) => {
  const to = isDate(req.query.to) ? req.query.to : ymd()
  const from = isDate(req.query.from) ? req.query.from : `${to.slice(0, 7)}-01`
  if (from > to) throw httpError(422, '"From" date must be before "to" date.')
  // The trend always shows at least the last 6 months up to `to`.
  const trendFrom = (() => {
    const d = new Date(`${to.slice(0, 7)}-01T00:00:00`)
    d.setMonth(d.getMonth() - 5)
    const six = ymd(d)
    return from < six ? `${from.slice(0, 7)}-01` : six
  })()
  const months = monthsBetween(trendFrom, to)
  const inRange = (start) => ({ $gte: start, $lte: to })

  const [students, entryScope, staffScope] = await Promise.all([studentFilter(req), wingFilter(req, 'wing'), wingsListFilter(req)])
  const scopedStudents = (field) => (students.student ? { [field]: students.student } : {})

  // Transport invoices keep only the last payment date, so a part-paid invoice is
  // counted in the month of its latest payment.
  const [fees, transport, entries, salaries, advances, dues, transportDues, payable] = await Promise.all([
    byMonth(Payment, { paidOn: inRange(trendFrom), ...scopedStudents('student') }, 'paidOn', '$amount'),
    byMonth(TransportInvoice, { paidOn: inRange(trendFrom), paid: { $gt: 0 }, ...scopedStudents('student') }, 'paidOn', '$paid'),
    FinanceEntry.aggregate([
      { $match: { date: inRange(trendFrom), ...entryScope } },
      { $group: { _id: { type: '$type', category: '$category', month: { $substrBytes: ['$date', 0, 7] } }, total: { $sum: '$amount' } } },
    ]),
    byMonth(Payslip, { status: 'paid', paidOn: inRange(trendFrom), ...staffScope }, 'paidOn', '$net'),
    byMonth(SalaryAdvance, { givenOn: inRange(trendFrom), ...staffScope }, 'givenOn', '$amount'),
    FeeInstallment.aggregate([
      { $match: scopedStudents('student') },
      { $group: { _id: null, total: { $sum: { $max: [0, { $subtract: ['$amount', { $add: [{ $ifNull: ['$discount', 0] }, { $ifNull: ['$paid', 0] }] }] }] } } } },
    ]),
    TransportInvoice.aggregate([
      { $match: { status: { $ne: 'waived' }, ...scopedStudents('student') } },
      { $group: { _id: null, total: { $sum: { $max: [0, { $subtract: ['$amount', { $add: [{ $ifNull: ['$discount', 0] }, { $ifNull: ['$paid', 0] }] }] }] } } } },
    ]),
    Payslip.aggregate([
      { $match: { status: 'approved', ...staffScope } },
      { $group: { _id: null, total: { $sum: '$net' }, n: { $sum: 1 } } },
    ]),
  ])

  const map = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.total]))
  const series = { fees: map(fees), transport: map(transport), salaries: map(salaries), advances: map(advances) }
  const otherIncome = {}
  const otherExpense = {}
  for (const e of entries) {
    const bucket = e._id.type === 'income' ? otherIncome : otherExpense
    bucket[e._id.month] = (bucket[e._id.month] || 0) + e.total
  }

  const trend = months.map((m) => {
    const income = (series.fees[m] || 0) + (series.transport[m] || 0) + (otherIncome[m] || 0)
    const expense = (series.salaries[m] || 0) + (series.advances[m] || 0) + (otherExpense[m] || 0)
    return { month: m, income, expense, net: income - expense }
  })

  // Range totals use exact dates (the trend works in whole months).
  const rangeSum = async (Model, match, field) => (await Model.aggregate([{ $match: match }, { $group: { _id: null, t: { $sum: `$${field}` } } }]))[0]?.t || 0
  const [feeTotal, transportTotal, salaryTotal, advanceTotal, categoryRows] = await Promise.all([
    rangeSum(Payment, { paidOn: inRange(from), ...scopedStudents('student') }, 'amount'),
    rangeSum(TransportInvoice, { paidOn: inRange(from), paid: { $gt: 0 }, ...scopedStudents('student') }, 'paid'),
    rangeSum(Payslip, { status: 'paid', paidOn: inRange(from), ...staffScope }, 'net'),
    rangeSum(SalaryAdvance, { givenOn: inRange(from), ...staffScope }, 'amount'),
    FinanceEntry.aggregate([
      { $match: { date: inRange(from), ...entryScope } },
      { $group: { _id: { type: '$type', category: '$category' }, total: { $sum: '$amount' }, n: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
  ])

  const cat = (type) => categoryRows.filter((r) => r._id.type === type).map((r) => ({ category: r._id.category, total: r.total, entries: r.n }))
  const incomeCats = cat('income')
  const expenseCats = cat('expense')
  const otherIncomeTotal = incomeCats.reduce((s, r) => s + r.total, 0)
  const otherExpenseTotal = expenseCats.reduce((s, r) => s + r.total, 0)
  const income = feeTotal + transportTotal + otherIncomeTotal
  const expense = salaryTotal + advanceTotal + otherExpenseTotal

  res.json({
    from,
    to,
    income: { total: income, fees: feeTotal, transport: transportTotal, other: otherIncomeTotal, categories: incomeCats },
    expense: { total: expense, salaries: salaryTotal, advances: advanceTotal, other: otherExpenseTotal, categories: expenseCats },
    net: income - expense,
    receivable: { fees: dues[0]?.total || 0, transport: transportDues[0]?.total || 0 },
    payable: { salaries: payable[0]?.total || 0, payslips: payable[0]?.n || 0 },
    trend,
  })
}))

export default router
