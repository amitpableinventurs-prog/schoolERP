import mongoose from 'mongoose'
import { defineModel, modelOf } from './tenancy.js'

const { Schema } = mongoose

// Desktop sync: deletes of synced records are remembered as tombstones so the other
// side (central server / desktop app) can replay them.
const NOT_TRACKED = ['ActivityLog', 'AutomationRule', 'Outbox', 'AutomationLog', 'SyncTombstone', 'SyncState', 'VehicleLocation', 'VehiclePing']

async function recordDeletes(Model, ids) {
  if (!ids?.length) return
  const deletedAt = new Date()
  await modelOf('SyncTombstone', Model.db).bulkWrite(ids.map((docId) => ({
    updateOne: { filter: { model: Model.modelName, docId }, update: { $set: { deletedAt } }, upsert: true },
  })))
}

function trackDeletes(schema) {
  schema.pre('deleteMany', async function () {
    this._deletedIds = await this.model.distinct('_id', this.getFilter())
  })
  schema.pre('deleteOne', { query: true, document: false }, async function () {
    const doc = await this.model.findOne(this.getFilter(), '_id').lean()
    this._deletedIds = doc ? [doc._id] : []
  })
  schema.post(['deleteMany', 'deleteOne'], { query: true, document: false }, async function () {
    await recordDeletes(this.model, this._deletedIds)
  })
  schema.post('findOneAndDelete', async function (doc) {
    if (doc) await recordDeletes(this.model, [doc._id])
  })
  schema.post('deleteOne', { document: true, query: false }, async function () {
    await recordDeletes(this.constructor, [this._id])
  })
}

// Models resolve to the database of the current tenant (see tenancy.js).
const model = (name, schema) => defineModel(name, NOT_TRACKED.includes(name) ? schema : schema.plugin(trackDeletes))
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name })
const opts = { timestamps: true }

export const ROLES = ['superadmin', 'admin', 'teacher', 'accountant', 'counsellor', 'student', 'parent']
export const INSTITUTION_TYPES = ['school', 'college', 'coaching']
// Staff and admins can be limited to some wings (school / college / coaching).
// No wings = the whole institute. The super admin always sees everything.
const wingsField = { type: [{ type: String, enum: INSTITUTION_TYPES }], default: undefined }

export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  // Staff log in with their email, students with their admission number,
  // parents with the guardian mobile number saved on their children's records.
  loginId: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, required: true },
  staff: ref('Staff'),
  student: ref('Student'),
  children: [ref('Student')], // parent accounts: one login for all siblings
  wings: wingsField,
  createdBy: ref('User'),
  active: { type: Boolean, default: true },
  lastLoginAt: Date,
}, opts))

export const Setting = model('Setting', new Schema({
  instituteName: { type: String, default: 'Smart Vidya Campus' },
  tagline: { type: String, default: 'School • College • Coaching' },
  phone: String,
  email: String,
  address: String,
  academicYear: { type: String, default: '2026-27' },
  attendanceThreshold: { type: Number, default: 75 },
  passPercent: { type: Number, default: 35 },
  migrations: [String], // one-time data migrations already applied
}, opts))

export const Staff = model('Staff', new Schema({
  name: { type: String, required: true, trim: true },
  designation: { type: String, default: 'Teacher' },
  department: String,
  subjects: [String],
  phone: String,
  email: { type: String, lowercase: true, trim: true },
  salary: { type: Number, default: 0 },
  joiningDate: String,
  wings: wingsField,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, opts))

export const Batch = model('Batch', new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: INSTITUTION_TYPES, required: true },
  program: String, // e.g. "Class 10", "B.Sc Computer Science", "JEE Main + Advanced"
  section: String,
  academicYear: String,
  subjects: [String],
  classTeacher: ref('Staff'),
  room: String,
  timing: String,
  capacity: { type: Number, default: 40 },
  fee: { type: Number, default: 0 }, // total fee for the year / course
  installments: { type: Number, default: 1 },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
}, opts))

export const Student = model('Student', new Schema({
  admissionNo: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
  dob: String,
  phone: String,
  email: { type: String, lowercase: true, trim: true },
  guardianName: String,
  guardianPhone: String,
  address: String,
  batch: { ...ref('Batch'), required: true },
  rollNo: Number,
  admissionDate: String,
  status: { type: String, enum: ['active', 'inactive', 'passed', 'dropped'], default: 'active' },
  notes: String,
}, opts))

export const Attendance = model('Attendance', new Schema({
  student: { ...ref('Student'), required: true },
  batch: { ...ref('Batch'), required: true },
  date: { type: String, required: true },
  status: { type: String, enum: ['P', 'A', 'L'], required: true }, // present, absent, leave
}, opts).index({ student: 1, date: 1 }, { unique: true }).index({ batch: 1, date: 1 }))

export const FeeInstallment = model('FeeInstallment', new Schema({
  student: { ...ref('Student'), required: true },
  batch: ref('Batch'),
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  paid: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  dueDate: { type: String, required: true },
}, opts).index({ student: 1, dueDate: 1 }))

export const Payment = model('Payment', new Schema({
  student: { ...ref('Student'), required: true },
  installment: ref('FeeInstallment'),
  amount: { type: Number, required: true },
  mode: { type: String, enum: ['cash', 'upi', 'card', 'bank', 'cheque'], default: 'cash' },
  receiptNo: { type: String, unique: true },
  paidOn: { type: String, required: true },
  reference: String,
  note: String,
  collectedBy: ref('User'),
}, opts))

export const Exam = model('Exam', new Schema({
  name: { type: String, required: true },
  batch: { ...ref('Batch'), required: true },
  type: { type: String, enum: ['unit', 'mid', 'final', 'mock'], default: 'unit' },
  date: String,
  subjects: [{ name: String, maxMarks: { type: Number, default: 100 } }],
  published: { type: Boolean, default: false },
}, opts))

export const Mark = model('Mark', new Schema({
  exam: { ...ref('Exam'), required: true },
  student: { ...ref('Student'), required: true },
  scores: [{ subject: String, marks: Number, _id: false }],
  total: Number,
  max: Number,
  percent: Number,
  grade: String,
  rank: Number,
  remark: String,
}, opts).index({ exam: 1, student: 1 }, { unique: true }))

const questionSchema = new Schema({
  q: { type: String, required: true },
  options: [String],
  answer: { type: Number, required: true }, // index into options
  explanation: String,
  marks: { type: Number, default: 4 },
}, { _id: false })

export const Test = model('Test', new Schema({
  title: { type: String, required: true },
  batch: { ...ref('Batch'), required: true },
  subject: String,
  topic: String,
  durationMin: { type: Number, default: 30 },
  negativeMarks: { type: Number, default: 0 },
  questions: [questionSchema],
  status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
  aiGenerated: { type: Boolean, default: false },
  createdBy: ref('User'),
}, opts))

export const Attempt = model('Attempt', new Schema({
  test: { ...ref('Test'), required: true },
  student: { ...ref('Student'), required: true },
  answers: [Number], // -1 = skipped
  correct: Number,
  wrong: Number,
  score: Number,
  total: Number,
  startedAt: Date,
  submittedAt: Date,
}, opts).index({ test: 1, student: 1 }, { unique: true }))

export const Paper = model('Paper', new Schema({
  title: String,
  batch: ref('Batch'),
  subject: String,
  level: String,
  content: Schema.Types.Mixed,
  createdBy: ref('User'),
}, opts))

export const LEAD_STATUSES = ['new', 'contacted', 'demo', 'visited', 'converted', 'lost']
export const Lead = model('Lead', new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true },
  email: String,
  course: String,
  type: { type: String, enum: INSTITUTION_TYPES, default: 'coaching' },
  source: { type: String, enum: ['walkin', 'website', 'referral', 'social', 'ads', 'call', 'other'], default: 'walkin' },
  status: { type: String, enum: LEAD_STATUSES, default: 'new' },
  score: { type: Number, default: 0 },
  nextFollowUp: String,
  assignedTo: ref('User'),
  notes: String,
  followUps: [{ note: String, at: { type: Date, default: Date.now }, by: String }],
  convertedStudent: ref('Student'),
}, opts))

export const TimetableSlot = model('TimetableSlot', new Schema({
  batch: { ...ref('Batch'), required: true },
  day: { type: Number, min: 1, max: 7, required: true }, // 1 = Monday
  start: { type: String, required: true },
  end: { type: String, required: true },
  subject: String,
  teacher: ref('Staff'),
  room: String,
}, opts))

export const Material = model('Material', new Schema({
  batch: ref('Batch'), // empty = all batches
  subject: String,
  title: { type: String, required: true },
  kind: { type: String, enum: ['notes', 'video', 'link', 'assignment'], default: 'notes' },
  url: String,
  description: String,
  dueDate: String,
  createdBy: ref('User'),
}, opts))

export const Doubt = model('Doubt', new Schema({
  student: { ...ref('Student'), required: true },
  batch: ref('Batch'),
  subject: String,
  question: { type: String, required: true },
  aiAnswer: String,
  teacherAnswer: String,
  answeredBy: String,
  status: { type: String, enum: ['open', 'answered'], default: 'open' },
}, opts))

export const Notice = model('Notice', new Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  audience: { type: String, enum: ['all', 'students', 'parents', 'staff'], default: 'all' },
  batch: ref('Batch'),
  pinned: { type: Boolean, default: false },
  createdBy: String,
}, opts))

export const AutomationRule = model('AutomationRule', new Schema({
  key: { type: String, required: true, unique: true },
  name: String,
  description: String,
  enabled: { type: Boolean, default: true },
  hour: { type: Number, default: 9 }, // runs once a day after this hour
  config: { type: Schema.Types.Mixed, default: {} },
  lastRunAt: Date,
  lastRunDate: String,
  lastResult: String,
}, opts))

export const Outbox = model('Outbox', new Schema({
  channel: { type: String, enum: ['whatsapp', 'sms', 'app'], default: 'whatsapp' },
  toName: String,
  phone: String,
  message: { type: String, required: true },
  ruleKey: String,
  wing: { type: String, enum: INSTITUTION_TYPES }, // which wing the message is about
  // Stops the same reminder from being queued twice for the same day/item.
  dedupeKey: { type: String, unique: true, sparse: true },
  status: { type: String, enum: ['pending', 'sent', 'skipped'], default: 'pending' },
  sentAt: Date,
}, opts))

export const AutomationLog = model('AutomationLog', new Schema({
  ruleKey: String,
  ruleName: String,
  queued: Number,
  summary: String,
  trigger: { type: String, enum: ['schedule', 'manual'], default: 'manual' },
}, opts))

/* ── LMS ── */

const lessonSchema = new Schema({
  title: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['video', 'reading', 'link', 'quiz'], default: 'video' },
  url: String, // YouTube / Google Drive / any link
  content: String, // notes (markdown) for reading lessons, or a short description
  durationMin: Number,
  questions: [questionSchema], // quiz lessons
})

export const Course = model('Course', new Schema({
  title: { type: String, required: true, trim: true },
  subject: String,
  description: String,
  batches: [ref('Batch')],
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  // Lesson ids stay stable across edits, so student progress survives reordering.
  modules: [new Schema({ title: { type: String, required: true, trim: true }, lessons: [lessonSchema] })],
  createdBy: ref('User'),
  teacherName: String,
}, opts))

export const CourseProgress = model('CourseProgress', new Schema({
  student: { ...ref('Student'), required: true },
  course: { ...ref('Course'), required: true },
  completed: [{ lesson: Schema.Types.ObjectId, at: Date, score: Number, total: Number, answers: [Number], _id: false }],
  lastLesson: Schema.Types.ObjectId,
  lastAt: Date,
}, opts).index({ student: 1, course: 1 }, { unique: true }).index({ course: 1 }))

export const Assignment = model('Assignment', new Schema({
  title: { type: String, required: true, trim: true },
  instructions: String,
  batch: { ...ref('Batch'), required: true },
  subject: String,
  course: ref('Course'),
  url: String, // question sheet / reference
  dueDate: { type: String, required: true },
  maxMarks: { type: Number, default: 10 },
  allowLate: { type: Boolean, default: true },
  status: { type: String, enum: ['published', 'closed'], default: 'published' },
  createdBy: ref('User'),
  teacherName: String,
}, opts))

export const Submission = model('Submission', new Schema({
  assignment: { ...ref('Assignment'), required: true },
  student: { ...ref('Student'), required: true },
  text: String,
  link: String,
  submittedAt: Date,
  late: { type: Boolean, default: false },
  // returned = teacher asked for a resubmission
  status: { type: String, enum: ['submitted', 'graded', 'returned'], default: 'submitted' },
  marks: Number,
  feedback: String,
  gradedBy: String,
  gradedAt: Date,
}, opts).index({ assignment: 1, student: 1 }, { unique: true }).index({ student: 1 }))

/* ── Leave applications (from parents or students) ── */

export const LeaveRequest = model('LeaveRequest', new Schema({
  student: { ...ref('Student'), required: true },
  batch: ref('Batch'),
  from: { type: String, required: true },
  to: { type: String, required: true },
  reason: { type: String, required: true },
  requestedBy: ref('User'),
  requestedByName: String,
  requestedByRole: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' },
  reviewedBy: String,
  reviewNote: String,
  reviewedAt: Date,
}, opts).index({ student: 1, from: -1 }).index({ status: 1 }))

/* ── Transport (buses, routes, stops, pickup/drop) ── */

export const VEHICLE_TYPES = ['bus', 'van', 'car', 'auto', 'tempo']

export const Vehicle = model('Vehicle', new Schema({
  number: { type: String, required: true, trim: true, uppercase: true }, // registration number
  model: String, // e.g. "Tata LP 912"
  type: { type: String, enum: VEHICLE_TYPES, default: 'bus' },
  capacity: { type: Number, default: 40 },
  driverName: String,
  driverPhone: String,
  driverLicense: String,
  conductorName: String,
  conductorPhone: String,
  insuranceExpiry: String,
  fitnessExpiry: String,
  pucExpiry: String,
  permitExpiry: String,
  gpsDeviceId: String, // IMEI / identifier a GPS tracker or the Traccar Client app sends
  trackingToken: { type: String, index: { unique: true, sparse: true } }, // secret in the driver's tracking link
  wings: wingsField,
  status: { type: String, enum: ['active', 'maintenance', 'retired'], default: 'active' },
  notes: String,
}, opts).index({ number: 1 }, { unique: true }))

const stopSchema = new Schema({
  name: { type: String, required: true, trim: true },
  sequence: { type: Number, default: 0 }, // 0 = school; higher = farther away
  pickupTime: String, // "07:15"
  dropTime: String, // "14:50"
  fee: { type: Number, default: 0 }, // monthly fee from this stop, overrides route default
  landmark: String,
  lat: Number,
  lng: Number,
}, { _id: true })

export const TransportRoute = model('TransportRoute', new Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, uppercase: true },
  vehicle: ref('Vehicle'),
  incharge: ref('Staff'), // teacher/admin responsible for this route
  startTime: String, // when the vehicle leaves the depot
  endTime: String,
  totalKm: { type: Number, default: 0 },
  monthlyFee: { type: Number, default: 0 }, // default when a stop's fee is 0
  stops: [stopSchema],
  wings: wingsField,
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  notes: String,
}, opts))

export const TransportAssignment = model('TransportAssignment', new Schema({
  student: { ...ref('Student'), required: true },
  route: { ...ref('TransportRoute'), required: true },
  stop: { type: Schema.Types.ObjectId, required: true }, // id of a stop in route.stops
  stopName: String, // denormalised, so a renamed stop keeps history clear
  pickup: { type: Boolean, default: true },
  drop: { type: Boolean, default: true },
  monthlyFee: { type: Number, default: 0 }, // locked at assignment time
  startDate: { type: String, required: true },
  endDate: String,
  status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
  notes: String,
}, opts).index({ student: 1, status: 1 }).index({ route: 1, status: 1 }))

export const TransportAttendance = model('TransportAttendance', new Schema({
  student: { ...ref('Student'), required: true },
  route: { ...ref('TransportRoute'), required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  direction: { type: String, enum: ['pickup', 'drop'], required: true },
  status: { type: String, enum: ['boarded', 'absent', 'skipped'], required: true },
  stopName: String,
  markedBy: ref('User'),
  at: Date,
}, opts).index({ student: 1, date: 1, direction: 1 }, { unique: true }).index({ route: 1, date: 1 }))

export const TransportInvoice = model('TransportInvoice', new Schema({
  student: { ...ref('Student'), required: true },
  route: ref('TransportRoute'),
  assignment: ref('TransportAssignment'),
  month: { type: String, required: true }, // "2026-10"
  amount: { type: Number, required: true },
  paid: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  dueDate: String,
  status: { type: String, enum: ['due', 'paid', 'overdue', 'waived'], default: 'due' },
  paidOn: String,
  mode: { type: String, enum: ['cash', 'upi', 'card', 'bank', 'cheque'] },
  receiptNo: String,
  collectedBy: ref('User'),
  note: String,
}, opts).index({ student: 1, month: 1 }, { unique: true }).index({ route: 1, month: 1 }))

/* ── Activity log (super admin monitoring) ── */

export const ActivityLog = model('ActivityLog', new Schema({
  user: ref('User'),
  userName: String,
  role: String,
  wings: [String], // the actor's wings at the time ([] = whole institute)
  action: { type: String, enum: ['create', 'update', 'delete', 'login', 'login_failed', 'logout', 'ai', 'other'], required: true },
  module: String,
  summary: String,
  method: String,
  path: String,
  target: String,
  status: Number,
  detail: Schema.Types.Mixed,
  ip: String,
}, { timestamps: { createdAt: true, updatedAt: false } }).index({ createdAt: -1 }).index({ user: 1, createdAt: -1 }).index({ module: 1, createdAt: -1 }))

/* ── Certificates ── */

// Template text uses {{placeholders}} (see CERT_FIELDS in routes/certificates.js);
// it is filled in and frozen on each certificate when issued.
export const CERT_KINDS = ['bonafide', 'character', 'transfer', 'merit', 'participation', 'completion', 'custom']
export const CERT_STYLES = ['classic', 'royal', 'modern', 'elegant']

export const CertificateTemplate = model('CertificateTemplate', new Schema({
  name: { type: String, required: true, trim: true },
  kind: { type: String, enum: CERT_KINDS, default: 'custom' },
  code: { type: String, required: true, uppercase: true, trim: true }, // serial prefix, e.g. BON
  heading: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  style: { type: String, enum: CERT_STYLES, default: 'classic' },
  orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
  signatories: { type: [String], default: ['Class Teacher', 'Principal'] },
  active: { type: Boolean, default: true },
}, opts))

export const Certificate = model('Certificate', new Schema({
  serialNo: { type: String, required: true, unique: true },
  template: ref('CertificateTemplate'),
  kind: { type: String, enum: CERT_KINDS, default: 'custom' },
  student: { ...ref('Student'), required: true },
  batch: ref('Batch'),
  heading: { type: String, required: true },
  body: { type: String, required: true },
  style: { type: String, enum: CERT_STYLES, default: 'classic' },
  orientation: { type: String, enum: ['portrait', 'landscape'], default: 'portrait' },
  signatories: [String],
  extras: { type: Schema.Types.Mixed, default: {} },
  issuedOn: { type: String, required: true },
  issuedBy: ref('User'),
  issuedByName: String,
  shared: { type: Boolean, default: true }, // visible in the student / parent portal
  status: { type: String, enum: ['issued', 'revoked'], default: 'issued' },
  revokedReason: String,
  revokedAt: Date,
}, opts).index({ student: 1, createdAt: -1 }).index({ batch: 1, createdAt: -1 }))

/* ── Payroll (salary structures, monthly payslips, advances) ── */

// A component is either a fixed monthly amount or a percent of basic.
const payComponentSchema = new Schema({
  name: { type: String, required: true, trim: true },
  calc: { type: String, enum: ['fixed', 'percent'], default: 'fixed' },
  value: { type: Number, default: 0 },
}, { _id: false })

export const SalaryStructure = model('SalaryStructure', new Schema({
  staff: { ...ref('Staff'), required: true, unique: true },
  basic: { type: Number, default: 0 },
  earnings: [payComponentSchema], // HRA, DA, conveyance, special allowance…
  deductions: [payComponentSchema], // fixed deductions not prorated by paid days
  pf: { type: Boolean, default: false }, // employee PF 12% of basic (basic capped at pfCap)
  pfCap: { type: Number, default: 15000 },
  esi: { type: Boolean, default: false }, // 0.75% of gross while gross ≤ 21,000
  professionalTax: { type: Number, default: 0 },
  tds: { type: Number, default: 0 }, // monthly income-tax deduction
  paymentMode: { type: String, enum: ['bank', 'cash', 'cheque', 'upi'], default: 'bank' },
  bankName: String,
  accountNo: String,
  ifsc: { type: String, uppercase: true, trim: true },
  pan: { type: String, uppercase: true, trim: true },
  uan: String,
  notes: String,
}, opts))

const lineSchema = new Schema({ name: String, amount: Number }, { _id: false })

export const Payslip = model('Payslip', new Schema({
  staff: { ...ref('Staff'), required: true },
  month: { type: String, required: true }, // "2026-10"
  slipNo: { type: String, unique: true, sparse: true },
  wings: [String], // staff wings when generated, for wing scoping
  // Frozen copy of the staff details and structure used, so later edits don't change old slips.
  staffName: String,
  designation: String,
  department: String,
  structure: Schema.Types.Mixed,
  workingDays: { type: Number, required: true },
  paidDays: { type: Number, required: true },
  earnings: [lineSchema],
  deductions: [lineSchema],
  additions: [lineSchema], // one-off bonus / arrears / overtime for this month
  extraDeductions: [lineSchema], // one-off fines / recoveries for this month
  advanceRecovery: [{ advance: ref('SalaryAdvance'), amount: Number, _id: false }],
  gross: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  net: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'approved', 'paid'], default: 'draft' },
  approvedBy: String,
  approvedAt: Date,
  paidOn: String,
  mode: { type: String, enum: ['bank', 'cash', 'cheque', 'upi'] },
  reference: String,
  paidBy: ref('User'),
  note: String,
}, opts).index({ staff: 1, month: 1 }, { unique: true }).index({ month: 1, status: 1 }))

export const SalaryAdvance = model('SalaryAdvance', new Schema({
  staff: { ...ref('Staff'), required: true },
  kind: { type: String, enum: ['advance', 'loan'], default: 'advance' },
  amount: { type: Number, required: true },
  givenOn: { type: String, required: true },
  monthlyDeduction: { type: Number, required: true },
  recovered: { type: Number, default: 0 },
  mode: { type: String, enum: ['bank', 'cash', 'cheque', 'upi'], default: 'cash' },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  wings: [String],
  note: String,
  createdBy: ref('User'),
}, opts).index({ staff: 1, status: 1 }))

/* ── Finance ledger: income and expenses other than fees and salaries ── */

export const FinanceEntry = model('FinanceEntry', new Schema({
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: String, required: true },
  mode: { type: String, enum: ['cash', 'upi', 'card', 'bank', 'cheque'], default: 'cash' },
  party: String, // paid to / received from
  reference: String, // bill / voucher / cheque number
  voucherNo: { type: String, unique: true, sparse: true },
  wing: { type: String, enum: INSTITUTION_TYPES }, // empty = whole institute
  note: String,
  createdBy: ref('User'),
  createdByName: String,
}, opts).index({ date: -1 }).index({ type: 1, category: 1 }))

/* ── Live bus tracking (central server only, never synced to desktops) ── */

// Latest position of each vehicle, from the driver's phone or a GPS tracker.
export const VehicleLocation = model('VehicleLocation', new Schema({
  vehicle: { ...ref('Vehicle'), required: true, unique: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  speed: Number, // km/h
  heading: Number, // degrees, 0 = north
  accuracy: Number, // metres
  at: { type: Date, required: true }, // when the device took the fix
  source: { type: String, enum: ['phone', 'device'] },
}))

// The path driven, for the map. Removed automatically after 3 days.
export const VehiclePing = model('VehiclePing', new Schema({
  vehicle: { ...ref('Vehicle'), required: true },
  lat: Number,
  lng: Number,
  speed: Number,
  at: { type: Date, required: true },
}).index({ vehicle: 1, at: 1 }).index({ at: 1 }, { expireAfterSeconds: 3 * 86_400 }))

/* ── Desktop sync ── */

export const SyncTombstone = model('SyncTombstone', new Schema({
  model: { type: String, required: true },
  docId: { type: Schema.Types.ObjectId, required: true },
  deletedAt: { type: Date, required: true },
}).index({ model: 1, docId: 1 }, { unique: true }).index({ deletedAt: 1, _id: 1 }))

// Desktop app only: one document holding the sync cursors and status.
export const SyncState = model('SyncState', new Schema({
  key: { type: String, default: 'state', unique: true },
  cursors: { type: Schema.Types.Mixed, default: {} }, // per collection: { t, id } of the last pulled change
  pushedAt: Date, // local changes after this are sent on the next push
  initialized: { type: Boolean, default: false }, // first full download finished
  lastSyncAt: Date,
  conflicts: { type: [Schema.Types.Mixed], default: [] },
}, { minimize: false }))
