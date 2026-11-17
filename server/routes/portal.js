// Student portal. Every query is scoped to one student's own records (req.student).
// `views` holds what both the student and their parents may see; the parent portal
// mounts it once per linked child. Student-only actions live on `router`.
import { Router } from 'express'
import mongoose from 'mongoose'
import { Assignment, Attempt, Certificate, Attendance, Course, CourseProgress, Doubt, Exam, FeeInstallment, LeaveRequest, Mark, Material, Notice, Payment, Student, StoredFile, Submission, Test, TimetableSlot } from '../models.js'
import { attendanceSummary, installmentStatus } from '../insights.js'
import { answerDoubt, aiEnabled, generateMcqs } from '../ai.js'
import { coursesForStudent, leaveDates } from '../services.js'
import { reportCard } from './academics.js'
import { admitCardData, loadExamForCards } from './exams.js'
import { receipt } from './office.js'
import { cancelTransportRequest, createTransportRequest, myTransport, transportOptions } from './transport.js'
import { myBusLive } from './gps.js'
import { config } from '../config.js'
import { certificateData } from './certificates.js'
import { activeBanners, monthRange, studentCalendar } from './campus.js'
import { booksWithStock, bookSearch, myLibrary } from './library.js'
import { addDays, asyncHandler, httpError, ymd } from '../util.js'

export const loadStudent = (id) => Student.findById(id).populate({ path: 'batch', populate: { path: 'classTeacher', select: 'name' } }).lean()

const router = Router()
export const views = Router()

router.use(asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'student' || !req.user.student) throw httpError(403, 'Student portal only.')
  req.student = await loadStudent(req.user.student)
  if (!req.student) throw httpError(404, 'Student record not found.')
  next()
}))

const audiencesFor = (role) => (role === 'parent' ? ['all', 'students', 'parents'] : ['all', 'students'])

const noticeFilter = (student, role) => ({
  audience: { $in: audiencesFor(role) },
  $or: [{ batch: null }, { batch: student.batch._id }],
})

// Assignments of the student's batch, each with the student's own submission. Homework
// a teacher posted under Study Material (kind "assignment") is listed too, read-only.
async function assignmentsFor(student) {
  const [list, posted] = await Promise.all([
    Assignment.find({ batch: student.batch._id }).sort({ dueDate: -1 }).limit(100).lean(),
    Material.find({ kind: 'assignment', deletedAt: null, $or: [{ batch: null }, { batch: student.batch._id }] }).sort({ createdAt: -1 }).limit(50).lean(),
  ])
  const subs = await Submission.find({ student: student._id, assignment: { $in: list.map((a) => a._id) } }).lean()
  const bySub = Object.fromEntries(subs.map((x) => [String(x.assignment), x]))
  const today = ymd()
  const rows = list.map((a) => {
    const submission = bySub[String(a._id)] || null
    const pending = !submission || submission.status === 'returned'
    return { ...a, submission, pending, overdue: pending && a.dueDate < today }
  })
  for (const m of posted) {
    rows.push({
      _id: m._id, title: m.title, subject: m.subject, instructions: m.description, url: m.url, dueDate: m.dueDate || ymd(m.createdAt),
      status: 'published', offline: true, submission: null, pending: Boolean(m.dueDate) && m.dueDate >= today, overdue: false, createdAt: m.createdAt,
    })
  }
  return rows.sort((a, b) => b.dueDate.localeCompare(a.dueDate))
}

const PHONE = /^[+\d][\d\s-]{6,17}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// What a student or parent may correct themselves. Name, date of birth, class and the
// guardian mobile (it is the parent login) are changed by the office.
const SELF_FIELDS = ['phone', 'email', 'address', 'bloodGroup', 'fatherName', 'motherName', 'guardianName', 'guardianRelation', 'guardianEmail', 'guardianOccupation', 'emergencyPhone']

views.get('/home', asyncHandler(async (req, res) => {
  const s = req.student
  const today = ymd()
  const [att, installments, notices, tests, attempts, lastMark, todaySlots, courses, assignments, banners, upcoming] = await Promise.all([
    attendanceSummary({ studentIds: [s._id] }),
    FeeInstallment.find({ student: s._id }).sort({ dueDate: 1 }).lean(),
    Notice.find(noticeFilter(s, req.user.role)).sort({ createdAt: -1 }).limit(5).lean(),
    Test.find({ batch: s.batch._id, status: 'published' }, 'title subject durationMin questions').lean(),
    Attempt.find({ student: s._id }, 'test').lean(),
    Exam.find({ batch: s.batch._id, published: true }, '_id').lean().then((exams) => Mark.findOne({ student: s._id, exam: { $in: exams.map((e) => e._id) } }).populate('exam', 'name date').sort({ createdAt: -1 }).lean()),
    TimetableSlot.find({ batch: s.batch._id, day: ((new Date().getDay() + 6) % 7) + 1 }).populate('teacher', 'name').sort({ start: 1 }).lean(),
    coursesForStudent(s),
    assignmentsFor(s),
    activeBanners(audiencesFor(req.user.role)),
    studentCalendar({ from: today, to: addDays(today, 30), student: s, audiences: audiencesFor(req.user.role) }),
  ])
  const fees = installments.map((i) => ({ ...i, ...installmentStatus(i, today) }))
  const done = new Set(attempts.map((a) => String(a.test)))
  res.json({
    student: s,
    banners,
    upcoming: upcoming.slice(0, 6),
    attendance: att.get(String(s._id)) || null,
    fees: { balance: fees.reduce((a, f) => a + f.balance, 0), next: fees.find((f) => f.balance > 0) || null },
    notices,
    pendingTests: tests.filter((t) => !done.has(String(t._id))).map((t) => ({ _id: t._id, title: t.title, subject: t.subject, durationMin: t.durationMin, questions: t.questions.length })),
    lastResult: lastMark || null,
    today: todaySlots,
    courses,
    assignments: {
      pending: assignments.filter((a) => a.pending && a.status === 'published').sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      recentGraded: assignments.filter((a) => a.submission?.status === 'graded').slice(0, 5),
    },
    aiEnabled,
  })
}))

views.get('/attendance', asyncHandler(async (req, res) => {
  const rows = await Attendance.find({ student: req.student._id }).sort({ date: -1 }).limit(120).lean()
  const summary = await attendanceSummary({ studentIds: [req.student._id], days: 120 })
  res.json({ rows, summary: summary.get(String(req.student._id)) || null })
}))

views.get('/fees', asyncHandler(async (req, res) => {
  const [installments, payments] = await Promise.all([
    FeeInstallment.find({ student: req.student._id }).sort({ dueDate: 1 }).lean(),
    Payment.find({ student: req.student._id }).sort({ paidOn: -1 }).lean(),
  ])
  res.json({ installments: installments.map((i) => ({ ...i, ...installmentStatus(i) })), payments })
}))

views.get('/fees/receipt/:id', asyncHandler(async (req, res) => {
  const data = await receipt(req.params.id)
  if (String(data.payment.student._id) !== String(req.student._id)) throw httpError(404, 'Receipt not found.')
  res.json(data)
}))

// Certificates the institute has shared with the student (and their parents).
views.get('/certificates', asyncHandler(async (req, res) => {
  res.json(await Certificate.find({ student: req.student._id, shared: true }, '-body').sort({ createdAt: -1 }).lean())
}))

views.get('/certificates/:id', asyncHandler(async (req, res) => {
  const data = await certificateData(req.params.id)
  if (String(data.student._id) !== String(req.student._id) || !data.shared) throw httpError(404, 'Certificate not found.')
  res.json(data)
}))

views.get('/results', asyncHandler(async (req, res) => {
  const exams = await Exam.find({ batch: req.student.batch._id, published: true }).sort({ date: -1 }).lean()
  const marks = await Mark.find({ student: req.student._id, exam: { $in: exams.map((e) => e._id) } }).lean()
  const byExam = Object.fromEntries(marks.map((m) => [String(m.exam), m]))
  res.json(exams.filter((e) => byExam[String(e._id)]).map((e) => ({ exam: e, mark: byExam[String(e._id)] })))
}))

views.get('/results/:exam', asyncHandler(async (req, res) => {
  const exam = await Exam.findOne({ _id: req.params.exam, published: true }).lean()
  if (!exam) throw httpError(404, 'Result not published yet.')
  res.json(await reportCard(exam._id, req.student._id))
}))

// Every exam of the student's batch this session: upcoming / ongoing ones with their
// date sheet and admit card, finished ones with the result once it is published.
views.get('/exams', asyncHandler(async (req, res) => {
  const today = ymd()
  const since = addDays(today, -365)
  const exams = await Exam.find({ batch: req.student.batch._id, $or: [{ date: { $gte: since } }, { 'subjects.date': { $gte: since } }, { date: null }, { date: '' }] }).sort({ date: 1 }).lean()
  const marks = await Mark.find({ student: req.student._id, exam: { $in: exams.map((e) => e._id) } }, 'exam percent grade rank result total max').lean()
  const markOf = Object.fromEntries(marks.map((m) => [String(m.exam), m]))
  const out = []
  for (const exam of exams) {
    const subjects = [...exam.subjects].sort((a, b) => `${a.date || '9999'}${a.start || ''}`.localeCompare(`${b.date || '9999'}${b.start || ''}`))
    const dates = subjects.map((s) => s.date).filter(Boolean)
    const first = dates[0] || exam.date || null
    const last = dates.at(-1) || exam.date || null
    const status = !first ? 'unscheduled' : last < today ? 'completed' : first > today ? 'upcoming' : 'ongoing'
    let admit = null
    if (status !== 'completed') {
      const { students } = await admitCardData(exam, [req.student._id])
      admit = !exam.admitCards ? 'not-released' : students[0]?.held ? 'held' : 'ready'
    }
    const mark = markOf[String(exam._id)]
    out.push({
      exam: { _id: exam._id, name: exam.name, type: exam.type, term: exam.term, date: first, endDate: last, subjects: subjects.map((s) => ({ _id: s._id, name: s.name, date: s.date, start: s.start, end: s.end, room: s.room, maxMarks: s.maxMarks })) },
      status,
      admit,
      result: exam.published && mark ? { percent: mark.percent, grade: mark.grade, rank: mark.rank, result: mark.result, total: mark.total, max: mark.max } : null,
      resultPending: !exam.published && status === 'completed',
    })
  }
  const order = { ongoing: 0, upcoming: 1, unscheduled: 2, completed: 3 }
  out.sort((a, b) => order[a.status] - order[b.status] || (a.status === 'completed' ? (b.exam.date || '').localeCompare(a.exam.date || '') : (a.exam.date || '').localeCompare(b.exam.date || '')))
  res.json(out)
}))

// Exams with a date sheet (upcoming or just finished), each with the admit card's status.
views.get('/admit-cards', asyncHandler(async (req, res) => {
  const since = addDays(ymd(), -15)
  const exams = await Exam.find({ batch: req.student.batch._id, $or: [{ 'subjects.date': { $gte: since } }, { date: { $gte: since } }] }).populate('subjects.invigilator', 'name').sort({ date: 1 }).lean()
  const out = []
  for (const exam of exams) {
    const { students } = await admitCardData(exam, [req.student._id])
    out.push({
      exam: { ...exam, admitAllowed: undefined, subjects: [...exam.subjects].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`)) },
      admit: !exam.admitCards ? 'not-released' : students[0]?.held ? 'held' : 'ready',
    })
  }
  res.json(out)
}))

views.get('/admit-cards/:exam', asyncHandler(async (req, res) => {
  const exam = await loadExamForCards({ _id: req.params.exam, batch: req.student.batch._id, admitCards: true })
  if (!exam) throw httpError(404, 'The admit card has not been released yet.')
  const data = await admitCardData(exam, [req.student._id])
  if (data.students[0]?.held) throw httpError(403, 'Your admit card is on hold because of overdue fees. Please contact the accounts office.')
  res.json({ ...data, exam: { ...exam, admitAllowed: undefined } })
}))

views.get('/tests', asyncHandler(async (req, res) => {
  const tests = await Test.find({ batch: req.student.batch._id, status: { $in: ['published', 'closed'] } }, '-questions').sort({ createdAt: -1 }).lean()
  const attempts = await Attempt.find({ student: req.student._id }).lean()
  const byTest = Object.fromEntries(attempts.map((a) => [String(a.test), a]))
  res.json(tests.map((t) => ({ ...t, attempt: byTest[String(t._id)] || null })))
}))

// Starting a test records the start time; questions are sent without answers.
router.post('/tests/:id/start', asyncHandler(async (req, res) => {
  const test = await Test.findOne({ _id: req.params.id, batch: req.student.batch._id, status: 'published' }).lean()
  if (!test) throw httpError(404, 'This test is not available.')
  const now = new Date()
  if (test.startAt && now < test.startAt) throw httpError(403, `This test opens at ${test.startAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`)
  let attempt = await Attempt.findOne({ test: test._id, student: req.student._id })
  if (attempt?.submittedAt) throw httpError(409, 'You have already submitted this test.')
  if (!attempt && test.endAt && now > test.endAt) throw httpError(403, 'This test has closed.')
  if (!attempt) attempt = await Attempt.create({ test: test._id, student: req.student._id, startedAt: now, answers: [] })
  // The timer stops at the duration or when the test window closes, whichever is first.
  let endsAt = new Date(attempt.startedAt.getTime() + test.durationMin * 60_000)
  if (test.endAt && test.endAt < endsAt) endsAt = test.endAt
  res.json({
    test: { _id: test._id, title: test.title, subject: test.subject, durationMin: test.durationMin, negativeMarks: test.negativeMarks, questions: test.questions.map((q) => ({ q: q.q, options: q.options, marks: q.marks })) },
    endsAt,
  })
}))

router.post('/tests/:id/submit', asyncHandler(async (req, res) => {
  const test = await Test.findOne({ _id: req.params.id, batch: req.student.batch._id }).lean()
  const attempt = await Attempt.findOne({ test: req.params.id, student: req.student._id })
  if (!test || !attempt) throw httpError(404, 'Start the test first.')
  if (attempt.submittedAt) throw httpError(409, 'Already submitted.')
  // The browser auto-submits when the timer ends; submittedAt records the actual time.
  const answers = test.questions.map((q, i) => {
    const a = Number(req.body.answers?.[i])
    return Number.isInteger(a) && a >= 0 && a < (q.options?.length || 4) ? a : -1
  })
  let score = 0
  let correct = 0
  let wrong = 0
  test.questions.forEach((q, i) => {
    if (answers[i] === -1) return
    if (answers[i] === q.answer) {
      correct++
      score += q.marks
    } else {
      wrong++
      score -= test.negativeMarks || 0
    }
  })
  Object.assign(attempt, { answers, correct, wrong, score, total: test.questions.reduce((s, q) => s + q.marks, 0), submittedAt: new Date() })
  await attempt.save()
  res.json(await attemptReview(test, attempt.toObject()))
}))

views.get('/tests/:id/review', asyncHandler(async (req, res) => {
  const test = await Test.findOne({ _id: req.params.id, batch: req.student.batch._id }).lean()
  const attempt = await Attempt.findOne({ test: req.params.id, student: req.student._id, submittedAt: { $ne: null } }).lean()
  if (!test || !attempt) throw httpError(404, 'No submitted attempt.')
  res.json(await attemptReview(test, attempt))
}))

async function attemptReview(test, attempt) {
  const better = await Attempt.countDocuments({ test: test._id, submittedAt: { $ne: null }, score: { $gt: attempt.score } })
  const takers = await Attempt.countDocuments({ test: test._id, submittedAt: { $ne: null } })
  return {
    test: { _id: test._id, title: test.title, subject: test.subject },
    attempt,
    rank: better + 1,
    takers,
    questions: test.questions.map((q, i) => ({ q: q.q, options: q.options, answer: q.answer, explanation: q.explanation, marked: attempt.answers[i] })),
  }
}

views.get('/materials', asyncHandler(async (req, res) => {
  res.json(await Material.find({ deletedAt: null, $or: [{ batch: null }, { batch: req.student.batch._id }] }).sort({ createdAt: -1 }).lean())
}))

views.get('/timetable', asyncHandler(async (req, res) => {
  res.json(await TimetableSlot.find({ batch: req.student.batch._id }).populate('teacher', 'name').sort({ day: 1, start: 1 }).lean())
}))

// Newest first; the page shows pinned ones in their own strip on top.
views.get('/notices', asyncHandler(async (req, res) => {
  res.json(await Notice.find(noticeFilter(req.student, req.user.role)).sort({ createdAt: -1 }).limit(100).lean())
}))

/* ── Profile: personal and guardian details, photo ── */

views.get('/profile', asyncHandler(async (req, res) => {
  res.json({ student: req.student, editable: SELF_FIELDS })
}))

views.put('/profile', asyncHandler(async (req, res) => {
  const update = {}
  for (const key of SELF_FIELDS) {
    if (req.body[key] === undefined) continue
    const value = String(req.body[key] ?? '').trim().slice(0, key === 'address' ? 500 : 120)
    if (value && ['phone', 'emergencyPhone'].includes(key) && !PHONE.test(value)) throw httpError(422, 'Enter a valid phone number.')
    if (value && ['email', 'guardianEmail'].includes(key) && !EMAIL.test(value)) throw httpError(422, 'Enter a valid email address.')
    update[key] = value || null
  }
  const old = req.student.photo ? String(req.student.photo) : null
  if (req.body.photo !== undefined) {
    const photo = req.body.photo ? String(req.body.photo) : null
    if (photo && photo !== old) {
      const file = mongoose.isValidObjectId(photo) && (await StoredFile.findOne({ _id: photo, purpose: 'photo', createdBy: req.user.id }, '_id'))
      if (!file) throw httpError(422, 'Upload the photo again.')
      await StoredFile.updateOne({ _id: photo }, { student: req.student._id })
    }
    update.photo = photo
  }
  await Student.updateOne({ _id: req.student._id }, update, { runValidators: true })
  // The replaced photo is not needed any more.
  if (update.photo !== undefined && old && old !== update.photo) await StoredFile.deleteOne({ _id: old, purpose: 'photo' })
  res.json({ student: await loadStudent(req.student._id), editable: SELF_FIELDS })
}))

/* ── Calendar, banners ── */

views.get('/calendar', asyncHandler(async (req, res) => {
  const { month, from, to } = monthRange(req.query.month)
  res.json({ month, items: await studentCalendar({ from, to, student: req.student, audiences: audiencesFor(req.user.role) }) })
}))

views.get('/banners', asyncHandler(async (req, res) => {
  res.json(await activeBanners(audiencesFor(req.user.role)))
}))

/* ── Library ── */

views.get('/library', asyncHandler(async (req, res) => {
  res.json(await myLibrary(req.student))
}))

views.get('/library/books', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim()
  res.json(await booksWithStock({ ...bookSearch(q), copies: { $gt: 0 } }, q ? 60 : 30))
}))

router.get('/doubts', asyncHandler(async (req, res) => {
  res.json(await Doubt.find({ student: req.student._id }).sort({ createdAt: -1 }).lean())
}))

// A new doubt gets an instant AI explanation (when configured); teachers can add their answer later.
router.post('/doubts', asyncHandler(async (req, res) => {
  const question = String(req.body.question || '').trim()
  if (question.length < 5) throw httpError(422, 'Please describe your doubt.')
  const doubt = await Doubt.create({ student: req.student._id, batch: req.student.batch._id, subject: req.body.subject, question })
  if (aiEnabled) {
    try {
      doubt.aiAnswer = await answerDoubt({ question, subject: doubt.subject, level: req.student.batch.program })
      doubt.aiError = undefined
    } catch (error) {
      console.error('[ai] doubt answer failed:', error.message)
      doubt.aiError = error.message
    }
    await doubt.save()
  }
  res.status(201).json(doubt)
}))

router.post('/doubts/:id/ai-answer', asyncHandler(async (req, res) => {
  if (!aiEnabled) throw httpError(503, 'AI is not configured. Please contact your institute.')
  const doubt = await Doubt.findOne({ _id: req.params.id, student: req.student._id }).populate('batch', 'program')
  if (!doubt) throw httpError(404, 'Doubt not found.')
  try {
    doubt.aiAnswer = await answerDoubt({ question: doubt.question, subject: doubt.subject, level: doubt.batch?.program })
    doubt.aiError = undefined
    await doubt.save()
    res.json(doubt)
  } catch (error) {
    doubt.aiError = error.message
    await doubt.save()
    throw error
  }
}))

/* ── LMS ── */

views.get('/courses', asyncHandler(async (req, res) => {
  res.json(await coursesForStudent(req.student))
}))

// Course content. Quiz answers are included only for quizzes the student has already done.
views.get('/courses/:id', asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, batches: req.student.batch._id, status: 'published' }).lean()
  if (!course) throw httpError(404, 'This course is not available.')
  const progress = await CourseProgress.findOne({ student: req.student._id, course: course._id }).lean()
  const done = Object.fromEntries((progress?.completed || []).map((c) => [String(c.lesson), c]))
  course.modules = course.modules.map((m) => ({
    ...m,
    lessons: m.lessons.map((l) => {
      const d = done[String(l._id)]
      const questions = l.kind === 'quiz'
        ? l.questions.map((q, i) => (d
          ? { q: q.q, options: q.options, marks: q.marks, answer: q.answer, explanation: q.explanation, marked: d.answers?.[i] ?? -1 }
          : { q: q.q, options: q.options, marks: q.marks }))
        : undefined
      return { ...l, questions, done: d ? { at: d.at, score: d.score, total: d.total } : null }
    }),
  }))
  res.json({ course, lastLesson: progress?.lastLesson || null })
}))

views.get('/assignments', asyncHandler(async (req, res) => {
  res.json(await assignmentsFor(req.student))
}))

/* ── Leave applications (students and parents can apply) ── */

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s)

views.get('/leaves', asyncHandler(async (req, res) => {
  res.json(await LeaveRequest.find({ student: req.student._id }).sort({ createdAt: -1 }).limit(50).lean())
}))

views.post('/leaves', asyncHandler(async (req, res) => {
  const from = String(req.body.from || '')
  const to = String(req.body.to || from)
  const reason = String(req.body.reason || '').trim()
  if (!isDate(from) || !isDate(to) || to < from) throw httpError(422, 'Choose valid from and to dates.')
  if (from < addDays(ymd(), -15)) throw httpError(422, 'Leave can be applied at most 15 days after the date.')
  if (leaveDates(from, to).length > 30) throw httpError(422, 'One application can cover at most 30 days.')
  if (reason.length < 3) throw httpError(422, 'Please write the reason.')
  const clash = await LeaveRequest.exists({ student: req.student._id, status: { $in: ['pending', 'approved'] }, from: { $lte: to }, to: { $gte: from } })
  if (clash) throw httpError(409, 'A leave application already covers some of these days.')
  const leave = await LeaveRequest.create({
    student: req.student._id, batch: req.student.batch._id, from, to, reason: reason.slice(0, 1000),
    requestedBy: req.user.id, requestedByName: req.user.name, requestedByRole: req.user.role,
  })
  res.status(201).json(leave)
}))

views.delete('/leaves/:id', asyncHandler(async (req, res) => {
  const leave = await LeaveRequest.findOneAndUpdate({ _id: req.params.id, student: req.student._id, status: 'pending' }, { status: 'cancelled' }, { returnDocument: 'after' })
  if (!leave) throw httpError(404, 'Only pending applications can be cancelled.')
  res.json(leave)
}))

views.get('/transport', asyncHandler(async (req, res) => {
  res.json(await myTransport(req.student))
}))

views.get('/transport/live', asyncHandler(async (req, res) => {
  if (config.mode === 'desktop') throw httpError(409, 'Live bus tracking works on the online website.')
  res.json(await myBusLive(req.student))
}))

// Apply for school transport (or a change of route / stop); the office approves it.
views.get('/transport/options', asyncHandler(async (req, res) => {
  res.json(await transportOptions(req.student))
}))

views.post('/transport/requests', asyncHandler(async (req, res) => {
  res.status(201).json(await createTransportRequest(req, req.student))
}))

views.delete('/transport/requests/:id', asyncHandler(async (req, res) => {
  res.json(await cancelTransportRequest(req.student, req.params.id))
}))

router.use(views)

/* ── Student-only actions ── */

// Marks a lesson done. Quizzes are graded here and can be retaken (the latest score counts).
router.post('/courses/:id/lessons/:lesson/complete', asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, batches: req.student.batch._id, status: 'published' }).lean()
  const lesson = course?.modules.flatMap((m) => m.lessons).find((l) => String(l._id) === req.params.lesson)
  if (!lesson) throw httpError(404, 'Lesson not found.')
  const entry = { lesson: lesson._id, at: new Date() }
  if (lesson.kind === 'quiz' && lesson.questions.length) {
    entry.answers = lesson.questions.map((q, i) => {
      const a = Number(req.body.answers?.[i])
      return Number.isInteger(a) && a >= 0 && a < q.options.length ? a : -1
    })
    entry.score = lesson.questions.reduce((sum, q, i) => sum + (entry.answers[i] === q.answer ? q.marks : 0), 0)
    entry.total = lesson.questions.reduce((sum, q) => sum + q.marks, 0)
  }
  const key = { student: req.student._id, course: course._id }
  await CourseProgress.updateOne(key, { $pull: { completed: { lesson: lesson._id } } }, { upsert: true })
  await CourseProgress.updateOne(key, { $push: { completed: entry }, lastLesson: lesson._id, lastAt: new Date() })
  res.json({ ok: true, score: entry.score, total: entry.total })
}))

// Remembers where the student stopped, so "Continue" opens the right lesson.
router.post('/courses/:id/lessons/:lesson/open', asyncHandler(async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, batches: req.student.batch._id, status: 'published' }, 'modules.lessons._id').lean()
  if (!course?.modules.some((m) => m.lessons.some((l) => String(l._id) === req.params.lesson))) throw httpError(404, 'Lesson not found.')
  await CourseProgress.updateOne({ student: req.student._id, course: course._id }, { lastLesson: req.params.lesson, lastAt: new Date() }, { upsert: true })
  res.json({ ok: true })
}))

router.post('/assignments/:id/submit', asyncHandler(async (req, res) => {
  const a = await Assignment.findOne({ _id: req.params.id, batch: req.student.batch._id }).lean()
  if (!a) throw httpError(404, 'Assignment not found.')
  if (a.status !== 'published') throw httpError(409, 'This assignment is closed.')
  const text = String(req.body.text || '').trim().slice(0, 20000)
  const link = String(req.body.link || '').trim()
  // Files uploaded first through POST /api/files (purpose "homework"), at most 5.
  const ids = [...new Set((Array.isArray(req.body.attachments) ? req.body.attachments : []).map((x) => String(x?.file || x)))].slice(0, 5)
  if (ids.some((x) => !mongoose.isValidObjectId(x))) throw httpError(422, 'One of the files could not be found. Please attach it again.')
  const files = ids.length ? await StoredFile.find({ _id: { $in: ids }, purpose: 'homework', createdBy: req.user.id }, 'name mime size').lean() : []
  if (files.length !== ids.length) throw httpError(422, 'One of the files could not be found. Please attach it again.')
  if (!text && !link && !files.length) throw httpError(422, 'Write your answer, attach a PDF / photo of your work, or add a link.')
  if (link && !/^https?:\/\//i.test(link)) throw httpError(422, 'The link must start with http:// or https://')
  const late = ymd() > a.dueDate
  if (late && !a.allowLate) throw httpError(409, 'The due date has passed and late submissions are not allowed.')
  const existing = await Submission.findOne({ assignment: a._id, student: req.student._id })
  if (existing?.status === 'graded') throw httpError(409, 'This assignment is already graded.')
  const sub = existing || new Submission({ assignment: a._id, student: req.student._id })
  const attachments = files.map((f) => ({ file: f._id, name: f.name, mime: f.mime, size: f.size }))
  Object.assign(sub, { text, link: link || undefined, attachments, submittedAt: new Date(), late, status: 'submitted' })
  await sub.save()
  res.status(201).json(sub)
}))

// Practice MCQs written by AI on any topic. Nothing is saved; the answers come with
// the questions and are checked in the browser.
const practiceHits = new Map()
router.post('/practice', asyncHandler(async (req, res) => {
  if (!aiEnabled) throw httpError(503, 'AI practice is not available right now. Please ask your institute.')
  const key = String(req.student._id)
  const now = Date.now()
  const recent = (practiceHits.get(key) || []).filter((t) => now - t < 60 * 60_000)
  if (recent.length >= 10) throw httpError(429, 'You have made 10 practice sets in the last hour. Please try again a little later.')
  const subject = String(req.body.subject || '').trim().slice(0, 80)
  const topic = String(req.body.topic || '').trim().slice(0, 200)
  if (!subject || topic.length < 2) throw httpError(422, 'Choose a subject and write a topic.')
  const count = Math.min(15, Math.max(3, Number(req.body.count) || 5))
  practiceHits.set(key, [...recent, now])
  const level = [req.student.batch.program, req.student.batch.name].filter(Boolean).join(' · ')
  const questions = await generateMcqs({ subject, topic, count, level, difficulty: ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : 'medium', language: req.body.language === 'Hindi' ? 'Hindi' : 'English' })
  if (!questions.length) throw httpError(502, 'The AI could not write questions on this topic. Try a different topic.')
  res.json({ subject, topic, questions })
}))

export default router
