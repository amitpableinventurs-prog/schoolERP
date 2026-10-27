// Student portal. Every query is scoped to one student's own records (req.student).
// `views` holds what both the student and their parents may see; the parent portal
// mounts it once per linked child. Student-only actions live on `router`.
import { Router } from 'express'
import { Assignment, Attempt, Certificate, Attendance, Course, CourseProgress, Doubt, Exam, FeeInstallment, LeaveRequest, Mark, Material, Notice, Payment, Student, Submission, Test, TimetableSlot } from '../models.js'
import { attendanceSummary, installmentStatus } from '../insights.js'
import { answerDoubt, aiEnabled } from '../ai.js'
import { coursesForStudent, leaveDates } from '../services.js'
import { reportCard } from './academics.js'
import { admitCardData, loadExamForCards } from './exams.js'
import { receipt } from './office.js'
import { myTransport } from './transport.js'
import { myBusLive } from './gps.js'
import { config } from '../config.js'
import { certificateData } from './certificates.js'
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

const noticeFilter = (student, role) => ({
  audience: { $in: role === 'parent' ? ['all', 'students', 'parents'] : ['all', 'students'] },
  $or: [{ batch: null }, { batch: student.batch._id }],
})

// Assignments of the student's batch, each with the student's own submission.
async function assignmentsFor(student) {
  const list = await Assignment.find({ batch: student.batch._id }).sort({ dueDate: -1 }).limit(100).lean()
  const subs = await Submission.find({ student: student._id, assignment: { $in: list.map((a) => a._id) } }).lean()
  const bySub = Object.fromEntries(subs.map((x) => [String(x.assignment), x]))
  const today = ymd()
  return list.map((a) => {
    const submission = bySub[String(a._id)] || null
    const pending = !submission || submission.status === 'returned'
    return { ...a, submission, pending, overdue: pending && a.dueDate < today }
  })
}

views.get('/home', asyncHandler(async (req, res) => {
  const s = req.student
  const today = ymd()
  const [att, installments, notices, tests, attempts, lastMark, todaySlots, courses, assignments] = await Promise.all([
    attendanceSummary({ studentIds: [s._id] }),
    FeeInstallment.find({ student: s._id }).sort({ dueDate: 1 }).lean(),
    Notice.find(noticeFilter(s, req.user.role)).sort({ pinned: -1, createdAt: -1 }).limit(5).lean(),
    Test.find({ batch: s.batch._id, status: 'published' }, 'title subject durationMin questions').lean(),
    Attempt.find({ student: s._id }, 'test').lean(),
    Exam.find({ batch: s.batch._id, published: true }, '_id').lean().then((exams) => Mark.findOne({ student: s._id, exam: { $in: exams.map((e) => e._id) } }).populate('exam', 'name date').sort({ createdAt: -1 }).lean()),
    TimetableSlot.find({ batch: s.batch._id, day: ((new Date().getDay() + 6) % 7) + 1 }).populate('teacher', 'name').sort({ start: 1 }).lean(),
    coursesForStudent(s),
    assignmentsFor(s),
  ])
  const fees = installments.map((i) => ({ ...i, ...installmentStatus(i, today) }))
  const done = new Set(attempts.map((a) => String(a.test)))
  res.json({
    student: s,
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

// Exams with a date sheet (upcoming or just finished), each with the admit card's status.
views.get('/admit-cards', asyncHandler(async (req, res) => {
  const since = addDays(ymd(), -15)
  const exams = await Exam.find({ batch: req.student.batch._id, 'subjects.date': { $gte: since } }).populate('subjects.invigilator', 'name').sort({ date: 1 }).lean()
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
  const answers = test.questions.map((_, i) => {
    const a = Number(req.body.answers?.[i])
    return Number.isInteger(a) && a >= 0 && a < 4 ? a : -1
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
  res.json(await Material.find({ $or: [{ batch: null }, { batch: req.student.batch._id }] }).sort({ createdAt: -1 }).lean())
}))

views.get('/timetable', asyncHandler(async (req, res) => {
  res.json(await TimetableSlot.find({ batch: req.student.batch._id }).populate('teacher', 'name').sort({ day: 1, start: 1 }).lean())
}))

views.get('/notices', asyncHandler(async (req, res) => {
  res.json(await Notice.find(noticeFilter(req.student, req.user.role)).sort({ pinned: -1, createdAt: -1 }).limit(50).lean())
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
      await doubt.save()
    } catch (error) {
      console.error('[ai] doubt answer failed:', error.message)
    }
  }
  res.status(201).json(doubt)
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
  if (!text && !link) throw httpError(422, 'Write your answer or add a link to your work.')
  if (link && !/^https?:\/\//i.test(link)) throw httpError(422, 'The link must start with http:// or https://')
  const late = ymd() > a.dueDate
  if (late && !a.allowLate) throw httpError(409, 'The due date has passed and late submissions are not allowed.')
  const existing = await Submission.findOne({ assignment: a._id, student: req.student._id })
  if (existing?.status === 'graded') throw httpError(409, 'This assignment is already graded.')
  const sub = existing || new Submission({ assignment: a._id, student: req.student._id })
  Object.assign(sub, { text, link: link || undefined, submittedAt: new Date(), late, status: 'submitted' })
  await sub.save()
  res.status(201).json(sub)
}))

export default router
