// Sellable modules. Used by the server (API gate, desktop sync) and the React app
// (menus, route guards). Everything not listed here is the always-on core:
// dashboard, students, classes, staff, notices, settings, admins and the activity log.
export const PLATFORM_MODULES = [
  { key: 'academics', label: 'Academics', desc: 'Attendance, timetable, exams & results, study material, doubts, leaves' },
  { key: 'onlineExams', label: 'Online Exams', desc: 'Online tests and question papers' },
  { key: 'lms', label: 'LMS', desc: 'Video courses and assignments' },
  { key: 'fees', label: 'Fees & Collection', desc: 'Fee plans, installments, receipts' },
  { key: 'finance', label: 'Finance', desc: 'Income, expenses and finance overview' },
  { key: 'payroll', label: 'Payroll', desc: 'Salary structures, payslips, advances' },
  { key: 'transport', label: 'Transport', desc: 'Vehicles, routes, trip attendance, transport fees' },
  { key: 'certificates', label: 'Certificates', desc: 'Templates, issue, public verification' },
  { key: 'crm', label: 'Admissions CRM', desc: 'Enquiries and follow-ups' },
  { key: 'automation', label: 'Automation', desc: 'Scheduled reminders and message outbox' },
  { key: 'ai', label: 'AI features', desc: 'Assistant, AI paper/test/notice generators' },
]
export const ALL_MODULES = PLATFORM_MODULES.map((m) => m.key)
export const moduleLabel = (key) => PLATFORM_MODULES.find((m) => m.key === key)?.label || key

// ACCESS section (src/lib/auth.jsx) → module. Sections not listed are core.
export const SECTION_MODULE = {
  attendance: 'academics', timetable: 'academics', exams: 'academics', materials: 'academics', doubts: 'academics', leaves: 'academics',
  tests: 'onlineExams', papers: 'onlineExams',
  lms: 'lms', assignments: 'lms',
  fees: 'fees',
  finance: 'finance',
  payroll: 'payroll', myPayslips: 'payroll',
  transport: 'transport', transportFees: 'transport',
  certificates: 'certificates',
  leads: 'crm',
  automation: 'automation',
  assistant: 'ai',
}

// First path segment of an API call (after /api, /api/portal or /api/parent/children/:id) → module.
const API_MODULE = {
  attendance: 'academics', timetable: 'academics', exams: 'academics', results: 'academics', materials: 'academics', doubts: 'academics', leaves: 'academics',
  tests: 'onlineExams', papers: 'onlineExams',
  courses: 'lms', assignments: 'lms',
  fees: 'fees',
  finance: 'finance',
  payroll: 'payroll',
  transport: 'transport', gps: 'transport',
  certificates: 'certificates',
  leads: 'crm',
  automation: 'automation', outbox: 'automation',
  ai: 'ai',
}
const AI_PATHS = [/^\/notices\/ai-draft/, /^\/papers\/generate/, /^\/tests\/ai-generate/]

// Module an API path (without the /api prefix) belongs to, or null for core.
export function moduleForApiPath(path) {
  const clean = path.replace(/^\/(portal|parent\/children\/[^/]+)(?=\/)/, '')
  if (AI_PATHS.some((rx) => rx.test(clean))) return 'ai'
  return API_MODULE[clean.split('/')[1]] || null
}

// `modules` null/undefined = everything.
export const hasModule = (modules, key) => !key || !modules || modules.includes(key)

// Collections a desktop installation keeps a local copy of, per module.
export const MODULE_COLLECTIONS = {
  core: ['User', 'Setting', 'Staff', 'Batch', 'Student', 'Notice'],
  academics: ['Attendance', 'Exam', 'Mark', 'TimetableSlot', 'Material', 'Doubt', 'LeaveRequest'],
  onlineExams: ['Test', 'Attempt', 'Paper'],
  lms: ['Course', 'CourseProgress', 'Assignment', 'Submission'],
  fees: ['FeeInstallment', 'Payment'],
  // The finance overview also reads fees, payroll and transport invoices.
  finance: ['FinanceEntry', 'FeeInstallment', 'Payment', 'Payslip', 'SalaryAdvance', 'TransportInvoice'],
  payroll: ['SalaryStructure', 'Payslip', 'SalaryAdvance'],
  transport: ['Vehicle', 'TransportRoute', 'TransportAssignment', 'TransportAttendance', 'TransportInvoice'],
  certificates: ['CertificateTemplate', 'Certificate'],
  crm: ['Lead'],
  automation: [],
  ai: [],
}

export function collectionsFor(modules) {
  const keys = ['core', ...(modules || ALL_MODULES)]
  return [...new Set(keys.flatMap((k) => MODULE_COLLECTIONS[k] || []))]
}
