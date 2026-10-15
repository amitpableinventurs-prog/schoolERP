// Certificates: templates with {{placeholders}}, bulk issue with serial numbers,
// printable copies, revocation, and a public verification lookup.
import { Router } from 'express'
import { allow } from '../auth.js'
import { Certificate, CertificateTemplate, CERT_KINDS, CERT_STYLES, Student } from '../models.js'
import { feeSummaryByStudent, getSettings } from '../insights.js'
import { asyncHandler, escapeRegex, httpError, pick, ymd } from '../util.js'
import { assertBatch, batchFilter, batchInScope, scopeOf } from '../scope.js'

const router = Router()
const issuers = allow('teacher', 'accountant')
const adminsOnly = allow()

// Placeholders a template may use. `extra` ones are typed in when issuing.
export const CERT_FIELDS = {
  name: 'Student name', father: 'Father / guardian name', class: 'Class / batch', wing: 'School / College / Coaching',
  admissionNo: 'Admission no.', rollNo: 'Roll no.', dob: 'Date of birth', admissionDate: 'Admission date',
  session: 'Academic session', date: 'Issue date', institute: 'Institute name',
  salutation: 'Mr. / Ms.', sonDaughter: 'son / daughter', his: 'his / her', His: 'His / Her', he: 'he / she', He: 'He / She',
  purpose: 'Purpose (typed in)', conduct: 'Conduct (typed in)', reason: 'Reason for leaving (typed in)',
  achievement: 'Achievement (typed in)', event: 'Event (typed in)', eventDate: 'Event date (typed in)',
  course: 'Course name (typed in)', remarks: 'Remarks (typed in)',
}
export const EXTRA_FIELDS = ['purpose', 'conduct', 'reason', 'achievement', 'event', 'eventDate', 'course', 'remarks']

const KIND_CODE = { bonafide: 'BON', character: 'CHR', transfer: 'TC', merit: 'MER', participation: 'PAR', completion: 'CMP', custom: 'CRT' }

const DEFAULT_TEMPLATES = [
  {
    name: 'Bonafide Certificate', kind: 'bonafide', heading: 'Bonafide Certificate', style: 'classic', orientation: 'portrait',
    signatories: ['Class Teacher', 'Principal'],
    body: 'This is to certify that {{salutation}} {{name}}, {{sonDaughter}} of {{father}}, is a bonafide student of {{institute}}, studying in {{class}} during the academic session {{session}}.\n\n{{His}} admission number is {{admissionNo}} and {{his}} date of birth as per our records is {{dob}}.\n\nThis certificate is issued on {{his}} request for the purpose of {{purpose}}.',
  },
  {
    name: 'Character Certificate', kind: 'character', heading: 'Character Certificate', style: 'elegant', orientation: 'portrait',
    signatories: ['Class Teacher', 'Principal'],
    body: 'This is to certify that {{salutation}} {{name}}, {{sonDaughter}} of {{father}}, has been a student of {{institute}} since {{admissionDate}} and is presently in {{class}}.\n\nTo the best of our knowledge, {{he}} bears a {{conduct}} moral character. {{He}} has not taken part in any activity against the rules of the institution.\n\nWe wish {{him}} every success in life.',
  },
  {
    name: 'Transfer / Leaving Certificate', kind: 'transfer', heading: 'Transfer Certificate', style: 'classic', orientation: 'portrait',
    signatories: ['Class Teacher', 'Office In-charge', 'Principal'],
    body: 'This is to certify that {{salutation}} {{name}}, {{sonDaughter}} of {{father}}, admission number {{admissionNo}}, date of birth {{dob}}, was a student of {{institute}} from {{admissionDate}} and studied in {{class}} during the session {{session}}.\n\n{{He}} has cleared all dues of the institution. {{His}} conduct during the period of study was {{conduct}}.\n\nReason for leaving: {{reason}}.',
  },
  {
    name: 'Certificate of Merit', kind: 'merit', heading: 'Certificate of Merit', style: 'royal', orientation: 'landscape',
    signatories: ['Class Teacher', 'Principal'],
    body: 'This certificate is proudly presented to\n{{name}}\nof {{class}} for securing {{achievement}} in {{event}}.\n\nWe appreciate {{his}} hard work and dedication.',
  },
  {
    name: 'Certificate of Participation', kind: 'participation', heading: 'Certificate of Participation', style: 'modern', orientation: 'landscape',
    signatories: ['Event Co-ordinator', 'Principal'],
    body: 'This is to certify that\n{{name}}\nof {{class}} has actively participated in {{event}} held on {{eventDate}}.\n\nWe thank {{him}} for the enthusiasm shown.',
  },
  {
    name: 'Course Completion Certificate', kind: 'completion', heading: 'Certificate of Completion', style: 'modern', orientation: 'landscape',
    signatories: ['Faculty', 'Director'],
    body: 'This is to certify that\n{{name}}\nhas successfully completed the {{course}} programme at {{institute}} during the session {{session}}.\n\n{{remarks}}',
  },
]
// {{him}} is accepted too (him / her).
CERT_FIELDS.him = 'him / her'

async function ensureDefaults() {
  if (await CertificateTemplate.exists({})) return
  await CertificateTemplate.insertMany(DEFAULT_TEMPLATES.map((t) => ({ ...t, code: KIND_CODE[t.kind] })))
}

const fmt = (s) => {
  if (!s) return '—'
  const d = new Date(`${String(s).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

// Fills a template's text for one student.
export function fillTemplate(text, student, settings, extras, issuedOn) {
  const g = student.gender
  const values = {
    name: student.name, father: student.guardianName || '—', class: student.batch?.name || '—',
    wing: { school: 'School', college: 'College', coaching: 'Coaching' }[student.batch?.type] || '',
    admissionNo: student.admissionNo, rollNo: student.rollNo ?? '—', dob: fmt(student.dob), admissionDate: fmt(student.admissionDate),
    session: settings.academicYear || '', date: fmt(issuedOn), institute: settings.instituteName || '',
    salutation: g === 'female' ? 'Ms.' : g === 'male' ? 'Mr.' : 'Mx.',
    sonDaughter: g === 'female' ? 'daughter' : g === 'male' ? 'son' : 'child',
    his: g === 'female' ? 'her' : g === 'male' ? 'his' : 'their', His: g === 'female' ? 'Her' : g === 'male' ? 'His' : 'Their',
    he: g === 'female' ? 'she' : g === 'male' ? 'he' : 'they', He: g === 'female' ? 'She' : g === 'male' ? 'He' : 'They',
    him: g === 'female' ? 'her' : g === 'male' ? 'him' : 'them',
    conduct: 'good',
    ...Object.fromEntries(EXTRA_FIELDS.filter((k) => extras?.[k]).map((k) => [k, k === 'eventDate' ? fmt(extras[k]) : String(extras[k]).trim()])),
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key) => (values[key] != null && values[key] !== '' ? values[key] : `____________`))
}

async function nextSerials(code, count) {
  const prefix = `${code}-${ymd().slice(0, 4)}-`
  const last = await Certificate.findOne({ serialNo: { $regex: `^${escapeRegex(prefix)}` } }).sort({ serialNo: -1 }).lean()
  const start = last ? Number(last.serialNo.slice(prefix.length)) + 1 : 1
  return Array.from({ length: count }, (_, i) => `${prefix}${String(start + i).padStart(5, '0')}`)
}

const loadStudents = (ids) => Student.find({ _id: { $in: ids } }).populate('batch', 'name type').lean()

/* ── Templates ── */

const TEMPLATE_FIELDS = ['name', 'kind', 'code', 'heading', 'body', 'style', 'orientation', 'signatories', 'active']

router.get('/certificates/meta', issuers, (req, res) => {
  res.json({ fields: CERT_FIELDS, extras: EXTRA_FIELDS, kinds: CERT_KINDS, styles: CERT_STYLES })
})

router.get('/certificates/templates', issuers, asyncHandler(async (req, res) => {
  await ensureDefaults()
  const [list, counts] = await Promise.all([
    CertificateTemplate.find().sort({ active: -1, name: 1 }).lean(),
    Certificate.aggregate([{ $match: await batchFilter(req) }, { $group: { _id: '$template', n: { $sum: 1 } } }]),
  ])
  const issued = Object.fromEntries(counts.map((c) => [String(c._id), c.n]))
  res.json(list.map((t) => ({ ...t, issued: issued[String(t._id)] || 0 })))
}))

function cleanTemplate(body) {
  const data = pick(body, TEMPLATE_FIELDS)
  if (data.signatories) data.signatories = [].concat(data.signatories).map((s) => String(s).trim()).filter(Boolean).slice(0, 4)
  if (data.code) data.code = String(data.code).replace(/[^A-Za-z0-9]/g, '').slice(0, 6)
  if (data.kind && !data.code) data.code = KIND_CODE[data.kind]
  return data
}

router.post('/certificates/templates', adminsOnly, asyncHandler(async (req, res) => {
  const data = cleanTemplate(req.body)
  data.code ||= KIND_CODE[data.kind] || 'CRT'
  res.status(201).json(await CertificateTemplate.create(data))
}))

router.put('/certificates/templates/:id', adminsOnly, asyncHandler(async (req, res) => {
  const doc = await CertificateTemplate.findByIdAndUpdate(req.params.id, cleanTemplate(req.body), { returnDocument: 'after', runValidators: true })
  if (!doc) throw httpError(404, 'Template not found.')
  res.json(doc)
}))

router.delete('/certificates/templates/:id', adminsOnly, asyncHandler(async (req, res) => {
  // Templates already used are kept (switched off) so issued certificates still point somewhere.
  if (await Certificate.exists({ template: req.params.id })) {
    await CertificateTemplate.findByIdAndUpdate(req.params.id, { active: false })
    return res.json({ ok: true, deactivated: true })
  }
  await CertificateTemplate.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
}))

/* ── Issued certificates ── */

// ?q (student name / admission no. / serial), ?template, ?batch, ?status
router.get('/certificates', issuers, asyncHandler(async (req, res) => {
  const conditions = [await batchFilter(req)]
  if (req.query.batch) { await assertBatch(req, req.query.batch); conditions.push({ batch: req.query.batch }) }
  if (req.query.template) conditions.push({ template: req.query.template })
  if (req.query.status) conditions.push({ status: String(req.query.status) })
  if (req.query.student) conditions.push({ student: req.query.student })
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q), 'i')
    const ids = await Student.distinct('_id', { $or: [{ name: rx }, { admissionNo: rx }] })
    conditions.push({ $or: [{ serialNo: rx }, { student: { $in: ids } }] })
  }
  const list = await Certificate.find({ $and: conditions }, '-body')
    .populate('student', 'name admissionNo').populate('batch', 'name type').sort({ createdAt: -1 }).limit(500).lean()
  res.json(list)
}))

// Fills the template for the first chosen student without saving anything.
router.post('/certificates/preview', issuers, asyncHandler(async (req, res) => {
  // `draft` lets the template editor preview unsaved changes (or a brand-new template).
  const saved = req.body.template ? await CertificateTemplate.findById(req.body.template).lean() : null
  const template = { code: 'CRT', style: 'classic', orientation: 'portrait', signatories: [], ...(saved || {}), ...pick(req.body.draft || {}, ['heading', 'body', 'style', 'orientation', 'signatories', 'code']) }
  if (!template.body) throw httpError(422, 'Choose a template.')
  const settings = await getSettings()
  const [student] = req.body.student ? await loadStudents([req.body.student]) : []
  const sample = student || { name: 'Student Name', guardianName: 'Guardian Name', admissionNo: 'ADM0001', gender: 'male', batch: { name: 'Class', type: 'school' } }
  res.json({
    heading: template.heading || 'Certificate', style: template.style, orientation: template.orientation, signatories: template.signatories,
    body: fillTemplate(String(template.body), sample, settings, req.body.extras, req.body.issuedOn || ymd()),
    serialNo: `${template.code}-${ymd().slice(0, 4)}-XXXXX`, issuedOn: req.body.issuedOn || ymd(), student: sample,
    institute: pick(settings, ['instituteName', 'tagline', 'address', 'phone', 'email']),
  })
}))

router.post('/certificates/issue', issuers, asyncHandler(async (req, res) => {
  const template = await CertificateTemplate.findById(req.body.template).lean()
  if (!template || !template.active) throw httpError(422, 'Choose an active template.')
  const ids = [...new Set([].concat(req.body.students || []).map(String))].slice(0, 300)
  if (!ids.length) throw httpError(422, 'Choose at least one student.')
  const students = await loadStudents(ids)
  const scope = await scopeOf(req)
  if (students.length !== ids.length || students.some((s) => !batchInScope(scope, s.batch?._id))) throw httpError(404, 'Some students are not in your wing.')

  // A transfer certificate says all dues are cleared, so check that first.
  if (template.kind === 'transfer' && !req.body.ignoreDues) {
    const fees = await feeSummaryByStudent(students.map((s) => s._id))
    const owing = students.filter((s) => (fees.get(String(s._id))?.balance || 0) > 0)
    if (owing.length) {
      const list = owing.slice(0, 5).map((s) => `${s.name} (₹${Math.round(fees.get(String(s._id)).balance).toLocaleString('en-IN')})`).join(', ')
      throw httpError(409, `Pending fees: ${list}${owing.length > 5 ? ` and ${owing.length - 5} more` : ''}. Clear the dues or tick "Issue even with pending dues".`)
    }
  }

  const settings = await getSettings()
  const issuedOn = /^\d{4}-\d{2}-\d{2}$/.test(req.body.issuedOn || '') ? req.body.issuedOn : ymd()
  const extras = pick(req.body.extras || {}, EXTRA_FIELDS)
  const serials = await nextSerials(template.code, students.length)
  const docs = students.map((s, i) => ({
    serialNo: serials[i], template: template._id, kind: template.kind, student: s._id, batch: s.batch?._id,
    heading: template.heading, body: fillTemplate(template.body, s, settings, extras, issuedOn),
    style: template.style, orientation: template.orientation, signatories: template.signatories,
    extras, issuedOn, issuedBy: req.user.id, issuedByName: req.user.name, shared: req.body.shared !== false,
  }))
  const created = await Certificate.insertMany(docs)
  res.status(201).json({ name: `${template.name} × ${created.length}`, count: created.length, ids: created.map((c) => c._id), first: created[0]._id })
}))

async function certificateData(id) {
  const cert = await Certificate.findById(id).populate({ path: 'student', select: 'name admissionNo guardianName batch', populate: { path: 'batch', select: 'name type' } }).lean()
  if (!cert) throw httpError(404, 'Certificate not found.')
  const settings = await getSettings()
  return { ...cert, institute: pick(settings, ['instituteName', 'tagline', 'address', 'phone', 'email']) }
}
export { certificateData }

router.get('/certificates/:id', issuers, asyncHandler(async (req, res) => {
  const data = await certificateData(req.params.id)
  if (!batchInScope(await scopeOf(req), data.batch)) throw httpError(404, 'Certificate not found.')
  res.json(data)
}))

router.post('/certificates/:id/revoke', issuers, asyncHandler(async (req, res) => {
  const cert = await Certificate.findOne({ _id: req.params.id, ...(await batchFilter(req)) })
  if (!cert) throw httpError(404, 'Certificate not found.')
  if (cert.status === 'revoked') throw httpError(422, 'Already revoked.')
  cert.set({ status: 'revoked', revokedReason: String(req.body.reason || '').slice(0, 300), revokedAt: new Date() })
  await cert.save()
  res.json({ ...cert.toObject(), name: cert.serialNo })
}))

router.post('/certificates/:id/share', issuers, asyncHandler(async (req, res) => {
  const cert = await Certificate.findOneAndUpdate({ _id: req.params.id, ...(await batchFilter(req)) }, { shared: Boolean(req.body.shared) }, { returnDocument: 'after' })
  if (!cert) throw httpError(404, 'Certificate not found.')
  res.json({ ...cert.toObject(), name: cert.serialNo })
}))

/* ── Public verification (no login) ── */

export const verifyCertificate = asyncHandler(async (req, res) => {
  const serialNo = String(req.params.serial || '').trim().toUpperCase().slice(0, 40)
  const cert = serialNo && await Certificate.findOne({ serialNo }).populate({ path: 'student', select: 'name admissionNo batch', populate: { path: 'batch', select: 'name' } }).lean()
  if (!cert) return res.status(404).json({ valid: false, error: 'No certificate with this serial number.' })
  const settings = await getSettings()
  res.json({
    valid: cert.status === 'issued', status: cert.status, serialNo: cert.serialNo, heading: cert.heading,
    studentName: cert.student?.name, admissionNo: cert.student?.admissionNo, className: cert.student?.batch?.name,
    issuedOn: cert.issuedOn, revokedReason: cert.status === 'revoked' ? cert.revokedReason : undefined,
    institute: settings.instituteName,
  })
})

export default router
