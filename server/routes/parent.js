// Parent portal. A parent account is linked to one or more children (siblings share
// one login). Each child's records are served by the student portal's shared views,
// mounted under /children/:child after checking the child belongs to this parent.
import { Router } from 'express'
import { Assignment, FeeInstallment, Submission, User } from '../models.js'
import { attendanceSummary, installmentStatus } from '../insights.js'
import { coursesForStudent } from '../services.js'
import { loadStudent, views } from './portal.js'
import { asyncHandler, httpError, ymd } from '../util.js'

const router = Router()

router.use(asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'parent') throw httpError(403, 'Parent portal only.')
  const user = await User.findById(req.user.id, 'children active').lean()
  if (!user?.active) throw httpError(401, 'Please log in.')
  req.childIds = (user.children || []).map(String)
  next()
}))

// One card per child: the numbers a parent checks first.
router.get('/children', asyncHandler(async (req, res) => {
  const children = (await Promise.all(req.childIds.map(loadStudent))).filter(Boolean)
  const ids = children.map((c) => c._id)
  const today = ymd()
  const [att, installments, subs] = await Promise.all([
    attendanceSummary({ studentIds: ids }),
    FeeInstallment.find({ student: { $in: ids } }).lean(),
    Submission.find({ student: { $in: ids } }, 'assignment student status').lean(),
  ])
  const assignments = await Assignment.find({ batch: { $in: children.map((c) => c.batch?._id) }, status: 'published' }, 'batch dueDate').lean()
  const out = []
  for (const c of children) {
    const fees = installments.filter((i) => String(i.student) === String(c._id)).map((i) => ({ ...i, ...installmentStatus(i, today) }))
    const done = new Set(subs.filter((s) => String(s.student) === String(c._id) && s.status !== 'returned').map((s) => String(s.assignment)))
    const pending = assignments.filter((a) => String(a.batch) === String(c.batch?._id) && !done.has(String(a._id)))
    const courses = await coursesForStudent(c)
    out.push({
      _id: c._id, name: c.name, admissionNo: c.admissionNo, rollNo: c.rollNo, status: c.status,
      batch: c.batch && { _id: c.batch._id, name: c.batch.name, type: c.batch.type, program: c.batch.program, classTeacher: c.batch.classTeacher },
      attendance: att.get(String(c._id)) || null,
      feeBalance: fees.reduce((a, f) => a + f.balance, 0),
      feeOverdue: fees.filter((f) => f.status === 'overdue').reduce((a, f) => a + f.balance, 0),
      pendingAssignments: pending.length,
      overdueAssignments: pending.filter((a) => a.dueDate < today).length,
      courseProgress: courses.length ? Math.round(courses.reduce((a, x) => a + x.pct, 0) / courses.length) : null,
    })
  }
  res.json(out)
}))

router.use('/children/:child', asyncHandler(async (req, res, next) => {
  if (!req.childIds.includes(req.params.child)) throw httpError(404, 'This student is not linked to your account.')
  req.student = await loadStudent(req.params.child)
  if (!req.student) throw httpError(404, 'Student record not found.')
  next()
}), views)

export default router
