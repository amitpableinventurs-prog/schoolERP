import { lazy, Suspense, useEffect } from 'react'
import { KeyRound, Lock, RefreshCw } from 'lucide-react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { can, useAuth } from './lib/auth.jsx'
import Layout from './components/Layout.jsx'
import { Empty, Loading } from './components/ui.jsx'
import Login, { PortalChooser } from './pages/Login.jsx'
import { PORTALS, portalForPath, portalOfRole, rememberedPortal, rememberPortal, safeNext } from './lib/portals.js'
import { ChildScope } from './lib/scope.jsx'

const page = (load) => lazy(load)
const Staff = {
  Dashboard: page(() => import('./pages/staff/Dashboard.jsx')),
  Assistant: page(() => import('./pages/staff/Assistant.jsx')),
  Insights: page(() => import('./pages/staff/Insights.jsx')),
  Students: page(() => import('./pages/staff/Students.jsx')),
  StudentProfile: page(() => import('./pages/staff/StudentProfile.jsx')),
  StaffList: page(() => import('./pages/staff/StaffList.jsx')),
  Batches: page(() => import('./pages/staff/Batches.jsx')),
  Attendance: page(() => import('./pages/staff/Attendance.jsx')),
  Timetable: page(() => import('./pages/staff/Timetable.jsx')),
  Exams: page(() => import('./pages/staff/Exams.jsx')),
  ExamMarks: page(() => import('./pages/staff/ExamMarks.jsx')),
  ReportCard: page(() => import('./pages/staff/ReportCardPage.jsx')),
  ReportCards: page(() => import('./pages/staff/ReportCards.jsx')),
  ExamSchedule: page(() => import('./pages/staff/ExamSchedule.jsx')),
  GradeScales: page(() => import('./pages/staff/GradeScales.jsx')),
  AdmitCards: page(() => import('./pages/staff/AdmitCards.jsx')),
  AdmitCardsIndex: page(() => import('./pages/staff/AdmitCards.jsx').then((m) => ({ default: m.AdmitCardsIndex }))),
  TermReport: page(() => import('./pages/staff/TermReport.jsx')),
  Tests: page(() => import('./pages/staff/Tests.jsx')),
  TestEditor: page(() => import('./pages/staff/TestEditor.jsx')),
  TestResults: page(() => import('./pages/staff/TestResults.jsx')),
  Papers: page(() => import('./pages/staff/Papers.jsx')),
  PaperView: page(() => import('./pages/staff/PaperView.jsx')),
  Materials: page(() => import('./pages/staff/Materials.jsx')),
  Doubts: page(() => import('./pages/staff/Doubts.jsx')),
  Fees: page(() => import('./pages/staff/Fees.jsx')),
  Receipt: page(() => import('./pages/staff/ReceiptPage.jsx')),
  Leads: page(() => import('./pages/staff/Leads.jsx')),
  Notices: page(() => import('./pages/staff/Notices.jsx')),
  Automation: page(() => import('./pages/staff/Automation.jsx')),
  Settings: page(() => import('./pages/staff/Settings.jsx')),
  Courses: page(() => import('./pages/staff/Courses.jsx')),
  CourseBuilder: page(() => import('./pages/staff/CourseBuilder.jsx')),
  Assignments: page(() => import('./pages/staff/Assignments.jsx')),
  AssignmentView: page(() => import('./pages/staff/AssignmentView.jsx')),
  Leaves: page(() => import('./pages/staff/Leaves.jsx')),
  Admins: page(() => import('./pages/staff/Admins.jsx')),
  ActivityLog: page(() => import('./pages/staff/ActivityLog.jsx')),
  DesktopApps: page(() => import('./pages/staff/DesktopApps.jsx')),
  TransportLive: page(() => import('./pages/staff/TransportLive.jsx')),
  TransportDashboard: page(() => import('./pages/staff/TransportDashboard.jsx')),
  TransportVehicles: page(() => import('./pages/staff/TransportVehicles.jsx')),
  TransportRoutes: page(() => import('./pages/staff/TransportRoutes.jsx')),
  TransportAssignments: page(() => import('./pages/staff/TransportAssignments.jsx')),
  TransportAttendance: page(() => import('./pages/staff/TransportAttendance.jsx')),
  TransportFees: page(() => import('./pages/staff/TransportFees.jsx')),
  Certificates: page(() => import('./pages/staff/Certificates.jsx')),
  CertificatePage: page(() => import('./pages/staff/CertificatePage.jsx')),
  CertificateTemplates: page(() => import('./pages/staff/CertificateTemplates.jsx')),
  Payroll: page(() => import('./pages/staff/Payroll.jsx')),
  SalaryStructures: page(() => import('./pages/staff/SalaryStructures.jsx')),
  SalaryAdvances: page(() => import('./pages/staff/SalaryAdvances.jsx')),
  Payslip: page(() => import('./pages/staff/PayslipPage.jsx')),
  MyPayslips: page(() => import('./pages/staff/MyPayslips.jsx')),
  MyPayslip: page(() => import('./pages/staff/PayslipPage.jsx').then((m) => ({ default: m.MyPayslip }))),
  Finance: page(() => import('./pages/staff/FinanceOverview.jsx')),
  Ledger: page(() => import('./pages/staff/FinanceLedger.jsx')),
}
const Portal = {
  Home: page(() => import('./pages/portal/Home.jsx')),
  Attendance: page(() => import('./pages/portal/MyAttendance.jsx')),
  Timetable: page(() => import('./pages/portal/MyTimetable.jsx')),
  Results: page(() => import('./pages/portal/MyResults.jsx')),
  ReportCard: page(() => import('./pages/portal/MyReportCard.jsx')),
  Exams: page(() => import('./pages/portal/MyExams.jsx')),
  AdmitCard: page(() => import('./pages/portal/MyExams.jsx').then((m) => ({ default: m.MyAdmitCard }))),
  Tests: page(() => import('./pages/portal/MyTests.jsx')),
  TakeTest: page(() => import('./pages/portal/TakeTest.jsx')),
  TestReview: page(() => import('./pages/portal/TestReview.jsx')),
  Materials: page(() => import('./pages/portal/MyMaterials.jsx')),
  Doubts: page(() => import('./pages/portal/MyDoubts.jsx')),
  Fees: page(() => import('./pages/portal/MyFees.jsx')),
  Receipt: page(() => import('./pages/portal/MyReceipt.jsx')),
  Notices: page(() => import('./pages/portal/MyNotices.jsx')),
  Courses: page(() => import('./pages/portal/MyCourses.jsx')),
  CoursePlayer: page(() => import('./pages/portal/CoursePlayer.jsx')),
  Assignments: page(() => import('./pages/portal/MyAssignments.jsx')),
  Leaves: page(() => import('./pages/portal/MyLeaves.jsx')),
  Transport: page(() => import('./pages/portal/MyTransport.jsx')),
  Certificates: page(() => import('./pages/portal/MyCertificates.jsx')),
  Certificate: page(() => import('./pages/portal/MyCertificates.jsx').then((m) => ({ default: m.MyCertificate }))),
}
const Verify = page(() => import('./pages/Verify.jsx'))
const DriverTrack = page(() => import('./pages/DriverTrack.jsx'))
const OwnerApp = page(() => import('./pages/owner/Owner.jsx'))
const Parent = {
  Home: page(() => import('./pages/parent/ParentHome.jsx')),
  Child: page(() => import('./pages/parent/ChildOverview.jsx')),
}

function Guard({ section, children }) {
  const { user } = useAuth()
  if (!can(user, section)) return <Empty text="You do not have access to this section." />
  return children
}

const NotFound = () => <Empty text="Page not found." />

function StaffRoutes() {
  const S = Staff
  const g = (section, el) => <Guard section={section}>{el}</Guard>
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={g('dashboard', <S.Dashboard />)} />
        <Route path="assistant" element={g('assistant', <S.Assistant />)} />
        <Route path="insights" element={g('insights', <S.Insights />)} />
        <Route path="students" element={g('students', <S.Students />)} />
        <Route path="students/:id" element={g('students', <S.StudentProfile />)} />
        <Route path="staff" element={g('staff', <S.StaffList />)} />
        <Route path="batches" element={g('batches', <S.Batches />)} />
        <Route path="attendance" element={g('attendance', <S.Attendance />)} />
        <Route path="timetable" element={g('timetable', <S.Timetable />)} />
        <Route path="exams" element={g('exams', <S.Exams />)} />
        <Route path="exams/schedule" element={g('exams', <S.ExamSchedule />)} />
        <Route path="exams/admit-cards" element={g('exams', <S.AdmitCardsIndex />)} />
        <Route path="exams/grades" element={g('exams', <S.GradeScales />)} />
        <Route path="exams/term-report" element={g('exams', <S.TermReport />)} />
        <Route path="exams/:id" element={g('exams', <S.ExamMarks />)} />
        <Route path="exams/:id/admit-cards" element={g('exams', <S.AdmitCards />)} />
        <Route path="exams/:id/report-cards" element={g('exams', <S.ReportCards />)} />
        <Route path="exams/:id/report/:student" element={g('students', <S.ReportCard />)} />
        <Route path="tests" element={g('tests', <S.Tests />)} />
        <Route path="tests/new" element={g('tests', <S.TestEditor />)} />
        <Route path="tests/:id/edit" element={g('tests', <S.TestEditor />)} />
        <Route path="tests/:id/results" element={g('tests', <S.TestResults />)} />
        <Route path="papers" element={g('papers', <S.Papers />)} />
        <Route path="papers/:id" element={g('papers', <S.PaperView />)} />
        <Route path="materials" element={g('materials', <S.Materials />)} />
        <Route path="doubts" element={g('doubts', <S.Doubts />)} />
        <Route path="fees" element={g('fees', <S.Fees />)} />
        <Route path="fees/receipt/:id" element={g('students', <S.Receipt />)} />
        <Route path="leads" element={g('leads', <S.Leads />)} />
        <Route path="notices" element={g('notices', <S.Notices />)} />
        <Route path="automation" element={g('automation', <S.Automation />)} />
        <Route path="settings" element={g('settings', <S.Settings />)} />
        <Route path="lms" element={g('lms', <S.Courses />)} />
        <Route path="lms/:id" element={g('lms', <S.CourseBuilder />)} />
        <Route path="assignments" element={g('assignments', <S.Assignments />)} />
        <Route path="assignments/:id" element={g('assignments', <S.AssignmentView />)} />
        <Route path="leaves" element={g('leaves', <S.Leaves />)} />
        <Route path="admins" element={g('admins', <S.Admins />)} />
        <Route path="activity" element={g('activity', <S.ActivityLog />)} />
        <Route path="desktop-apps" element={g('desktopApps', <S.DesktopApps />)} />
        <Route path="transport" element={g('transport', <S.TransportDashboard />)} />
        <Route path="transport/live" element={g('transport', <S.TransportLive />)} />
        <Route path="transport/vehicles" element={g('transport', <S.TransportVehicles />)} />
        <Route path="transport/routes" element={g('transport', <S.TransportRoutes />)} />
        <Route path="transport/assignments" element={g('transport', <S.TransportAssignments />)} />
        <Route path="transport/attendance" element={g('transport', <S.TransportAttendance />)} />
        <Route path="transport/fees" element={g('transportFees', <S.TransportFees />)} />
        <Route path="certificates" element={g('certificates', <S.Certificates />)} />
        <Route path="certificates/templates" element={g('certificates', <S.CertificateTemplates />)} />
        <Route path="certificates/:id" element={g('certificates', <S.CertificatePage />)} />
        <Route path="payroll" element={g('payroll', <S.Payroll />)} />
        <Route path="payroll/structures" element={g('payroll', <S.SalaryStructures />)} />
        <Route path="payroll/advances" element={g('payroll', <S.SalaryAdvances />)} />
        <Route path="payroll/payslip/:id" element={g('payroll', <S.Payslip />)} />
        <Route path="payslips" element={g('myPayslips', <S.MyPayslips />)} />
        <Route path="payslips/:id" element={g('myPayslips', <S.MyPayslip />)} />
        <Route path="finance" element={g('finance', <S.Finance />)} />
        <Route path="finance/ledger" element={g('finance', <S.Ledger />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

function PortalRoutes() {
  const P = Portal
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<P.Home />} />
        <Route path="my/attendance" element={<P.Attendance />} />
        <Route path="my/timetable" element={<P.Timetable />} />
        <Route path="my/results" element={<P.Results />} />
        <Route path="my/results/:exam" element={<P.ReportCard />} />
        <Route path="my/exams" element={<P.Exams />} />
        <Route path="my/exams/:exam/admit-card" element={<P.AdmitCard />} />
        <Route path="my/tests" element={<P.Tests />} />
        <Route path="my/tests/:id/take" element={<P.TakeTest />} />
        <Route path="my/tests/:id/review" element={<P.TestReview />} />
        <Route path="my/materials" element={<P.Materials />} />
        <Route path="my/doubts" element={<P.Doubts />} />
        <Route path="my/fees" element={<P.Fees />} />
        <Route path="my/fees/receipt/:id" element={<P.Receipt />} />
        <Route path="my/notices" element={<P.Notices />} />
        <Route path="my/courses" element={<P.Courses />} />
        <Route path="my/courses/:id" element={<P.CoursePlayer />} />
        <Route path="my/assignments" element={<P.Assignments />} />
        <Route path="my/leaves" element={<P.Leaves />} />
        <Route path="my/transport" element={<P.Transport />} />
        <Route path="my/certificates" element={<P.Certificates />} />
        <Route path="my/certificates/:id" element={<P.Certificate />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

// Parents see the student portal's pages read-only, one child at a time.
function ParentRoutes() {
  const P = Portal
  const { user } = useAuth()
  const only = user.children?.length === 1 ? user.children[0]._id : null
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={only ? <Navigate to={`/child/${only}`} replace /> : <Parent.Home />} />
        <Route path="children" element={<Parent.Home />} />
        <Route path="child/:childId" element={<ChildScope />}>
          <Route index element={<Parent.Child />} />
          <Route path="attendance" element={<P.Attendance />} />
          <Route path="timetable" element={<P.Timetable />} />
          <Route path="results" element={<P.Results />} />
          <Route path="results/:exam" element={<P.ReportCard />} />
          <Route path="exams" element={<P.Exams />} />
          <Route path="exams/:exam/admit-card" element={<P.AdmitCard />} />
          <Route path="tests" element={<P.Tests />} />
          <Route path="tests/:id/review" element={<P.TestReview />} />
          <Route path="courses" element={<P.Courses />} />
          <Route path="assignments" element={<P.Assignments />} />
          <Route path="materials" element={<P.Materials />} />
          <Route path="fees" element={<P.Fees />} />
          <Route path="fees/receipt/:id" element={<P.Receipt />} />
          <Route path="notices" element={<P.Notices />} />
          <Route path="leaves" element={<P.Leaves />} />
          <Route path="transport" element={<P.Transport />} />
          <Route path="certificates" element={<P.Certificates />} />
          <Route path="certificates/:id" element={<P.Certificate />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

// Signed out: send each page to the login of the portal it belongs to.
function ToLogin() {
  const { pathname, search } = useLocation()
  const key = portalForPath(pathname) || rememberedPortal()
  if (!key) return <Navigate to="/login" replace />
  const next = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`
  return <Navigate to={`${PORTALS[key].login}${next}`} replace />
}

// Desktop licence locked (deactivated key, too long offline) or institute suspended.
// Checks again by itself, so the app opens as soon as the key is activated again.
function LockScreen({ message }) {
  const { refresh } = useAuth()
  useEffect(() => {
    const timer = setInterval(refresh, 10_000)
    return () => clearInterval(timer)
  }, [refresh])
  return (
    <div className="auth-wrap">
      <section className="auth-form" style={{ margin: '0 auto' }}>
        <div className="card card-pad auth-card stack">
          <div className="auth-card-icon"><Lock size={22} /></div>
          <h1>This app is locked</h1>
          <div className="alert alert-error">{message}</div>
          <p className="small muted">It checks again every few seconds and opens by itself as soon as access is restored (for the desktop app: when the key is activated again and this computer is online).</p>
          <button className="btn" onClick={refresh}><RefreshCw size={15} /> Check now</button>
          {window.sc?.changeKey && <button className="btn btn-ghost" onClick={() => window.sc.changeKey()}><KeyRound size={15} /> Use a different key</button>}
        </div>
      </section>
    </div>
  )
}

const isLoginPath = (path) => path === '/login' || Object.values(PORTALS).some((p) => p.login === path)

export default function App() {
  const { loading, user, locked } = useAuth()
  const { pathname, search } = useLocation()
  const portal = user && portalOfRole(user.role)
  useEffect(() => { if (portal) rememberPortal(portal) }, [portal])

  // Certificate verification is public, signed in or not.
  if (pathname.startsWith('/verify')) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes><Route path="/verify/:serial?" element={<Verify />} /></Routes>
      </Suspense>
    )
  }
  // The bus driver's tracking page needs no login (the token in the link identifies the bus).
  if (pathname.startsWith('/track/')) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes><Route path="/track/:token" element={<DriverTrack />} /></Routes>
      </Suspense>
    )
  }
  // The provider's owner console has its own login, separate from institute users.
  if (pathname === '/owner' || pathname.startsWith('/owner/')) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes><Route path="/owner/*" element={<OwnerApp />} /></Routes>
      </Suspense>
    )
  }
  if (loading) return <Loading text="Starting…" />
  if (locked) return <LockScreen message={locked} />
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<PortalChooser />} />
        {Object.values(PORTALS).map((p) => <Route key={p.key} path={p.login} element={<Login portal={p.key} />} />)}
        <Route path="*" element={<ToLogin />} />
      </Routes>
    )
  }
  // Signed in on a login URL (just logged in, or a bookmark): continue to the app.
  if (isLoginPath(pathname)) return <Navigate to={safeNext(portal, new URLSearchParams(search).get('next'))} replace />
  return (
    <Suspense fallback={<Loading />}>
      {user.role === 'student' ? <PortalRoutes /> : user.role === 'parent' ? <ParentRoutes /> : <StaffRoutes />}
    </Suspense>
  )
}
