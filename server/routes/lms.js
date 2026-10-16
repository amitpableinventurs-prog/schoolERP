// LMS for staff: courses (modules → lessons, progress), assignments with
// submissions and grading, and leave applications from parents/students.
import { Router } from 'express'
import { allow, staffOnly } from '../auth.js'
import { Assignment, Batch, Course, CourseProgress, LeaveRequest, Student, Submission } from '../models.js'
import { applyLeaveToAttendance, lessonIds, progressOf } from '../services.js'
import { asyncHandler, httpError, pick, ymd } from '../util.js'
import { blankToNull } from '../crud.js'
import { assertBatch, batchFilter, batchQuery, scopeOf } from '../scope.js'

const router = Router()
const teacher = allow('teacher')

// A course is in scope when at least one of its batches is.
async function courseFilter(req) {
  const scope = await scopeOf(req)
  return scope.all ? {} : { batches: { $in: scope.batchIds } }
}

async function scopedCourse(req, id = req.params.id) {
  const course = await Course.findOne({ _id: id, ...(await courseFilter(req)) })
  if (!course) throw httpError(404, 'Course not found in your wing.')
  return course
}

// Scoped users can only add/remove their own batches; other wings' batches stay as they were.
async function courseBatches(req, requested, previous = []) {
  const scope = await scopeOf(req)
  const asked = (Array.isArray(requested) ? requested : []).filter(Boolean).map(String)
  if (scope.all) return asked
  for (const id of asked) await assertBatch(req, id)
  const others = previous.map(String).filter((id) => !scope.ids.has(id))
  const merged = [...new Set([...others, ...asked])]
  if (!asked.length) throw httpError(422, 'Choose at least one batch of your wing.')
  return merged
}

async function scopedAssignment(req, id = req.params.id) {
  const a = await Assignment.findOne({ _id: id, ...(await batchFilter(req)) })
  if (!a) throw httpError(404, 'Assignment not found.')
  return a
}

/* ── Courses ── */

const COURSE_FIELDS = ['title', 'subject', 'description', 'batches', 'status', 'modules']

// Keeps only known lesson fields and well-formed quiz questions.
function cleanModules(modules) {
  if (!Array.isArray(modules)) return undefined
  return modules.map((m) => ({
    ...(m._id ? { _id: m._id } : {}),
    title: String(m.title || '').trim() || 'Untitled module',
    lessons: (Array.isArray(m.lessons) ? m.lessons : []).map((l) => ({
      ...(l._id ? { _id: l._id } : {}),
      title: String(l.title || '').trim() || 'Untitled lesson',
      kind: ['video', 'reading', 'link', 'quiz'].includes(l.kind) ? l.kind : 'reading',
      url: String(l.url || '').trim() || undefined,
      content: l.content || undefined,
      durationMin: Number(l.durationMin) || undefined,
      questions: l.kind === 'quiz' && Array.isArray(l.questions)
        ? l.questions
          .filter((q) => q.q && Array.isArray(q.options) && q.options.filter(Boolean).length >= 2)
          .map((q) => ({ q: q.q, options: q.options.filter(Boolean), answer: Math.max(0, Number(q.answer) || 0), explanation: q.explanation, marks: Number(q.marks) || 1 }))
          .filter((q) => q.answer < q.options.length)
        : [],
    })),
  }))
}

function courseData(body) {
  const data = blankToNull(pick(body, COURSE_FIELDS))
  if (data.modules !== undefined) data.modules = cleanModules(data.modules)
  if (data.batches !== undefined) data.batches = (Array.isArray(data.batches) ? data.batches : []).filter(Boolean)
  return data
}

const activeStudents = (batchIds) => Student.find({ batch: { $in: batchIds }, status: 'active' }, 'name admissionNo rollNo batch').populate('batch', 'name').sort({ batch: 1, rollNo: 1 }).lean()

router.get('/courses', staffOnly, asyncHandler(async (req, res) => {
  const filter = req.query.batch ? await batchQuery(req, req.query.batch, 'batches') : await courseFilter(req)
  const courses = await Course.find(filter).populate('batches', 'name type').sort({ updatedAt: -1 }).lean()
  // Numbers cover only the batches (and students) this user can see.
  const scope = await scopeOf(req)
  const visible = scope.all ? null : new Set((await Student.distinct('_id', { batch: { $in: scope.batchIds } })).map(String))
  const progress = (await CourseProgress.find({ course: { $in: courses.map((c) => c._id) } }).lean()).filter((p) => !visible || visible.has(String(p.student)))
  const counts = await Student.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$batch', n: { $sum: 1 } } }])
  const perBatch = Object.fromEntries(counts.map((c) => [String(c._id), c.n]))
  res.json(courses.map((c) => {
    const students = c.batches.filter((b) => scope.all || scope.ids.has(String(b._id))).reduce((a, b) => a + (perBatch[String(b._id)] || 0), 0)
    const mine = progress.filter((p) => String(p.course) === String(c._id))
    const pcts = mine.map((p) => progressOf(c, p).pct)
    return {
      ...c,
      modules: undefined,
      moduleCount: c.modules.length,
      lessonCount: lessonIds(c).length,
      students,
      started: mine.length,
      // Students who never opened the course count as 0%.
      avgProgress: students ? Math.round(pcts.reduce((a, p) => a + p, 0) / students) : 0,
    }
  }))
}))

router.get('/courses/:id', staffOnly, asyncHandler(async (req, res) => {
  await scopedCourse(req)
  const course = await Course.findById(req.params.id).populate('batches', 'name type subjects program').lean()
  res.json(course)
}))

router.post('/courses', teacher, asyncHandler(async (req, res) => {
  const data = courseData(req.body)
  data.batches = await courseBatches(req, data.batches)
  const course = await Course.create({ ...data, modules: data.modules || [], createdBy: req.user.id, teacherName: req.user.name })
  res.status(201).json(course)
}))

router.put('/courses/:id', teacher, asyncHandler(async (req, res) => {
  const course = await scopedCourse(req)
  const data = courseData(req.body)
  if (data.batches !== undefined) data.batches = await courseBatches(req, data.batches, course.batches)
  course.set(data)
  await course.save()
  res.json(course)
}))

router.delete('/courses/:id', teacher, asyncHandler(async (req, res) => {
  const course = await scopedCourse(req)
  await course.deleteOne()
  await CourseProgress.deleteMany({ course: course._id })
  await Assignment.updateMany({ course: course._id }, { $unset: { course: 1 } })
  res.json({ ok: true })
}))

// Every student of the course's batches with their completion and quiz average.
router.get('/courses/:id/progress', staffOnly, asyncHandler(async (req, res) => {
  const course = (await scopedCourse(req)).toObject()
  const scope = await scopeOf(req)
  const batches = course.batches.filter((b) => scope.all || scope.ids.has(String(b)))
  const [students, progress] = await Promise.all([activeStudents(batches), CourseProgress.find({ course: course._id }).lean()])
  const byStudent = Object.fromEntries(progress.map((p) => [String(p.student), p]))
  const lessons = course.modules.flatMap((m) => m.lessons)
  const rows = students.map((s) => ({ student: s, ...progressOf(course, byStudent[String(s._id)]) }))
  // Per-lesson completion shows where students drop off.
  const perLesson = lessons.map((l) => ({
    _id: l._id, title: l.title, kind: l.kind,
    done: progress.filter((p) => p.completed.some((c) => String(c.lesson) === String(l._id))).length,
  }))
  // Only count progress of the students this user can see.
  const visible = new Set(students.map((s) => String(s._id)))
  for (const l of perLesson) l.done = progress.filter((p) => visible.has(String(p.student)) && p.completed.some((c) => String(c.lesson) === String(l._id))).length
  res.json({ rows: rows.sort((a, b) => b.pct - a.pct), perLesson, students: students.length })
}))

/* ── Assignments ── */

const ASSIGNMENT_FIELDS = ['title', 'instructions', 'batch', 'subject', 'course', 'url', 'dueDate', 'maxMarks', 'allowLate', 'status']

router.get('/assignments', staffOnly, asyncHandler(async (req, res) => {
  const filter = await batchQuery(req, req.query.batch)
  if (req.query.status) filter.status = req.query.status
  const list = await Assignment.find(filter).populate('batch', 'name type').populate('course', 'title').sort({ dueDate: -1 }).limit(300).lean()
  const [subs, counts] = await Promise.all([
    Submission.aggregate([
      { $match: { assignment: { $in: list.map((a) => a._id) } } },
      { $group: { _id: '$assignment', submitted: { $sum: { $cond: [{ $ne: ['$status', 'returned'] }, 1, 0] } }, graded: { $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] } } } },
    ]),
    Student.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$batch', n: { $sum: 1 } } }]),
  ])
  const bySub = Object.fromEntries(subs.map((s) => [String(s._id), s]))
  const perBatch = Object.fromEntries(counts.map((c) => [String(c._id), c.n]))
  res.json(list.map((a) => ({
    ...a,
    students: perBatch[String(a.batch?._id)] || 0,
    submitted: bySub[String(a._id)]?.submitted || 0,
    graded: bySub[String(a._id)]?.graded || 0,
  })))
}))

router.post('/assignments', teacher, asyncHandler(async (req, res) => {
  const data = blankToNull(pick(req.body, ASSIGNMENT_FIELDS))
  if (!(await Batch.exists({ _id: data.batch }))) throw httpError(422, 'Choose a batch.')
  await assertBatch(req, data.batch)
  res.status(201).json(await Assignment.create({ ...data, createdBy: req.user.id, teacherName: req.user.name }))
}))

router.put('/assignments/:id', teacher, asyncHandler(async (req, res) => {
  await scopedAssignment(req)
  if (req.body.batch) await assertBatch(req, req.body.batch)
  const a = await Assignment.findByIdAndUpdate(req.params.id, blankToNull(pick(req.body, ASSIGNMENT_FIELDS)), { returnDocument: 'after', runValidators: true })
  if (!a) throw httpError(404, 'Assignment not found.')
  res.json(a)
}))

router.delete('/assignments/:id', teacher, asyncHandler(async (req, res) => {
  const a = await scopedAssignment(req)
  await a.deleteOne()
  await Submission.deleteMany({ assignment: a._id })
  res.json({ ok: true })
}))

// The assignment with one row per student of the batch (submitted or not).
router.get('/assignments/:id', staffOnly, asyncHandler(async (req, res) => {
  await scopedAssignment(req)
  const a = await Assignment.findById(req.params.id).populate('batch', 'name type').populate('course', 'title').lean()
  if (!a) throw httpError(404, 'Assignment not found.')
  const [students, subs] = await Promise.all([activeStudents([a.batch._id]), Submission.find({ assignment: a._id }).lean()])
  const bySub = Object.fromEntries(subs.map((s) => [String(s.student), s]))
  res.json({ assignment: a, rows: students.map((s) => ({ student: s, submission: bySub[String(s._id)] || null })) })
}))

// Grades a student's work (also for work handed in on paper), or returns it for resubmission.
router.put('/assignments/:id/grade/:student', teacher, asyncHandler(async (req, res) => {
  const a = (await scopedAssignment(req)).toObject()
  if (!(await Student.exists({ _id: req.params.student, batch: a.batch }))) throw httpError(404, 'Student is not in this batch.')
  const status = req.body.status === 'returned' ? 'returned' : 'graded'
  const marks = req.body.marks === '' || req.body.marks == null ? undefined : Number(req.body.marks)
  if (status === 'graded' && (marks == null || Number.isNaN(marks) || marks < 0 || marks > a.maxMarks)) throw httpError(422, `Marks must be between 0 and ${a.maxMarks}.`)
  const update = {
    $set: { status, feedback: String(req.body.feedback || '').slice(0, 5000), gradedBy: req.user.name, gradedAt: new Date() },
    $setOnInsert: { text: '(Submitted offline)', submittedAt: new Date(), late: ymd() > a.dueDate },
  }
  if (status === 'graded') update.$set.marks = marks
  else update.$unset = { marks: 1 }
  const sub = await Submission.findOneAndUpdate({ assignment: a._id, student: req.params.student }, update, { upsert: true, returnDocument: 'after', runValidators: true })
  res.json(sub)
}))

/* ── Leave applications ── */

router.get('/leaves', staffOnly, asyncHandler(async (req, res) => {
  const filter = await batchQuery(req, req.query.batch)
  if (req.query.status) filter.status = req.query.status
  res.json(await LeaveRequest.find(filter).populate('student', 'name admissionNo rollNo guardianName guardianPhone').populate('batch', 'name').sort({ status: -1, from: -1 }).limit(300).lean())
}))

router.get('/leaves/pending-count', staffOnly, asyncHandler(async (req, res) => {
  res.json({ count: await LeaveRequest.countDocuments({ status: 'pending', ...(await batchFilter(req)) }) })
}))

router.put('/leaves/:id', teacher, asyncHandler(async (req, res) => {
  const status = req.body.status
  if (!['approved', 'rejected'].includes(status)) throw httpError(422, 'Choose approve or reject.')
  const leave = await LeaveRequest.findOne({ _id: req.params.id, ...(await batchFilter(req)) })
  if (!leave) throw httpError(404, 'Leave application not found.')
  if (leave.status !== 'pending') throw httpError(409, `This application is already ${leave.status}.`)
  Object.assign(leave, { status, reviewNote: String(req.body.note || '').slice(0, 1000), reviewedBy: req.user.name, reviewedAt: new Date() })
  await leave.save()
  const marked = status === 'approved' ? await applyLeaveToAttendance(leave) : 0
  res.json({ leave, marked })
}))

export default router
