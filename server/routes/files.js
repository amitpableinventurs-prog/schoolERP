// File uploads (profile photos, homework PDFs, question sheets, banners, logo).
// Files are sent as base64 in JSON from the same site (no multipart, no CORS
// preflight) and kept in MongoDB, so they survive redeploys of the web server.
import express, { Router } from 'express'
import mongoose from 'mongoose'
import { requireAuth } from '../auth.js'
import { Assignment, Student, StoredFile, User } from '../models.js'
import { asyncHandler, httpError } from '../util.js'

const router = Router()
router.use(express.json({ limit: '12mb' }))

const MB = 1024 * 1024
const LIMITS = { photo: 3 * MB, logo: 2 * MB, banner: 4 * MB, homework: 8 * MB, assignment: 8 * MB, other: 8 * MB }
const PUBLIC = new Set(['logo', 'banner'])
const LABEL = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP' }
const IMAGES_ONLY = new Set(['photo', 'logo', 'banner'])

// The real type of the bytes (the browser's claim is not trusted).
function sniff(buf) {
  if (buf.length > 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

const cleanName = (name, mime) => {
  const base = String(name || '').split(/[\\/]/).pop().replace(/[^\w.\- ()]+/g, '_').slice(-120).trim()
  return base || `file.${(LABEL[mime] || 'bin').toLowerCase()}`
}

const isStaff = (role) => !['student', 'parent'].includes(role)

async function childIds(userId) {
  const user = await User.findById(userId, 'children').lean()
  return (user?.children || []).map(String)
}

// POST /api/files { name, data (base64 or data: URL), purpose, student? } → { _id, name, mime, size }
router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const purpose = Object.hasOwn(LIMITS, req.body.purpose) ? req.body.purpose : 'other'
  const { role } = req.user
  let student = null
  if (role === 'student') {
    if (!['photo', 'homework'].includes(purpose)) throw httpError(403, 'Students can upload a profile photo or homework only.')
    student = req.user.student
  } else if (role === 'parent') {
    if (purpose !== 'photo') throw httpError(403, 'Parents can upload a profile photo only.')
    if (!(await childIds(req.user.id)).includes(String(req.body.student))) throw httpError(404, 'This student is not linked to your account.')
    student = req.body.student
  } else if (req.body.student && mongoose.isValidObjectId(req.body.student)) {
    student = req.body.student
  }

  const raw = String(req.body.data || '').replace(/^data:[^,]*,/, '')
  if (!raw) throw httpError(422, 'Choose a file to upload.')
  const data = Buffer.from(raw, 'base64')
  if (!data.length) throw httpError(422, 'The file is empty.')
  if (data.length > LIMITS[purpose]) throw httpError(413, `The file is too big. The limit is ${Math.round(LIMITS[purpose] / MB)} MB.`)
  const mime = sniff(data)
  if (!mime) throw httpError(415, 'Only PDF, JPG, PNG or WEBP files can be uploaded.')
  if (IMAGES_ONLY.has(purpose) && mime === 'application/pdf') throw httpError(415, 'Please choose a photo (JPG, PNG or WEBP).')

  const file = await StoredFile.create({
    name: cleanName(req.body.name, mime), mime, size: data.length, data, purpose,
    public: PUBLIC.has(purpose), student: student || undefined, createdBy: req.user.id,
  })
  res.status(201).json({ _id: file._id, name: file.name, mime, size: file.size, purpose })
}))

// Who may open a private file: staff, the uploader, the student it belongs to and
// their parents, and students of a batch whose assignment it is attached to.
async function canRead(req, file) {
  const { role, id } = req.user
  if (isStaff(role) || String(file.createdBy) === id) return true
  const mine = role === 'student' ? [req.user.student] : await childIds(id)
  if (file.student && mine.includes(String(file.student))) return true
  if (file.purpose === 'assignment') {
    const batches = (await Student.find({ _id: { $in: mine } }, 'batch').lean()).map((s) => s.batch)
    return Boolean(await Assignment.exists({ 'attachments.file': file._id, batch: { $in: batches } }))
  }
  return false
}

router.get('/:id', asyncHandler(async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw httpError(404, 'File not found.')
  const file = await StoredFile.findById(req.params.id)
  if (!file) throw httpError(404, 'File not found.')
  req.storedFile = file
  if (file.public) return next()
  requireAuth(req, res, next)
}), asyncHandler(async (req, res) => {
  const file = req.storedFile
  if (!file.public && !(await canRead(req, file))) throw httpError(404, 'File not found.')
  const name = encodeURIComponent(file.name || 'file')
  res.set({
    'Content-Type': file.mime,
    'Content-Length': String(file.size || file.data.length),
    // A file id never gets new content, so browsers may keep it.
    'Cache-Control': `${file.public ? 'public' : 'private'}, max-age=604800, immutable`,
    'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${name}`,
    ...(file.public ? { 'Cross-Origin-Resource-Policy': 'cross-origin' } : {}),
  })
  res.end(file.data)
}))

export default router
