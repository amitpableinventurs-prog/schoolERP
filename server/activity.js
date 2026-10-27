// Activity log for the super admin. Every successful change made by staff or admins
// (POST / PUT / DELETE) is recorded automatically by `activityLogger`; logins and
// failed logins are recorded by the login route through `logActivity`.
import { ActivityLog } from './models.js'
import { bindTenant } from './tenancy.js'

const VERB = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }

// Read-only AI helpers and chat are not changes; skip them to keep the log useful.
const SKIP = [/^\/certificates\/preview$/, /^\/ai\/chat$/, /^\/ai\/risk-plan\//, /^\/notices\/ai-draft$/, /^\/tests\/ai-generate$/, /^\/leads\/[^/]+\/ai-message$/, /^\/auth\/login$/]
const UPDATES = [/^\/payroll\/(approve|unapprove|pay)$/,/^\/certificates\/[^/]+\/(revoke|share)$/, /^\/students\/[^/]+\/(reset-password|parent-login)$/, /^\/leads\/[^/]+\/(followups|convert)$/, /^\/outbox\/bulk$/, /^\/automation\/rules\/[^/]+\/run$/, /^\/automation\/run-all$/, /^\/auth\/password$/, /^\/desktop-apps\/[^/]+\/(reset-device|renew)$/]
const AI = [/^\/papers\/generate$/, /^\/exams\/[^/]+\/ai-remarks$/, /^\/doubts\/[^/]+\/ai-answer$/]

const MODULE = {
  students: 'Students', staff: 'Staff', batches: 'Batches', users: 'Logins', settings: 'Settings', auth: 'Account',
  attendance: 'Attendance', exams: 'Exams', tests: 'Online tests', papers: 'Question papers', timetable: 'Timetable',
  materials: 'Study material', doubts: 'Doubts', notices: 'Notices', fees: 'Fees', leads: 'Admissions CRM',
  automation: 'Automation', outbox: 'Outbox', courses: 'LMS courses', assignments: 'Assignments', leaves: 'Leave requests',
  certificates: 'Certificates', transport: 'Transport', payroll: 'Payroll', finance: 'Finance',
  'desktop-apps': 'Desktop apps',
}

const NOUN = {
  students: 'student', staff: 'staff member', batches: 'batch', users: 'login', exams: 'exam', tests: 'online test',
  papers: 'question paper', timetable: 'timetable slot', materials: 'study material', doubts: 'doubt', notices: 'notice',
  leads: 'enquiry', courses: 'course', assignments: 'assignment', leaves: 'leave request', certificates: 'certificate',
}

const money = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
const label = (x) => x && (x.name || x.title || x.receiptNo || x.admissionNo || x.loginId)

// A readable sentence for the common actions; a generic one for everything else.
function describe(req, body, parts) {
  const b = req.body || {}
  const [mod, id, sub] = parts
  const m = req.method
  const name = label(body) || label(b)
  if (mod === 'auth' && id === 'password') return 'Changed own password'
  if (mod === 'desktop-apps') {
    if (sub === 'reset-device') return `Freed desktop key ${body?.key || ''} for another computer`
    if (sub === 'renew') return `Renewed desktop app key "${body?.label}" (${body?.key}) until ${body?.expiresAt ? new Date(body.expiresAt).toLocaleDateString('en-IN') : '-'}`
    if (m === 'DELETE') return `Deleted desktop app key "${body?.label}" (${body?.key})`
    if (m === 'POST') return `Created desktop app key "${body?.label}" (${body?.key})`
    if (b.status) return `${b.status === 'revoked' ? 'Deactivated' : 'Activated'} desktop app "${body?.label}" (${body?.key})`
    return `Changed desktop app "${body?.label}"`
  }
  if (mod === 'payroll' && id === 'generate') return `Generated payroll for ${b.month || 'this month'}${body?.created != null ? ` — ${body.created} payslip(s)` : ''}`
  if (mod === 'payroll' && id === 'approve') return `Approved ${body?.updated ?? ''} payslip(s)`
  if (mod === 'payroll' && id === 'pay') return `Paid salary to ${body?.paid ?? ''} staff — ${money(body?.amount)} by ${b.mode || 'bank'}`
  if (mod === 'payroll' && id === 'structures') return 'Changed a salary structure'
  if (mod === 'payroll' && id === 'advances' && m === 'POST') return `Gave a salary ${b.kind || 'advance'} of ${money(b.amount)}`
  if (mod === 'finance' && id === 'entries' && m === 'POST') return `Recorded ${b.type || ''} ${money(b.amount)} — ${b.category || ''}${body?.voucherNo ? ` (${body.voucherNo})` : ''}`
  if (mod === 'finance' && id === 'entries' && m === 'PUT') return `Edited ${body?.type || ''} entry ${body?.voucherNo || ''}`
  if (mod === 'finance' && id === 'entries' && m === 'DELETE') return 'Deleted a finance entry'
  if (mod === 'fees' && id === 'payments' && m === 'POST') return `Collected ${money(b.amount)} by ${b.mode || 'cash'}${body?.receiptNo ? ` — receipt ${body.receiptNo}` : ''}`
  if (mod === 'fees' && id === 'installments' && m === 'PUT') return `Changed fee installment "${body?.title || ''}"${Number(b.discount) ? ` — discount ${money(b.discount)}` : ''}`
  if (mod === 'fees' && id === 'installments' && m === 'POST') return `Added fee installment "${b.title || ''}" of ${money(b.amount)}`
  if (mod === 'fees' && id === 'installments' && m === 'DELETE') return 'Deleted a fee installment'
  if (mod === 'fees' && id === 'plan') return `Re-created the fee plan (${body?.created ?? 0} installments)`
  if (mod === 'attendance' && m === 'POST') return `Marked attendance for ${body?.saved ?? (b.records || []).length} students on ${b.date || 'today'}`
  if (mod === 'exams' && sub === 'marks') return `Saved marks for ${(b.rows || []).length} students`
  if (mod === 'exams' && sub === 'ai-remarks') return `AI report-card remarks (${body?.updated ?? 0} students)`
  if (mod === 'students' && m === 'POST' && !sub) return `Admitted ${body?.name} (${body?.admissionNo})`
  if (mod === 'students' && sub === 'reset-password') return `Reset portal password of student ${body?.loginId || ''}`
  if (mod === 'students' && sub === 'parent-login') return `Reset parent login ${body?.loginId || ''}`
  if (mod === 'students' && m === 'DELETE') return body?.deactivated ? 'Deactivated a student (has payments)' : 'Deleted a student'
  if (mod === 'leads' && sub === 'convert') return `Admitted enquiry ${body?.lead?.name || ''} as ${body?.student?.admissionNo || ''}`
  if (mod === 'leads' && sub === 'followups') return `Logged follow-up for ${body?.name || 'an enquiry'}`
  if (mod === 'leaves' && m === 'PUT') return `${b.status === 'approved' ? 'Approved' : 'Rejected'} leave of ${body?.leave?.from || ''} → ${body?.leave?.to || ''}`
  if (mod === 'assignments' && sub === 'grade') return b.status === 'returned' ? 'Returned an assignment for redo' : `Graded an assignment: ${b.marks} marks`
  if (mod === 'automation' && sub === 'run') return `Ran automation "${id}" — ${body?.summary || ''}`
  if (mod === 'automation' && id === 'run-all') return 'Ran all automation rules'
  if (mod === 'automation' && id === 'rules') return `Changed automation rule "${sub}"`
  if (mod === 'outbox') return m === 'DELETE' ? 'Cleared sent messages from the outbox' : `Marked outbox message(s) ${b.status}`
  if (mod === 'users') {
    // Wings from the saved login: the server may have narrowed what was asked for.
    if (m === 'POST') return `Created ${body?.role} login ${body?.loginId} — ${body?.wings?.length ? body.wings.join(', ') : 'whole institute'}`
    const bits = [b.password && 'reset password', b.active === false && 'disabled', b.active === true && 'enabled', b.role && `role ${b.role}`, (b.wings || b.allWings) && `wings: ${b.allWings ? 'whole institute' : (body?.wings || []).join(', ')}`].filter(Boolean)
    return `Updated login ${body?.loginId || ''}${bits.length ? ` (${bits.join(', ')})` : ''}`
  }
  if (mod === 'certificates' && id === 'issue') return `Issued ${body?.name || 'certificates'}`
  if (mod === 'certificates' && sub === 'revoke') return `Revoked certificate ${body?.serialNo || ''}${b.reason ? ` — ${String(b.reason).slice(0, 80)}` : ''}`
  if (mod === 'certificates' && sub === 'share') return `${b.shared ? 'Shared' : 'Hid'} certificate ${body?.serialNo || ''} ${b.shared ? 'with' : 'from'} the student portal`
  if (mod === 'certificates' && id === 'templates') return `${{ POST: 'Created', PUT: 'Updated', DELETE: 'Deleted' }[m]} certificate template${name ? ` "${name}"` : ''}`
  if (mod === 'settings') return 'Changed institute settings'
  const noun = NOUN[mod] || mod
  const verb = { POST: 'Created', PUT: 'Updated', PATCH: 'Updated', DELETE: 'Deleted' }[m] || m
  return `${verb} ${noun}${name ? ` "${String(name).slice(0, 80)}"` : ''}`
}

// Request body without secrets or bulky content, capped in size.
function detailOf(body) {
  if (!body || typeof body !== 'object') return undefined
  const out = {}
  for (const [k, v] of Object.entries(body)) {
    if (/password|hash|token/i.test(k)) out[k] = '••••'
    else if (['questions', 'modules', 'content', 'records', 'rows', 'messages'].includes(k) && Array.isArray(v)) out[k] = `[${v.length} items]`
    else if (typeof v === 'string' && v.length > 300) out[k] = `${v.slice(0, 300)}…`
    else out[k] = v
  }
  const text = JSON.stringify(out)
  return text.length > 3000 ? { truncated: text.slice(0, 3000) } : out
}

export async function logActivity(req, { action, module, summary, actor, target, status, detail }) {
  try {
    const user = actor === undefined ? req.user : actor
    await ActivityLog.create({
      user: user?._id || user?.id,
      userName: user?.name || 'Unknown',
      role: user?.role,
      wings: user?.role === 'superadmin' ? [] : (user?.wings || []),
      action, module: MODULE[module] || module, summary, target, status, detail,
      method: req.method, path: req.originalUrl?.split('?')[0], ip: req.ip,
    })
  } catch (error) {
    console.error('[activity] could not log:', error.message)
  }
}

export function activityLogger(req, res, next) {
  if (!VERB[req.method]) return next()
  const json = res.json.bind(res)
  res.json = (body) => {
    res.locals.body = body
    return json(body)
  }
  // 'finish' fires outside the request's async context: keep the institute bound.
  res.on('finish', bindTenant(() => {
    if (!req.user || ['student', 'parent'].includes(req.user.role) || res.statusCode >= 400) return
    const path = req.originalUrl.split('?')[0].replace(/^\/api/, '')
    if (SKIP.some((rx) => rx.test(path))) return
    const parts = path.split('/').filter(Boolean)
    const body = res.locals.body
    logActivity(req, {
      action: AI.some((rx) => rx.test(path)) ? 'ai' : UPDATES.some((rx) => rx.test(path)) ? 'update' : VERB[req.method],
      module: MODULE[parts[0]] || parts[0],
      summary: describe(req, body, parts),
      target: parts[1] && /^[a-f0-9]{24}$/i.test(parts[1]) ? parts[1] : body?._id ? String(body._id) : undefined,
      status: res.statusCode,
      detail: detailOf(req.body),
    })
  }))
  next()
}
