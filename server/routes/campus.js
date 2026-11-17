// Academic calendar (holidays, events, PTMs + exam papers from the date sheets) and
// the banners shown at the top of the student / parent home screen.
import { Router } from 'express'
import { allow, staffOnly } from '../auth.js'
import { crudRouter } from '../crud.js'
import { Banner, Batch, CalendarEvent, Exam, INSTITUTION_TYPES, StoredFile } from '../models.js'
import { assertBatch, batchFilter, scopeOf } from '../scope.js'
import { asyncHandler, httpError, ymd } from '../util.js'

const router = Router()
const editors = allow('teacher', 'counsellor', 'accountant')
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))

// Which calendar events a user sees (read) or may change (write). An event is for the
// whole institute (no wing, no batch), one wing, or one batch.
async function eventScope(req, mode = 'read') {
  const scope = await scopeOf(req)
  if (scope.all) return {}
  const mine = [{ wing: { $in: scope.wings } }, { batch: { $in: scope.batchIds } }]
  return { $or: mode === 'read' ? [{ wing: null, batch: null }, ...mine] : mine }
}

// Events for one student: institute-wide, their wing, or their batch.
const studentEvents = (student) => ({ $or: [{ wing: null, batch: null }, { batch: null, wing: student.batch.type }, { batch: student.batch._id }] })

// First and last day of a "YYYY-MM" month (default: this month).
export function monthRange(month) {
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) ? month : ymd().slice(0, 7)
  const [y, mo] = m.split('-').map(Number)
  const last = new Date(y, mo, 0).getDate()
  return { month: m, from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` }
}

// Calendar items between two dates: events (limited by `events` filter and audience)
// plus every exam paper on the date sheets matched by `exams`.
export async function calendarFeed({ from, to, events: eventFilter = {}, exams: examFilter = {}, audiences = ['all', 'students', 'parents', 'staff'] }) {
  const [events, exams] = await Promise.all([
    CalendarEvent.find({
      $and: [
        { start: { $lte: to } },
        { $or: [{ end: { $gte: from } }, { start: { $gte: from } }] },
        { audience: { $in: audiences } },
        eventFilter,
      ],
    }).populate('batch', 'name').sort({ start: 1 }).lean(),
    Exam.find({ ...examFilter, 'subjects.date': { $gte: from, $lte: to } }, 'name batch subjects term').populate('batch', 'name').lean(),
  ])
  const items = events.map((e) => ({ _id: String(e._id), source: 'event', title: e.title, type: e.type, start: e.start, end: e.end && e.end > e.start ? e.end : e.start, description: e.description, audience: e.audience, wing: e.wing || null, batch: e.batch || null }))
  for (const exam of exams) {
    for (const p of exam.subjects) {
      if (!p.date || p.date < from || p.date > to) continue
      items.push({
        _id: `${exam._id}-${p._id}`, source: 'exam', examId: String(exam._id), title: `${exam.name}: ${p.name}`, type: 'exam',
        start: p.date, end: p.date, time: p.start ? `${p.start}${p.end ? `–${p.end}` : ''}` : null, room: p.room, batch: exam.batch || null,
      })
    }
  }
  return items.sort((a, b) => a.start.localeCompare(b.start) || (a.time || '').localeCompare(b.time || ''))
}

// Calendar of one student (portal / parent portal).
export const studentCalendar = ({ from, to, student, audiences }) => calendarFeed({ from, to, events: studentEvents(student), exams: { batch: student.batch._id }, audiences })

// Banners currently running for an audience.
export async function activeBanners(audiences) {
  const today = ymd()
  return Banner.find({
    active: true,
    audience: { $in: audiences },
    $and: [
      { $or: [{ startDate: null }, { startDate: '' }, { startDate: { $lte: today } }] },
      { $or: [{ endDate: null }, { endDate: '' }, { endDate: { $gte: today } }] },
    ],
  }, 'title subtitle image link').sort({ order: 1, createdAt: -1 }).limit(8).lean()
}

/* ── Calendar (staff) ── */

router.get('/calendar/feed', staffOnly, asyncHandler(async (req, res) => {
  const { month, from, to } = monthRange(req.query.month)
  res.json({ month, items: await calendarFeed({ from, to, events: await eventScope(req), exams: await batchFilter(req) }) })
}))

router.use('/calendar', crudRouter(CalendarEvent, {
  fields: ['title', 'type', 'start', 'end', 'description', 'audience', 'wing', 'batch'],
  search: ['title', 'description'],
  filters: ['type', 'audience', 'batch', 'wing'],
  populate: 'batch',
  sort: { start: 1 },
  read: staffOnly,
  write: editors,
  scope: eventScope,
  beforeSave: async (data, req, id) => {
    if (data.start !== undefined && !isDate(data.start)) throw httpError(422, 'Choose the date.')
    if (data.end && !isDate(data.end)) data.end = null
    if (data.end && data.start && data.end < data.start) throw httpError(422, 'The end date cannot be before the start date.')
    if (data.wing && !INSTITUTION_TYPES.includes(data.wing)) data.wing = null
    data.createdBy = req.user.name
    // An edit that does not touch who the event is for keeps it as it was.
    if (id && data.wing === undefined && data.batch === undefined) return
    const scope = await scopeOf(req)
    if (data.batch) {
      await assertBatch(req, data.batch)
      data.wing = (await Batch.findById(data.batch, 'type').lean())?.type || null
    } else if (!scope.all) {
      // Wing admins / staff put events on their own wing's calendar.
      data.batch = null
      if (!data.wing) data.wing = scope.wings[0]
      if (!scope.wings.includes(data.wing)) throw httpError(403, `You can only add events for the ${scope.wings.join(' / ')} wing.`)
    }
  },
}))

/* ── Banners (staff) ── */

router.use('/banners', crudRouter(Banner, {
  fields: ['title', 'subtitle', 'image', 'link', 'audience', 'active', 'order', 'startDate', 'endDate'],
  search: ['title', 'subtitle'],
  filters: ['audience'],
  sort: { order: 1, createdAt: -1 },
  read: staffOnly,
  write: editors,
  beforeSave: async (data, req) => {
    if (data.image !== undefined && !(await StoredFile.exists({ _id: data.image, purpose: 'banner' }))) throw httpError(422, 'Upload the banner picture.')
    if (data.link && !/^(\/[^/]|https?:\/\/)/i.test(data.link)) throw httpError(422, 'The link must be a page of the portal (starting with /) or a web address (https://…).')
    if (data.order !== undefined) data.order = Number(data.order) || 0
    data.createdBy = req.user.name
  },
}))

export default router
