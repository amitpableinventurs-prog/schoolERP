import { Router } from 'express'
import { allow, staffOnly } from '../auth.js'
import { crudRouter } from '../crud.js'
import { Attempt, Attendance, Batch, Doubt, Exam, Mark, Material, Notice, Paper, Student, Test, TimetableSlot } from '../models.js'
import { attendanceSummary, getSettings } from '../insights.js'
import { recomputeExam } from '../services.js'
import { answerDoubt, draftNotice, generateMcqs, generatePaper, generateRemarks } from '../ai.js'
import { asyncHandler, httpError, pick, ymd } from '../util.js'
import { assertBatch, assertStudent, batchFilter, batchQuery, optionalBatchFilter, scopeOf } from '../scope.js'

const router = Router()
const teacher = allow('teacher')

// Finds a batch-linked record only if its batch is in the user's wings.
async function scoped(Model, req, id = req.params.id) {
  const doc = await Model.findOne({ _id: id, ...(await batchFilter(req)) })
  if (!doc) throw httpError(404, 'Not found in your wing.')
  return doc
}

// Records with an optional batch (notices, material): scoped users must pick one of their batches.
async function checkOptionalBatch(data, req) {
  const scope = await scopeOf(req)
  if (data.batch) await assertBatch(req, data.batch)
  else if (!scope.all) throw httpError(422, 'Choose a batch of your wing.')
}

/* ── Attendance ── */

// Register for one batch on one date: every active student with their status (if marked).
router.get('/attendance', staffOnly, asyncHandler(async (req, res) => {
  const { batch, date = ymd() } = req.query
  if (!batch) throw httpError(422, 'Choose a batch.')
  await assertBatch(req, batch)
  const [students, marked] = await Promise.all([
    Student.find({ batch, status: 'active' }).sort({ rollNo: 1, name: 1 }).lean(),
    Attendance.find({ batch, date }).lean(),
  ])
  const byStudent = Object.fromEntries(marked.map((m) => [String(m.student), m.status]))
  const summary = await attendanceSummary({ studentIds: students.map((s) => s._id) })
  res.json({
    date,
    alreadyMarked: marked.length > 0,
    students: students.map((s) => ({ _id: s._id, name: s.name, admissionNo: s.admissionNo, rollNo: s.rollNo, status: byStudent[String(s._id)] || null, pct30: summary.get(String(s._id))?.pct ?? null })),
  })
}))

router.post('/attendance', teacher, asyncHandler(async (req, res) => {
  const { batch, date = ymd(), records = [] } = req.body
  if (!batch || !Array.isArray(records)) throw httpError(422, 'Batch and records are required.')
  if (date > ymd()) throw httpError(422, 'Attendance cannot be marked for a future date.')
  await assertBatch(req, batch)
  // Only students of this batch can be marked.
  const members = new Set((await Student.find({ batch }, '_id').lean()).map((s) => String(s._id)))
  const ops = records
    .filter((r) => ['P', 'A', 'L'].includes(r.status) && members.has(String(r.student)))
    .map((r) => ({ updateOne: { filter: { student: r.student, date }, update: { $set: { batch, status: r.status } }, upsert: true } }))
  if (ops.length) await Attendance.bulkWrite(ops)
  res.json({ ok: true, saved: ops.length })
}))

// Monthly register: students × dates matrix.
router.get('/attendance/report', staffOnly, asyncHandler(async (req, res) => {
  const { batch, month = ymd().slice(0, 7) } = req.query
  if (!batch) throw httpError(422, 'Choose a batch.')
  await assertBatch(req, batch)
  const from = `${month}-01`
  const to = `${month}-31`
  const [students, rows] = await Promise.all([
    Student.find({ batch, status: 'active' }).sort({ rollNo: 1, name: 1 }).lean(),
    Attendance.find({ batch, date: { $gte: from, $lte: to } }).lean(),
  ])
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const grid = {}
  for (const r of rows) (grid[String(r.student)] ||= {})[r.date] = r.status
  res.json({
    month,
    dates,
    students: students.map((s) => {
      const g = grid[String(s._id)] || {}
      const values = Object.values(g)
      const present = values.filter((v) => v === 'P').length
      return { _id: s._id, name: s.name, rollNo: s.rollNo, admissionNo: s.admissionNo, days: g, present, total: values.length, pct: values.length ? Math.round((present / values.length) * 100) : null }
    }),
  })
}))

/* ── Exams & marks ── */

router.get('/exams', staffOnly, asyncHandler(async (req, res) => {
  const filter = await batchQuery(req, req.query.batch)
  const exams = await Exam.find(filter).populate('batch', 'name type').sort({ date: -1 }).lean()
  const stats = await Mark.aggregate([
    { $match: { exam: { $in: exams.map((e) => e._id) } } },
    { $group: { _id: '$exam', avg: { $avg: '$percent' }, n: { $sum: 1 } } },
  ])
  const map = Object.fromEntries(stats.map((s) => [String(s._id), s]))
  res.json(exams.map((e) => ({ ...e, average: map[String(e._id)]?.avg != null ? Math.round(map[String(e._id)].avg) : null, entries: map[String(e._id)]?.n || 0 })))
}))

router.post('/exams', teacher, asyncHandler(async (req, res) => {
  const data = pick(req.body, ['name', 'batch', 'type', 'date', 'subjects', 'published'])
  const batch = await Batch.findById(data.batch).lean()
  if (!batch) throw httpError(422, 'Choose a batch.')
  await assertBatch(req, batch._id)
  if (!data.subjects?.length) data.subjects = batch.subjects.map((name) => ({ name, maxMarks: 100 }))
  res.status(201).json(await Exam.create(data))
}))

router.put('/exams/:id', teacher, asyncHandler(async (req, res) => {
  await scoped(Exam, req)
  const exam = await Exam.findByIdAndUpdate(req.params.id, pick(req.body, ['name', 'type', 'date', 'subjects', 'published']), { returnDocument: 'after', runValidators: true })
  if (!exam) throw httpError(404, 'Exam not found.')
  await recomputeExam(exam._id)
  res.json(exam)
}))

router.delete('/exams/:id', teacher, asyncHandler(async (req, res) => {
  await scoped(Exam, req)
  await Mark.deleteMany({ exam: req.params.id })
  await Exam.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
}))

// Marks sheet: every active student of the batch with their scores.
router.get('/exams/:id/marks', staffOnly, asyncHandler(async (req, res) => {
  await scoped(Exam, req)
  const exam = await Exam.findById(req.params.id).populate('batch', 'name type').lean()
  if (!exam) throw httpError(404, 'Exam not found.')
  const [students, marks] = await Promise.all([
    Student.find({ batch: exam.batch._id, status: { $in: ['active', 'passed'] } }).sort({ rollNo: 1, name: 1 }).lean(),
    Mark.find({ exam: exam._id }).lean(),
  ])
  const byStudent = Object.fromEntries(marks.map((m) => [String(m.student), m]))
  res.json({ exam, rows: students.map((s) => ({ student: { _id: s._id, name: s.name, admissionNo: s.admissionNo, rollNo: s.rollNo }, mark: byStudent[String(s._id)] || null })) })
}))

router.put('/exams/:id/marks', teacher, asyncHandler(async (req, res) => {
  const exam = (await scoped(Exam, req)).toObject()
  const members = new Set((await Student.find({ batch: exam.batch }, '_id').lean()).map((s) => String(s._id)))
  const subjects = new Set(exam.subjects.map((s) => s.name))
  const maxBy = Object.fromEntries(exam.subjects.map((s) => [s.name, s.maxMarks]))
  const ops = []
  for (const row of req.body.rows || []) {
    if (!members.has(String(row.student))) continue
    const scores = (row.scores || [])
      .filter((s) => subjects.has(s.subject) && s.marks !== '' && s.marks != null)
      .map((s) => ({ subject: s.subject, marks: Math.max(0, Math.min(maxBy[s.subject], Number(s.marks))) }))
    const update = { scores }
    if (row.remark !== undefined) update.remark = row.remark
    ops.push({ updateOne: { filter: { exam: exam._id, student: row.student }, update: { $set: update }, upsert: true } })
  }
  if (ops.length) await Mark.bulkWrite(ops)
  await recomputeExam(exam._id)
  res.json({ ok: true })
}))

// AI writes a report-card remark for every student who has marks.
router.post('/exams/:id/ai-remarks', teacher, asyncHandler(async (req, res) => {
  await scoped(Exam, req)
  const exam = await Exam.findById(req.params.id).populate('batch', 'name').lean()
  if (!exam) throw httpError(404, 'Exam not found.')
  const marks = await Mark.find({ exam: exam._id }).populate('student', 'admissionNo').lean()
  if (!marks.length) throw httpError(422, 'Enter marks first.')
  const att = await attendanceSummary({ studentIds: marks.map((m) => m.student._id), days: 60 })
  const maxBy = Object.fromEntries(exam.subjects.map((s) => [s.name, s.maxMarks]))
  const rows = marks.map((m) => ({
    admissionNo: m.student.admissionNo,
    percent: m.percent, grade: m.grade, rank: m.rank, of: marks.length,
    subjects: Object.fromEntries(m.scores.map((s) => [s.subject, `${s.marks}/${maxBy[s.subject]}`])),
    attendancePct: att.get(String(m.student._id))?.pct ?? null,
  }))
  const remarks = await generateRemarks({ examName: exam.name, batchName: exam.batch.name, rows })
  const byAdm = Object.fromEntries(marks.map((m) => [m.student.admissionNo, m._id]))
  const ops = remarks.filter((r) => byAdm[r.admissionNo]).map((r) => ({ updateOne: { filter: { _id: byAdm[r.admissionNo] }, update: { $set: { remark: r.remark } } } }))
  if (ops.length) await Mark.bulkWrite(ops)
  res.json({ updated: ops.length })
}))

router.get('/exams/:id/report-card/:student', staffOnly, asyncHandler(async (req, res) => {
  await scoped(Exam, req)
  await assertStudent(req, req.params.student)
  res.json(await reportCard(req.params.id, req.params.student))
}))

export async function reportCard(examId, studentId) {
  const exam = await Exam.findById(examId).populate('batch', 'name type program classTeacher').lean()
  const student = await Student.findById(studentId).lean()
  const mark = await Mark.findOne({ exam: examId, student: studentId }).lean()
  if (!exam || !student || !mark) throw httpError(404, 'Report card not available.')
  const [settings, count, att] = await Promise.all([
    getSettings(),
    Mark.countDocuments({ exam: examId }),
    attendanceSummary({ studentIds: [student._id], days: 90 }),
  ])
  return { exam, student, mark, outOf: count, attendance: att.get(String(student._id)) || null, institute: settings }
}

/* ── Online tests ── */

router.get('/tests', staffOnly, asyncHandler(async (req, res) => {
  const filter = await batchQuery(req, req.query.batch)
  const tests = await Test.find(filter, '-questions.explanation').populate('batch', 'name type').sort({ createdAt: -1 }).lean()
  const counts = await Attempt.aggregate([{ $match: { submittedAt: { $ne: null } } }, { $group: { _id: '$test', n: { $sum: 1 }, avg: { $avg: '$score' } } }])
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c]))
  res.json(tests.map((t) => ({ ...t, questionCount: t.questions.length, questions: undefined, attempts: map[String(t._id)]?.n || 0, avgScore: map[String(t._id)]?.avg != null ? Math.round(map[String(t._id)].avg * 10) / 10 : null })))
}))

router.get('/tests/:id', staffOnly, asyncHandler(async (req, res) => {
  await scoped(Test, req)
  const test = await Test.findById(req.params.id).populate('batch', 'name type').lean()
  if (!test) throw httpError(404, 'Test not found.')
  res.json(test)
}))

const TEST_FIELDS = ['title', 'batch', 'subject', 'topic', 'durationMin', 'negativeMarks', 'questions', 'status', 'aiGenerated']
router.post('/tests', teacher, asyncHandler(async (req, res) => {
  await assertBatch(req, req.body.batch)
  res.status(201).json(await Test.create({ ...pick(req.body, TEST_FIELDS), createdBy: req.user.id }))
}))
router.put('/tests/:id', teacher, asyncHandler(async (req, res) => {
  await scoped(Test, req)
  if (req.body.batch) await assertBatch(req, req.body.batch)
  const test = await Test.findByIdAndUpdate(req.params.id, pick(req.body, TEST_FIELDS), { returnDocument: 'after', runValidators: true })
  if (!test) throw httpError(404, 'Test not found.')
  res.json(test)
}))
router.delete('/tests/:id', teacher, asyncHandler(async (req, res) => {
  await scoped(Test, req)
  await Attempt.deleteMany({ test: req.params.id })
  await Test.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
}))

router.get('/tests/:id/results', staffOnly, asyncHandler(async (req, res) => {
  await scoped(Test, req)
  const test = await Test.findById(req.params.id).populate('batch', 'name').lean()
  if (!test) throw httpError(404, 'Test not found.')
  const attempts = await Attempt.find({ test: test._id, submittedAt: { $ne: null } }).populate('student', 'name admissionNo').sort({ score: -1, submittedAt: 1 }).lean()
  // Per-question accuracy shows which topics the batch struggles with.
  const accuracy = test.questions.map((q, i) => {
    const right = attempts.filter((a) => a.answers[i] === q.answer).length
    return { index: i, q: q.q, correctPct: attempts.length ? Math.round((right / attempts.length) * 100) : null }
  })
  res.json({ test, attempts, accuracy })
}))

router.post('/tests/ai-generate', teacher, asyncHandler(async (req, res) => {
  const { subject, level, topic, count = 10, difficulty, language } = req.body
  if (!subject || !topic) throw httpError(422, 'Subject and topic are required.')
  const questions = await generateMcqs({ subject, level, topic, count: Math.min(30, Math.max(1, Number(count))), difficulty, language })
  res.json({ questions: questions.map((q) => ({ ...q, marks: 4 })) })
}))

/* ── AI question papers ── */

async function paperFilter(req) {
  const scope = await scopeOf(req)
  return scope.all ? {} : { $or: [{ batch: { $in: scope.batchIds } }, { createdBy: req.user.id }] }
}

router.get('/papers', staffOnly, asyncHandler(async (req, res) => {
  res.json(await Paper.find(await paperFilter(req), '-content.sections').populate('batch', 'name').sort({ createdAt: -1 }).limit(100).lean())
}))
router.get('/papers/:id', staffOnly, asyncHandler(async (req, res) => {
  const paper = await Paper.findOne({ _id: req.params.id, ...(await paperFilter(req)) }).populate('batch', 'name').lean()
  if (!paper) throw httpError(404, 'Paper not found.')
  res.json(paper)
}))
router.post('/papers/generate', teacher, asyncHandler(async (req, res) => {
  const input = pick(req.body, ['subject', 'level', 'topics', 'mcq', 'short', 'long', 'difficulty', 'language', 'totalMarks'])
  if (!input.subject || !input.level) throw httpError(422, 'Subject and class/level are required.')
  if (req.body.batch) await assertBatch(req, req.body.batch)
  const content = await generatePaper(input)
  const paper = await Paper.create({ title: content.title, batch: req.body.batch || undefined, subject: input.subject, level: input.level, content, createdBy: req.user.id })
  res.status(201).json(paper)
}))
router.delete('/papers/:id', teacher, asyncHandler(async (req, res) => {
  const paper = await Paper.findOneAndDelete({ _id: req.params.id, ...(await paperFilter(req)) })
  if (!paper) throw httpError(404, 'Paper not found.')
  res.json({ ok: true })
}))

/* ── Timetable ── */

router.get('/timetable', staffOnly, asyncHandler(async (req, res) => {
  const filter = await batchQuery(req, req.query.batch)
  if (req.query.teacher) filter.teacher = req.query.teacher
  res.json(await TimetableSlot.find(filter).populate('teacher', 'name').populate('batch', 'name').sort({ day: 1, start: 1 }).lean())
}))

router.post('/timetable', allow(), asyncHandler(async (req, res) => {
  const data = pick(req.body, ['batch', 'day', 'start', 'end', 'subject', 'teacher', 'room'])
  if (!data.teacher) delete data.teacher
  await assertBatch(req, data.batch)
  if (!(data.start < data.end)) throw httpError(422, 'End time must be after start time.')
  // Clash check: the same teacher or the same batch can't be in two places at once.
  const overlap = { day: data.day, start: { $lt: data.end }, end: { $gt: data.start } }
  const clash = await TimetableSlot.findOne({ ...overlap, $or: [{ batch: data.batch }, ...(data.teacher ? [{ teacher: data.teacher }] : [])] }).populate('batch', 'name').populate('teacher', 'name').lean()
  if (clash) {
    throw httpError(409, String(clash.batch._id) === String(data.batch)
      ? `This batch already has ${clash.subject} from ${clash.start} to ${clash.end}.`
      : `${clash.teacher?.name} is already teaching ${clash.batch.name} from ${clash.start} to ${clash.end}.`)
  }
  res.status(201).json(await TimetableSlot.create(data))
}))

router.delete('/timetable/:id', allow(), asyncHandler(async (req, res) => {
  await (await scoped(TimetableSlot, req)).deleteOne()
  res.json({ ok: true })
}))

/* ── Study material ── */

router.use('/materials', crudRouter(Material, {
  fields: ['batch', 'subject', 'title', 'kind', 'url', 'description', 'dueDate'],
  search: ['title', 'subject', 'description'],
  filters: ['batch', 'kind'],
  populate: 'batch',
  read: staffOnly,
  write: teacher,
  scope: optionalBatchFilter,
  beforeSave: async (data, req) => {
    await checkOptionalBatch(data, req)
    data.createdBy = req.user.id
  },
}))

/* ── Doubts ── */

router.get('/doubts', staffOnly, asyncHandler(async (req, res) => {
  const filter = await batchQuery(req, req.query.batch)
  if (req.query.status) filter.status = req.query.status
  res.json(await Doubt.find(filter).populate('student', 'name admissionNo').populate('batch', 'name').sort({ status: -1, createdAt: -1 }).limit(300).lean())
}))

router.put('/doubts/:id', teacher, asyncHandler(async (req, res) => {
  await scoped(Doubt, req)
  const doubt = await Doubt.findByIdAndUpdate(req.params.id, { teacherAnswer: req.body.teacherAnswer, answeredBy: req.user.name, status: req.body.teacherAnswer ? 'answered' : 'open' }, { returnDocument: 'after' })
  res.json(doubt)
}))

router.post('/doubts/:id/ai-answer', teacher, asyncHandler(async (req, res) => {
  await scoped(Doubt, req)
  const doubt = await Doubt.findById(req.params.id).populate('batch', 'program name')
  if (!doubt) throw httpError(404, 'Doubt not found.')
  doubt.aiAnswer = await answerDoubt({ question: doubt.question, subject: doubt.subject, level: doubt.batch?.program })
  await doubt.save()
  res.json(doubt)
}))

/* ── Notices ── */

router.post('/notices/ai-draft', staffOnly, asyncHandler(async (req, res) => {
  if (!req.body.points) throw httpError(422, 'Write a few points for the notice.')
  const settings = await getSettings()
  res.json(await draftNotice({ points: req.body.points, audience: req.body.audience || 'all', language: req.body.language }, settings.instituteName))
}))

router.use('/notices', crudRouter(Notice, {
  fields: ['title', 'body', 'audience', 'batch', 'pinned'],
  search: ['title', 'body'],
  filters: ['audience', 'batch'],
  populate: 'batch',
  sort: { pinned: -1, createdAt: -1 },
  read: staffOnly,
  write: allow('teacher', 'counsellor', 'accountant'),
  scope: optionalBatchFilter,
  beforeSave: async (data, req) => {
    await checkOptionalBatch(data, req)
    data.createdBy = req.user.name
  },
}))

export default router
