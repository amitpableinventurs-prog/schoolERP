import { Link } from 'react-router-dom'
import { ArrowRight, ClipboardList, IndianRupee, MonitorPlay, Phone } from 'lucide-react'
import { useAuth } from '../../lib/auth.jsx'
import { initials, money, TYPE_LABEL } from '../../lib/format.js'
import { Async, Badge, Empty, PageHead, PctBadge, useApi } from '../../components/ui.jsx'

export default function ParentHome() {
  const { user, institute } = useAuth()
  const state = useApi('/parent/children')
  return (
    <>
      <PageHead title={`Namaste, ${user.name.split(' ')[0]} 🙏`} subtitle="Your children at a glance. Open a card for attendance, results, fees, homework and courses.">
        {institute?.phone && <a className="btn" href={`tel:${institute.phone}`}><Phone size={15} /> Call office</a>}
      </PageHead>
      <Async state={state}>{(kids) => kids.length ? (
        <div className="grid grid-2">
          {kids.map((k) => (
            <Link key={k._id} to={`/child/${k._id}`} className="card card-pad stack child-card">
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div className="row" style={{ gap: 12 }}>
                  <div className="avatar avatar-lg">{initials(k.name)}</div>
                  <div>
                    <h2>{k.name}</h2>
                    <div className="small text-2">{k.batch?.name} · <span className="mono">{k.admissionNo}</span></div>
                    <div className="small muted">Class teacher: {k.batch?.classTeacher?.name || '—'}</div>
                  </div>
                </div>
                <Badge tone="info">{TYPE_LABEL[k.batch?.type]}</Badge>
              </div>
              <div className="grid grid-4" style={{ gap: 8 }}>
                <div><div className="small muted">Attendance</div><PctBadge value={k.attendance?.pct} /></div>
                <div><div className="small muted row" style={{ gap: 4 }}><IndianRupee size={12} /> Fee due</div><strong style={{ color: k.feeOverdue ? 'var(--bad-text)' : undefined }}>{money(k.feeBalance)}</strong></div>
                <div><div className="small muted row" style={{ gap: 4 }}><ClipboardList size={12} /> Homework</div><strong style={{ color: k.overdueAssignments ? 'var(--bad-text)' : undefined }}>{k.pendingAssignments} pending</strong></div>
                <div><div className="small muted row" style={{ gap: 4 }}><MonitorPlay size={12} /> Courses</div><strong>{k.courseProgress == null ? '—' : `${k.courseProgress}%`}</strong></div>
              </div>
              {(k.feeOverdue > 0 || k.overdueAssignments > 0 || (k.attendance && k.attendance.pct < 75)) && (
                <div className="alert alert-error small">
                  {[k.feeOverdue > 0 && `${money(k.feeOverdue)} fee overdue`, k.overdueAssignments > 0 && `${k.overdueAssignments} assignment${k.overdueAssignments > 1 ? 's' : ''} overdue`, k.attendance && k.attendance.pct < 75 && 'attendance below 75%'].filter(Boolean).join(' · ')}
                </div>
              )}
              <span className="row small" style={{ color: 'var(--accent)', fontWeight: 600 }}>Open {k.name.split(' ')[0]}&apos;s dashboard <ArrowRight size={14} /></span>
            </Link>
          ))}
        </div>
      ) : <Empty text="No students are linked to your account yet. Please contact the school office." />}</Async>
    </>
  )
}
