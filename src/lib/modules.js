import {
  Activity, Award, BookOpen, BookText, Bot, Bus, CalendarDays, CalendarX2, ChartPie, ClipboardCheck, ClipboardList, Contact, FileQuestion, FileText,
  GraduationCap, HandCoins, IndianRupee, LayoutDashboard, Layers, Map, Megaphone, MessageCircleQuestion, Monitor, MonitorPlay, Navigation, Receipt, Route as RouteIcon,
  Settings, ScrollText, ShieldAlert, ShieldCheck, SlidersHorizontal, Timer, UserCog, Users, Wallet, Workflow,
} from 'lucide-react'
import { can } from './auth.jsx'

// Every staff module once. `cat` and `color` drive the dashboard's Ecosystem Hub;
// `section` is the ACCESS key that decides who sees it.
const M = {
  dashboard: { to: '/', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard', end: true, cat: 'Admin', color: 'blue' },
  assistant: { to: '/assistant', label: 'AI Assistant', icon: Bot, section: 'assistant', ai: true, cat: 'Engagement', color: 'violet' },
  insights: { to: '/insights', label: 'Smart Insights', icon: ShieldAlert, section: 'insights', ai: true, cat: 'Students', color: 'red' },
  admins: { to: '/admins', label: 'Admins & Wings', icon: ShieldCheck, section: 'admins', cat: 'Admin', color: 'slate' },
  activity: { to: '/activity', label: 'Activity Log', icon: Activity, section: 'activity', cat: 'Admin', color: 'teal' },
  desktopApps: { to: '/desktop-apps', label: 'Desktop Apps', icon: Monitor, section: 'desktopApps', cat: 'Admin', color: 'indigo' },
  fees: { to: '/fees', label: 'Fees & Collection', icon: IndianRupee, section: 'fees', cat: 'Finance', color: 'green' },
  transportFees: { to: '/transport/fees', label: 'Transport Fees', icon: Receipt, section: 'transportFees', cat: 'Finance', color: 'orange' },
  finance: { to: '/finance', label: 'Finance Overview', icon: ChartPie, section: 'finance', end: true, cat: 'Finance', color: 'blue' },
  ledger: { to: '/finance/ledger', label: 'Income & Expenses', icon: BookText, section: 'finance', cat: 'Finance', color: 'teal' },
  payroll: { to: '/payroll', label: 'Payroll', icon: Wallet, section: 'payroll', end: true, cat: 'Finance', color: 'violet' },
  salaryStructures: { to: '/payroll/structures', label: 'Salary Structures', icon: SlidersHorizontal, section: 'payroll', cat: 'Finance', color: 'indigo' },
  advances: { to: '/payroll/advances', label: 'Advances & Loans', icon: HandCoins, section: 'payroll', cat: 'Finance', color: 'pink' },
  myPayslips: { to: '/payslips', label: 'My Payslips', icon: FileText, section: 'myPayslips', cat: 'Admin', color: 'green' },
  students: { to: '/students', label: 'Students', icon: Users, section: 'students', cat: 'Students', color: 'blue' },
  batches: { to: '/batches', label: 'Classes & Batches', icon: Layers, section: 'batches', cat: 'Students', color: 'indigo' },
  leaves: { to: '/leaves', label: 'Leave Requests', icon: CalendarX2, section: 'leaves', count: 'leaves', cat: 'Students', color: 'pink' },
  attendance: { to: '/attendance', label: 'Attendance', icon: ClipboardCheck, section: 'attendance', cat: 'Academics', color: 'orange' },
  timetable: { to: '/timetable', label: 'Timetable', icon: CalendarDays, section: 'timetable', cat: 'Academics', color: 'green' },
  exams: { to: '/exams', label: 'Exams & Results', icon: GraduationCap, section: 'exams', cat: 'Academics', color: 'blue' },
  materials: { to: '/materials', label: 'Study Material', icon: BookOpen, section: 'materials', cat: 'Academics', color: 'teal' },
  doubts: { to: '/doubts', label: 'Doubts', icon: MessageCircleQuestion, section: 'doubts', cat: 'Academics', color: 'pink' },
  tests: { to: '/tests', label: 'Online Tests', icon: Timer, section: 'tests', cat: 'Academics', color: 'violet' },
  papers: { to: '/papers', label: 'Question Papers', icon: FileQuestion, section: 'papers', ai: true, cat: 'Academics', color: 'orange' },
  lms: { to: '/lms', label: 'Courses (LMS)', icon: MonitorPlay, section: 'lms', cat: 'Academics', color: 'red' },
  assignments: { to: '/assignments', label: 'Assignments', icon: ClipboardList, section: 'assignments', cat: 'Academics', color: 'indigo' },
  transport: { to: '/transport', label: 'Transport Dashboard', icon: Bus, section: 'transport', end: true, cat: 'Operations', color: 'orange' },
  transportLive: { to: '/transport/live', label: 'Live Bus Tracking', icon: Navigation, section: 'transport', cat: 'Operations', color: 'green' },
  vehicles: { to: '/transport/vehicles', label: 'Vehicles', icon: Bus, section: 'transport', cat: 'Operations', color: 'slate' },
  routes: { to: '/transport/routes', label: 'Routes & Stops', icon: RouteIcon, section: 'transport', cat: 'Operations', color: 'teal' },
  transportStudents: { to: '/transport/assignments', label: 'Transport Students', icon: Map, section: 'transport', cat: 'Operations', color: 'blue' },
  transportAttendance: { to: '/transport/attendance', label: 'Trip Attendance', icon: ClipboardCheck, section: 'transport', cat: 'Operations', color: 'green' },
  certificates: { to: '/certificates', label: 'Issued Certificates', icon: Award, section: 'certificates', end: true, cat: 'Students', color: 'violet' },
  certTemplates: { to: '/certificates/templates', label: 'Certificate Templates', icon: ScrollText, section: 'certificates', cat: 'Admin', color: 'orange' },
  leads: { to: '/leads', label: 'Admissions CRM', icon: Contact, section: 'leads', cat: 'Engagement', color: 'teal' },
  notices: { to: '/notices', label: 'Notices', icon: Megaphone, section: 'notices', cat: 'Engagement', color: 'pink' },
  staff: { to: '/staff', label: 'Staff Directory', icon: UserCog, section: 'staff', cat: 'Operations', color: 'indigo' },
  automation: { to: '/automation', label: 'Automation', icon: Workflow, section: 'automation', cat: 'Admin', color: 'violet' },
  settings: { to: '/settings', label: 'Settings', icon: Settings, section: 'settings', cat: 'Admin', color: 'slate' },
}

// Sidebar: sections of links; an item with `children` is a collapsible group.
export const STAFF_MENU = [
  { title: 'Main Navigation', items: [M.dashboard, M.assistant, M.insights] },
  { title: 'Super Admin', items: [M.admins, M.activity, M.desktopApps] },
  { title: 'Management', items: [
    { label: 'Finance & Fees', icon: IndianRupee, children: [M.finance, M.fees, M.transportFees, M.ledger] },
    { label: 'Payroll', icon: Wallet, children: [M.payroll, M.salaryStructures, M.advances] },
    { label: 'Student Information', icon: Users, children: [M.students, M.batches, M.leaves] },
    { label: 'Academics', icon: GraduationCap, children: [M.attendance, M.timetable, M.exams, M.materials, M.doubts] },
    { label: 'Online Examinations', icon: Timer, children: [M.tests, M.papers] },
    { label: 'Learning (LMS)', icon: MonitorPlay, children: [M.lms, M.assignments] },
    { label: 'Certificates', icon: Award, children: [M.certificates, M.certTemplates] },
    { label: 'Transport', icon: Bus, children: [M.transport, M.transportLive, M.vehicles, M.routes, M.transportStudents, M.transportAttendance] },
    { label: 'Front Office', icon: Contact, children: [M.leads, M.notices] },
    { label: 'Human Resource', icon: UserCog, children: [M.staff, M.myPayslips] },
    { label: 'System', icon: Settings, children: [M.automation, M.settings] },
  ] },
]

export const HUB_CATEGORIES = ['Finance', 'Academics', 'Students', 'Operations', 'Engagement', 'Admin']

// The menu trimmed to what this user may open (empty groups and sections dropped).
export function menuFor(user, menu = STAFF_MENU) {
  return menu.map((s) => ({
    ...s,
    items: s.items
      .map((i) => (i.children ? { ...i, children: i.children.filter((c) => !c.section || can(user, c.section)) } : i))
      .filter((i) => (i.children ? i.children.length : !i.section || can(user, i.section))),
  })).filter((s) => s.items.length)
}

// Every link in a menu, flattened.
export const flatLinks = (menu) => menu.flatMap((s) => s.items.flatMap((i) => i.children || [i]))

// Quick-create shortcuts for the topbar "+" menu.
export const QUICK_ADD = [
  { to: '/students', label: 'Add student', icon: Users, section: 'students' },
  { to: '/fees', label: 'Collect fee', icon: IndianRupee, section: 'fees' },
  { to: '/finance/ledger?add=expense', label: 'Record expense', icon: BookText, section: 'finance' },
  { to: '/attendance', label: 'Mark attendance', icon: ClipboardCheck, section: 'attendance' },
  { to: '/notices', label: 'Post notice', icon: Megaphone, section: 'notices' },
  { to: '/leads', label: 'New enquiry', icon: Contact, section: 'leads' },
  { to: '/tests/new', label: 'Create online test', icon: Timer, section: 'tests' },
  { to: '/certificates?issue=1', label: 'Issue certificate', icon: Award, section: 'certificates' },
]
