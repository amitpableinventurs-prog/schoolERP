import { Briefcase, Building2, GraduationCap, HeartHandshake, ShieldCheck } from 'lucide-react'

// Each kind of user has its own login URL, login page and app theme.
// `roles` must match server/routes/core.js (PORTAL_ROLES).
export const PORTALS = {
  superadmin: {
    key: 'superadmin',
    name: 'Super Admin Console',
    who: 'Institute owner',
    login: '/superadmin/login',
    roles: ['superadmin'],
    icon: ShieldCheck,
    field: { label: 'Email', placeholder: 'owner@institute.com', type: 'email', inputMode: 'email', hint: 'Only for the institute owner / super admin.' },
    headline: 'Control every wing of your institute from one console.',
    features: ['Create and manage wing admins', 'See school, college and coaching together', 'Activity log of every staff action and login', 'Institute-wide settings, fees and reports'],
  },
  admin: {
    key: 'admin',
    name: 'Admin Panel',
    who: 'Wing admins',
    login: '/admin/login',
    roles: ['admin'],
    icon: Building2,
    field: { label: 'Email', placeholder: 'wing@institute.com', type: 'email', inputMode: 'email', hint: 'School, college or coaching wing admins.' },
    headline: 'Run your wing — students, staff, fees and academics.',
    features: ['Admissions, students, classes and batches', 'Fees with installments, receipts and dues', 'Exams, report cards and online tests', 'Staff, transport, notices and automation'],
  },
  staff: {
    key: 'staff',
    name: 'Staff Portal',
    who: 'Teachers, accountants & counsellors',
    login: '/staff/login',
    roles: ['teacher', 'accountant', 'counsellor'],
    icon: Briefcase,
    field: { label: 'Email', placeholder: 'name@institute.com', type: 'email', inputMode: 'email', hint: 'Teachers, accountants and counsellors.' },
    headline: 'Everything you need for your day at the campus.',
    features: ['Mark attendance and enter marks', 'Online tests, LMS courses and homework', 'Fee collection and receipts', 'Admission enquiries and follow-ups'],
  },
  student: {
    key: 'student',
    name: 'Student Portal',
    who: 'Students',
    login: '/student/login',
    roles: ['student'],
    icon: GraduationCap,
    field: { label: 'Admission number', placeholder: 'e.g. SCH260001', type: 'text', inputMode: 'text', hint: 'Your admission number is on your ID card and fee receipt.' },
    headline: 'Your classes, tests and results — all in one place.',
    features: ['Timetable, attendance and results', 'Online tests and video courses', 'Homework submission and study material', 'AI tutor for your doubts'],
  },
  parent: {
    key: 'parent',
    name: 'Parent Portal',
    who: 'Parents & guardians',
    login: '/parent/login',
    roles: ['parent'],
    icon: HeartHandshake,
    field: { label: 'Mobile number', placeholder: '10-digit mobile number', type: 'tel', inputMode: 'numeric', hint: 'The guardian mobile number registered with the institute.' },
    headline: "Stay close to your child's progress every day.",
    features: ['Attendance and results of each child', 'Fees, receipts and dues', 'Homework, notices and leave requests', 'Transport details and bus attendance'],
  },
}

export const portalOfRole = (role) => Object.values(PORTALS).find((p) => p.roles.includes(role))?.key

// Pages that only one portal has, so a signed-out visit can go to the right login.
export function portalForPath(path) {
  if (/^\/(admins|activity)(\/|$)/.test(path)) return 'superadmin'
  if (/^\/my(\/|$)/.test(path)) return 'student'
  if (/^\/(child|children)(\/|$)/.test(path)) return 'parent'
  return null
}

// A `?next=` target is followed only if it is a local page of that portal.
export function safeNext(portalKey, next) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || /\/login$/.test(next.split('?')[0])) return '/'
  const owner = portalForPath(next)
  if (portalKey === 'student' || portalKey === 'parent') return owner === portalKey ? next : '/'
  if (owner === 'superadmin') return portalKey === 'superadmin' ? next : '/'
  return owner ? '/' : next
}

export function rememberedPortal() {
  try { return PORTALS[localStorage.getItem('portal')] ? localStorage.getItem('portal') : null } catch { return null }
}
export function rememberPortal(key) {
  try { localStorage.setItem('portal', key) } catch { /* private mode */ }
}
