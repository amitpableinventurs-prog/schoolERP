// Library: book catalogue, issue / return to students and staff, late fines.
import { Router } from 'express'
import mongoose from 'mongoose'
import { allow } from '../auth.js'
import { crudRouter } from '../crud.js'
import { Book, BookIssue, Staff, Student } from '../models.js'
import { getSettings } from '../insights.js'
import { assertStudent, studentFilter } from '../scope.js'
import { addDays, asyncHandler, daysBetween, escapeRegex, httpError, ymd } from '../util.js'

const router = Router()
const librarian = allow('teacher')

const BOOK_FIELDS = ['title', 'author', 'isbn', 'accessionNo', 'publisher', 'category', 'subject', 'language', 'edition', 'shelf', 'copies', 'price', 'notes']

// Late fine of an issue: fixed once returned / lost, running while still out.
export function fineOf(issue, finePerDay, today = ymd()) {
  if (issue.status !== 'issued') return issue.fine || 0
  const late = daysBetween(issue.dueOn, today)
  return late > 0 ? late * finePerDay : 0
}

// Books with how many copies are out and available.
export async function booksWithStock(filter, limit = 500) {
  const books = await Book.find(filter).sort({ title: 1 }).limit(limit).lean()
  const out = await BookIssue.aggregate([
    { $match: { status: 'issued', book: { $in: books.map((b) => b._id) } } },
    { $group: { _id: '$book', n: { $sum: 1 } } },
  ])
  const byBook = Object.fromEntries(out.map((o) => [String(o._id), o.n]))
  return books.map((b) => {
    const issued = byBook[String(b._id)] || 0
    return { ...b, issued, available: Math.max(0, (b.copies || 0) - issued) }
  })
}

export function bookSearch(q) {
  if (!q) return {}
  const rx = new RegExp(escapeRegex(String(q).trim()), 'i')
  return { $or: [{ title: rx }, { author: rx }, { isbn: rx }, { accessionNo: rx }, { subject: rx }, { category: rx }] }
}

const withFine = (finePerDay, today) => (i) => {
  const fine = fineOf(i, finePerDay, today)
  return { ...i, fine, overdue: i.status === 'issued' && i.dueOn < today, lateDays: i.status === 'issued' ? Math.max(0, daysBetween(i.dueOn, today)) : undefined }
}

/* ── Summary ── */

router.get('/library/summary', librarian, asyncHandler(async (req, res) => {
  const today = ymd()
  const scoped = await studentFilter(req)
  const issueScope = scoped.student ? { $or: [{ memberType: 'staff' }, scoped] } : {}
  const [titles, copies, issued, overdue, settings, unpaid] = await Promise.all([
    Book.countDocuments(),
    Book.aggregate([{ $group: { _id: null, n: { $sum: '$copies' } } }]),
    BookIssue.countDocuments({ status: 'issued', ...issueScope }),
    BookIssue.find({ status: 'issued', dueOn: { $lt: today }, ...issueScope }, 'dueOn status').lean(),
    getSettings(),
    BookIssue.aggregate([{ $match: { status: { $ne: 'issued' }, fine: { $gt: 0 }, finePaid: false, ...issueScope } }, { $group: { _id: null, total: { $sum: '$fine' } } }]),
  ])
  res.json({
    titles,
    copies: copies[0]?.n || 0,
    issued,
    overdue: overdue.length,
    runningFines: overdue.reduce((s, i) => s + fineOf(i, settings.libraryFinePerDay, today), 0),
    unpaidFines: unpaid[0]?.total || 0,
    settings: { loanDays: settings.libraryLoanDays, finePerDay: settings.libraryFinePerDay, maxBooks: settings.libraryMaxBooks },
  })
}))

/* ── Books ── */

router.get('/library/books', librarian, asyncHandler(async (req, res) => {
  const filter = bookSearch(req.query.q)
  if (req.query.category) filter.category = String(req.query.category)
  res.json(await booksWithStock(filter))
}))

router.delete('/library/books/:id', librarian, asyncHandler(async (req, res, next) => {
  if (await BookIssue.exists({ book: req.params.id, status: 'issued' })) throw httpError(409, 'Some copies of this book are still issued. Take them back first.')
  if (await BookIssue.exists({ book: req.params.id })) throw httpError(409, 'This book has an issue history. Set its copies to 0 instead of deleting it.')
  next()
}))

router.use('/library/books', crudRouter(Book, {
  fields: BOOK_FIELDS,
  read: librarian,
  write: librarian,
  sort: { title: 1 },
  beforeSave: async (data, req, id) => {
    if (data.copies !== undefined) {
      data.copies = Math.max(0, Math.floor(Number(data.copies) || 0))
      if (id) {
        const out = await BookIssue.countDocuments({ book: id, status: 'issued' })
        if (data.copies < out) throw httpError(422, `${out} copies are issued right now, so copies cannot be less than ${out}.`)
      }
    }
    if (data.price !== undefined && data.price !== null) data.price = Number(data.price) || 0
  },
}))

/* ── Issue / return ── */

router.get('/library/issues', librarian, asyncHandler(async (req, res) => {
  const today = ymd()
  const scoped = await studentFilter(req)
  const conditions = [scoped.student ? { $or: [{ memberType: 'staff' }, scoped] } : {}]
  const status = String(req.query.status || 'issued')
  if (status === 'overdue') conditions.push({ status: 'issued', dueOn: { $lt: today } })
  else if (status === 'unpaid') conditions.push({ status: { $ne: 'issued' }, fine: { $gt: 0 }, finePaid: false })
  else if (['issued', 'returned', 'lost'].includes(status)) conditions.push({ status })
  if (req.query.student && mongoose.isValidObjectId(req.query.student)) conditions.push({ student: req.query.student })
  if (req.query.book && mongoose.isValidObjectId(req.query.book)) conditions.push({ book: req.query.book })
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).trim()), 'i')
    const [books, students, staff] = await Promise.all([
      Book.distinct('_id', { $or: [{ title: rx }, { accessionNo: rx }, { isbn: rx }] }),
      Student.distinct('_id', { $or: [{ name: rx }, { admissionNo: rx }] }),
      Staff.distinct('_id', { name: rx }),
    ])
    conditions.push({ $or: [{ book: { $in: books } }, { student: { $in: students } }, { staff: { $in: staff } }] })
  }
  const settings = await getSettings()
  const list = await BookIssue.find({ $and: conditions })
    .populate('book', 'title author accessionNo shelf price')
    .populate({ path: 'student', select: 'name admissionNo batch guardianPhone', populate: { path: 'batch', select: 'name' } })
    .populate('staff', 'name designation phone')
    .sort(status === 'issued' || status === 'overdue' ? { dueOn: 1 } : { updatedAt: -1 })
    .limit(500).lean()
  res.json(list.map(withFine(settings.libraryFinePerDay, today)))
}))

router.post('/library/issues', librarian, asyncHandler(async (req, res) => {
  const settings = await getSettings()
  const memberType = req.body.memberType === 'staff' ? 'staff' : 'student'
  const book = mongoose.isValidObjectId(req.body.book) && (await Book.findById(req.body.book).lean())
  if (!book) throw httpError(422, 'Choose a book.')
  const member = {}
  if (memberType === 'student') {
    if (!mongoose.isValidObjectId(req.body.student)) throw httpError(422, 'Choose the student.')
    await assertStudent(req, req.body.student)
    const s = await Student.findById(req.body.student, 'status').lean()
    if (s.status !== 'active') throw httpError(409, 'This student is not active.')
    member.student = s._id
  } else {
    const st = mongoose.isValidObjectId(req.body.staff) && (await Staff.findById(req.body.staff, 'status').lean())
    if (!st) throw httpError(422, 'Choose the staff member.')
    member.staff = st._id
  }
  const [out, holding, same] = await Promise.all([
    BookIssue.countDocuments({ book: book._id, status: 'issued' }),
    BookIssue.countDocuments({ ...member, status: 'issued' }),
    BookIssue.exists({ ...member, book: book._id, status: 'issued' }),
  ])
  if (out >= (book.copies || 0)) throw httpError(409, 'No copy of this book is available right now.')
  if (same) throw httpError(409, 'This member already has a copy of this book.')
  if (memberType === 'student' && holding >= settings.libraryMaxBooks) throw httpError(409, `A student can keep at most ${settings.libraryMaxBooks} books at a time. Take one back first.`)
  const issuedOn = /^\d{4}-\d{2}-\d{2}$/.test(req.body.issuedOn || '') ? req.body.issuedOn : ymd()
  const dueOn = /^\d{4}-\d{2}-\d{2}$/.test(req.body.dueOn || '') ? req.body.dueOn : addDays(issuedOn, settings.libraryLoanDays)
  if (dueOn < issuedOn) throw httpError(422, 'The due date cannot be before the issue date.')
  const issue = await BookIssue.create({ book: book._id, memberType, ...member, issuedOn, dueOn, issuedBy: req.user.name, notes: req.body.notes })
  res.status(201).json({ ...issue.toObject(), book })
}))

async function scopedIssue(req) {
  const issue = mongoose.isValidObjectId(req.params.id) && (await BookIssue.findById(req.params.id))
  if (!issue) throw httpError(404, 'Issue record not found.')
  if (issue.student) await assertStudent(req, issue.student)
  return issue
}

router.post('/library/issues/:id/return', librarian, asyncHandler(async (req, res) => {
  const issue = await scopedIssue(req)
  if (issue.status !== 'issued') throw httpError(409, 'This book is already back.')
  const { libraryFinePerDay } = await getSettings()
  const today = ymd()
  issue.fine = req.body.waive ? 0 : fineOf(issue, libraryFinePerDay, today)
  Object.assign(issue, { status: 'returned', returnedOn: today, finePaid: issue.fine > 0 ? Boolean(req.body.finePaid) : false, returnedTo: req.user.name })
  await issue.save()
  res.json(issue)
}))

router.post('/library/issues/:id/renew', librarian, asyncHandler(async (req, res) => {
  const issue = await scopedIssue(req)
  if (issue.status !== 'issued') throw httpError(409, 'Only books that are out can be renewed.')
  const { libraryLoanDays } = await getSettings()
  issue.dueOn = addDays(ymd() > issue.dueOn ? ymd() : issue.dueOn, libraryLoanDays)
  await issue.save()
  res.json(issue)
}))

router.post('/library/issues/:id/lost', librarian, asyncHandler(async (req, res) => {
  const issue = await scopedIssue(req)
  if (issue.status !== 'issued') throw httpError(409, 'This book is not out.')
  const book = await Book.findById(issue.book, 'price copies')
  issue.fine = Math.max(0, Number(req.body.fine ?? book?.price) || 0)
  Object.assign(issue, { status: 'lost', returnedOn: ymd(), finePaid: issue.fine > 0 ? Boolean(req.body.finePaid) : false, returnedTo: req.user.name })
  await issue.save()
  // The lost copy leaves the catalogue.
  if (book && book.copies > 0) await Book.updateOne({ _id: book._id }, { $inc: { copies: -1 } })
  res.json(issue)
}))

router.post('/library/issues/:id/fine-paid', librarian, asyncHandler(async (req, res) => {
  const issue = await scopedIssue(req)
  if (issue.status === 'issued' || !issue.fine) throw httpError(409, 'There is no fine to collect on this record.')
  issue.finePaid = true
  await issue.save()
  res.json(issue)
}))

/* ── Student / parent portal view ── */

export async function myLibrary(student) {
  const settings = await getSettings()
  const today = ymd()
  const list = await BookIssue.find({ student: student._id }).populate('book', 'title author accessionNo').sort({ createdAt: -1 }).limit(100).lean()
  const rows = list.map(withFine(settings.libraryFinePerDay, today))
  return {
    current: rows.filter((r) => r.status === 'issued'),
    history: rows.filter((r) => r.status !== 'issued'),
    unpaidFines: rows.reduce((s, r) => s + (r.status === 'issued' ? r.fine : r.finePaid ? 0 : r.fine || 0), 0),
    rules: { loanDays: settings.libraryLoanDays, finePerDay: settings.libraryFinePerDay, maxBooks: settings.libraryMaxBooks },
  }
}

export default router
