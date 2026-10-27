// Examination: grade scales, the date sheet (paper-wise schedule with clash checks),
// admit cards, bulk report cards and combined term reports. Exam CRUD and marks
// entry stay in academics.js; they call `prepareExam` from here before saving.
import { Router } from 'express'
import { allow, staffOnly } from '../auth.js'
import { Exam, GradeScale, Mark, Staff, Student } from '../models.js'
import { attendanceSummary, feeSummaryByStudent, getSettings } from '../insights.js'
import { ensureGradeScales, gradeBand, recomputeExam, scaleForExam } from '../services.js'
import { asyncHandler, httpError, pick } from '../util.js'
import { assertBatch, batchFilter, batchQuery } from '../scope.js'

const router = Router()
const teacher = allow('teacher')

async function scopedExam(req, id = req.params.id) {
  const exam = await Exam.findOne({ _id: id, ...(await batchFilter(req)) })
  if (!exam) throw httpError(404, 'Exam not found in your wing.')
  return exam
}

const overlaps = (a, b) => a.date && a.date === b.date && a.start && a.end && b.start && b.end && a.start < b.end && b.start < a.end
const sameRoom = (a, b) => a.room && b.room && a.room.trim().toLowerCase() === b.room.trim().toLowerCase()
const sameInvigilator = (a, b) => a.invigilator && b.invigilator && String(a.invigilator._id || a.invigilator) === String(b.invigilator._id || b.invigilator)

// Every clash between `paper` (of `exam`) and the other papers: same class, same room or same invigilator at the same time.
function clashesOf(exam, paper, others) {
  const found = []
  for (const other of others) {
    for (const p of other.subjects) {
      if (other === exam && p === paper) continue
      if (!overlaps(paper, p)) continue
      const where = `${other.name} - ${p.name} (${other.batch?.name || 'batch'}, ${p.start}-${p.end})`
      if (String(other.batch?._id || other.batch) === String(exam.batch?._id || exam.batch)) found.push(`Class already has ${where}`)
      else if (sameRoom(paper, p)) found.push(`Room ${p.room} is taken by ${where}`)
      else if (sameInvigilator(paper, p)) found.push(`Invigilator is on duty for ${where}`)
    }
  }
  return found
}

// Cleans the subjects/schedule of an exam being saved and rejects clashes. `data.batch` must be set.
export async function prepareExam(data, examId) {
  if (data.subjects) {
    const seen = new Set()
    data.subjects = data.subjects.filter((s) => s.name?.trim()).map((s) => {
      const name = s.name.trim()
      if (seen.has(name.toLowerCase())) throw httpError(422, `${name} is listed twice.`)
      seen.add(name.toLowerCase())
      const maxMarks = Number(s.maxMarks) || 100
      const passMarks = s.passMarks === '' || s.passMarks == null ? undefined : Number(s.passMarks)
      if (passMarks != null && (passMarks < 0 || passMarks > maxMarks)) throw httpError(422, `Pass marks of ${name} must be between 0 and ${maxMarks}.`)
      const paper = { name, maxMarks, passMarks, date: s.date || undefined, start: s.start || undefined, end: s.end || undefined, room: s.room?.trim() || undefined, invigilator: s.invigilator || undefined }
      if (s._id) paper._id = s._id
      if (paper.start && paper.end && paper.start >= paper.end) throw httpError(422, `${name}: end time must be after the start time.`)
      return paper
    })
    const dates = data.subjects.map((s) => s.date).filter(Boolean).sort()
    if (dates.length) data.date = dates[0]
    if (dates.length) {
      const self = { _id: examId, name: data.name || 'This exam', batch: data.batch, subjects: data.subjects }
      const others = await Exam.find({ _id: { $ne: examId }, 'subjects.date': { $in: dates } }, 'name batch subjects').populate('batch', 'name').lean()
      for (const paper of data.subjects) {
        const clash = clashesOf(self, paper, [self, ...others])[0]
        if (clash) throw httpError(409, `${paper.name} on ${paper.date}: ${clash}.`)
      }
    }
  }
  if (data.gradeScale === '') data.gradeScale = null
  return data
}

/* ── Grade scales ── */

const SCALE_FIELDS = ['name', 'appliesTo', 'passPercent', 'bands']

function cleanScale(data) {
  if (data.bands) {
    data.bands = data.bands.filter((b) => b.grade?.trim()).map((b) => ({ min: Number(b.min) || 0, grade: b.grade.trim(), point: b.point === '' || b.point == null ? undefined : Number(b.point), remark: b.remark?.trim() || undefined }))
    if (!data.bands.length) throw httpError(422, 'Add at least one grade.')
    if (new Set(data.bands.map((b) => b.min)).size !== data.bands.length) throw httpError(422, 'Two grades start at the same percentage.')
    if (!data.bands.some((b) => b.min === 0)) throw httpError(422, 'The lowest grade must start at 0%.')
    data.bands.sort((a, b) => b.min - a.min)
  }
  return data
}

router.get('/exams/grade-scales', staffOnly, asyncHandler(async (req, res) => {
  await ensureGradeScales()
  const [scales, usage] = await Promise.all([
    GradeScale.find().sort({ createdAt: 1 }).lean(),
    Exam.aggregate([{ $match: { gradeScale: { $ne: null } } }, { $group: { _id: '$gradeScale', n: { $sum: 1 } } }]),
  ])
  const used = Object.fromEntries(usage.map((u) => [String(u._id), u.n]))
  res.json(scales.map((s) => ({ ...s, exams: used[String(s._id)] || 0 })))
}))

// A wing has one default scale, so taking a wing away from the other scales keeps it unambiguous.
async function claimWings(scale) {
  if (scale.appliesTo?.length) await GradeScale.updateMany({ _id: { $ne: scale._id } }, { $pull: { appliesTo: { $in: scale.appliesTo } } })
}

async function regradeExams(scaleId, appliesTo) {
  const exams = await Exam.find({ $or: [{ gradeScale: scaleId }, { gradeScale: null }] }, '_id batch gradeScale').populate('batch', 'type').lean()
  for (const e of exams) if (e.gradeScale || appliesTo?.includes(e.batch?.type)) await recomputeExam(e._id)
}

router.post('/exams/grade-scales', allow(), asyncHandler(async (req, res) => {
  const scale = await GradeScale.create(cleanScale(pick(req.body, SCALE_FIELDS)))
  await claimWings(scale)
  await regradeExams(scale._id, scale.appliesTo)
  res.status(201).json(scale)
}))

router.put('/exams/grade-scales/:id', allow(), asyncHandler(async (req, res) => {
  const scale = await GradeScale.findByIdAndUpdate(req.params.id, cleanScale(pick(req.body, SCALE_FIELDS)), { returnDocument: 'after', runValidators: true })
  if (!scale) throw httpError(404, 'Grade scale not found.')
  await claimWings(scale)
  // Grades already given change with the scale, so every affected exam is re-graded.
  await regradeExams(scale._id, scale.appliesTo)
  res.json(scale)
}))

router.delete('/exams/grade-scales/:id', allow(), asyncHandler(async (req, res) => {
  const n = await Exam.countDocuments({ gradeScale: req.params.id })
  if (n) throw httpError(409, `${n} exam(s) use this scale. Switch them to another scale first.`)
  if ((await GradeScale.countDocuments()) <= 1) throw httpError(409, 'Keep at least one grade scale.')
  await GradeScale.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
}))

/* ── Date sheet ── */

// Every scheduled paper in range, in date/time order, with clashes flagged.
router.get('/exams/schedule', staffOnly, asyncHandler(async (req, res) => {
  const { from, to } = req.query
  const filter = await batchQuery(req, req.query.batch)
  const exams = await Exam.find(filter).populate('batch', 'name type').populate('subjects.invigilator', 'name').lean()
  // Clashes are checked against every exam on those dates, including other wings (rooms and staff are shared).
  const dates = [...new Set(exams.flatMap((e) => e.subjects.map((s) => s.date)).filter(Boolean))]
  const all = await Exam.find({ 'subjects.date': { $in: dates } }, 'name batch subjects').populate('batch', 'name').lean()
  const byId = Object.fromEntries(all.map((e) => [String(e._id), e]))
  const rows = []
  for (const exam of exams) {
    for (const paper of exam.subjects) {
      if (!paper.date || (from && paper.date < from) || (to && paper.date > to)) continue
      const self = byId[String(exam._id)] || exam
      const selfPaper = self.subjects.find((p) => String(p._id) === String(paper._id)) || paper
      rows.push({
        exam: { _id: exam._id, name: exam.name, type: exam.type, term: exam.term, admitCards: exam.admitCards, published: exam.published },
        batch: exam.batch,
        paper,
        clashes: clashesOf(self, selfPaper, all.map((e) => (String(e._id) === String(exam._id) ? self : e))),
      })
    }
  }
  rows.sort((a, b) => `${a.paper.date}${a.paper.start || ''}`.localeCompare(`${b.paper.date}${b.paper.start || ''}`) || a.batch.name.localeCompare(b.batch.name))
  const unscheduled = exams.filter((e) => e.subjects.some((s) => !s.date)).map((e) => ({ _id: e._id, name: e.name, batch: e.batch, missing: e.subjects.filter((s) => !s.date).map((s) => s.name) }))
  res.json({ rows, unscheduled })
}))

/* ── Admit cards ── */

// Who may get an admit card: withheld while fees are overdue when the exam asks for it.
export async function admitCardData(exam, studentIds) {
  const students = await Student.find(studentIds ? { _id: { $in: studentIds } } : { batch: exam.batch._id, status: 'active' }).sort({ rollNo: 1, name: 1 }).lean()
  const [fees, institute] = await Promise.all([feeSummaryByStudent(students.map((s) => s._id)), getSettings()])
  const allowed = new Set((exam.admitAllowed || []).map(String))
  return {
    exam,
    institute,
    students: students.map((s) => {
      const overdue = fees.get(String(s._id))?.overdue || 0
      return { student: s, overdue, held: !!exam.holdOnDues && overdue > 0 && !allowed.has(String(s._id)), allowed: allowed.has(String(s._id)) }
    }),
  }
}

export const loadExamForCards = (filter) => Exam.findOne(filter).populate('batch', 'name type program section').populate('subjects.invigilator', 'name').lean()

router.get('/exams/:id/admit-cards', staffOnly, asyncHandler(async (req, res) => {
  await scopedExam(req)
  res.json(await admitCardData(await loadExamForCards({ _id: req.params.id })))
}))

router.put('/exams/:id/admit-cards', teacher, asyncHandler(async (req, res) => {
  const exam = await scopedExam(req)
  Object.assign(exam, pick(req.body, ['admitCards', 'holdOnDues', 'admitAllowed', 'instructions']))
  if (exam.admitCards && exam.subjects.some((s) => !s.date)) throw httpError(422, 'Schedule every paper (date and time) before releasing admit cards.')
  await exam.save()
  res.json(exam)
}))

/* ── Report cards ── */

// Every student's report card for one exam, for bulk printing.
router.get('/exams/:id/report-cards', staffOnly, asyncHandler(async (req, res) => {
  await scopedExam(req)
  const exam = await Exam.findById(req.params.id).populate('batch', 'name type program classTeacher').lean()
  const marks = await Mark.find({ exam: exam._id, percent: { $ne: null } }).populate('student').lean()
  const [institute, att, scale] = await Promise.all([
    getSettings(),
    attendanceSummary({ studentIds: marks.map((m) => m.student._id), days: 90 }),
    scaleForExam(exam),
  ])
  marks.sort((a, b) => (a.student.rollNo ?? 9999) - (b.student.rollNo ?? 9999) || a.student.name.localeCompare(b.student.name))
  res.json(marks.map((mark) => ({ exam, student: mark.student, mark, outOf: marks.length, attendance: att.get(String(mark.student._id)) || null, institute, scale })))
}))

// Combined term result: each subject's percentage is the weighted average over the chosen exams.
// `exams` = "examId:weight,examId:weight".
export async function termReport({ batch, exams: spec, student }) {
  const parts = String(spec || '').split(',').map((p) => p.split(':')).filter(([id]) => id)
  if (!parts.length) throw httpError(422, 'Choose at least one exam.')
  const exams = await Exam.find({ _id: { $in: parts.map(([id]) => id) }, batch }).populate('batch', 'name type program classTeacher').lean()
  if (exams.length !== parts.length) throw httpError(422, 'Every exam must belong to the chosen class.')
  const weight = Object.fromEntries(parts.map(([id, w]) => [id, Math.max(0, Number(w) || 0)]))
  const order = parts.map(([id]) => id)
  exams.sort((a, b) => order.indexOf(String(a._id)) - order.indexOf(String(b._id)))
  const [marks, students, scale, institute] = await Promise.all([
    Mark.find({ exam: { $in: exams.map((e) => e._id) } }).lean(),
    Student.find({ batch, status: { $in: ['active', 'passed'] } }).sort({ rollNo: 1, name: 1 }).lean(),
    scaleForExam(exams[0]),
    getSettings(),
  ])
  const subjects = [...new Set(exams.flatMap((e) => e.subjects.map((s) => s.name)))]
  const maxOf = Object.fromEntries(exams.map((e) => [String(e._id), Object.fromEntries(e.subjects.map((s) => [s.name, s.maxMarks]))]))
  const markOf = Object.fromEntries(marks.map((m) => [`${m.exam}|${m.student}`, m]))

  const rows = students.map((s) => {
    const perExam = exams.map((e) => markOf[`${e._id}|${s._id}`] || null)
    const subjectRows = subjects.map((name) => {
      let sum = 0
      let w = 0
      const cells = exams.map((e, i) => {
        const score = perExam[i]?.scores.find((x) => x.subject === name)
        const max = maxOf[String(e._id)][name]
        if (!score || max == null) return null
        const pct = score.absent ? 0 : (score.marks / max) * 100
        sum += pct * weight[String(e._id)]
        w += weight[String(e._id)]
        return { marks: score.absent ? 'AB' : score.marks, max }
      })
      const percent = w ? Math.round((sum / w) * 10) / 10 : null
      const band = gradeBand(percent, scale)
      return { name, cells, percent, grade: band?.grade ?? null, point: band?.point ?? null }
    })
    const graded = subjectRows.filter((r) => r.percent != null)
    const percent = graded.length ? Math.round((graded.reduce((t, r) => t + r.percent, 0) / graded.length) * 10) / 10 : null
    const band = gradeBand(percent, scale)
    const points = graded.filter((r) => r.point != null)
    const failedIn = graded.filter((r) => r.percent < scale.passPercent).map((r) => r.name)
    return {
      student: s,
      exams: perExam.map((m) => (m ? { percent: m.percent, grade: m.grade, rank: m.rank } : null)),
      subjects: subjectRows,
      percent,
      grade: band?.grade ?? null,
      gpa: points.length ? Math.round((points.reduce((t, r) => t + r.point, 0) / points.length) * 10) / 10 : null,
      result: percent == null ? null : failedIn.length || percent < scale.passPercent ? 'fail' : 'pass',
      failedIn,
      remark: band?.remark || '',
    }
  })
  const ranked = rows.filter((r) => r.percent != null).sort((a, b) => b.percent - a.percent)
  ranked.forEach((r, i) => { r.rank = i > 0 && ranked[i - 1].percent === r.percent ? ranked[i - 1].rank : i + 1 })
  const att = await attendanceSummary({ studentIds: students.map((s) => s._id), days: 365 })
  rows.forEach((r) => { r.attendance = att.get(String(r.student._id)) || null })
  return {
    batch: exams[0].batch,
    exams: exams.map((e) => ({ _id: e._id, name: e.name, type: e.type, term: e.term, date: e.date, weight: weight[String(e._id)] })),
    subjects,
    scale,
    institute,
    outOf: ranked.length,
    rows: student ? rows.filter((r) => String(r.student._id) === String(student)) : rows,
  }
}

router.get('/exams/term-report', staffOnly, asyncHandler(async (req, res) => {
  await assertBatch(req, req.query.batch)
  res.json(await termReport(req.query))
}))

// Staff list for the invigilator picker (teachers can't open the staff directory).
router.get('/exams/invigilators', staffOnly, asyncHandler(async (req, res) => {
  res.json(await Staff.find({ status: 'active' }, 'name designation').sort({ name: 1 }).lean())
}))

export default router
