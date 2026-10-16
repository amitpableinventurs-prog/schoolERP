import { Link } from 'react-router-dom'
import { Bell, Brain, CalendarDays, ClipboardCheck, ClipboardList, GraduationCap, IndianRupee, MonitorPlay, Timer } from 'lucide-react'
import { fmtDate, money, TYPE_LABEL } from '../../lib/format.js'
import { Async, Badge, Empty, Meter, PageHead, StatTile, useApi } from '../../components/ui.jsx'

export default function Home() {
  const state = useApi('/portal/home')
  return (
    <Async state={state}>{(d) => (
      <>
        <PageHead title={`Hi ${d.student.name.split(' ')[0]} 👋`} subtitle={`${d.student.batch.name} · ${TYPE_LABEL[d.student.batch.type]} · Admission no. ${d.student.admissionNo}`}>
          <Link className="btn btn-ai" to="/my/doubts"><Brain size={16} /> Ask AI Tutor</Link>
        </PageHead>
        <div className="grid grid-4 mb">
          <StatTile icon={ClipboardCheck} label="Attendance (30 days)" value={d.attendance?.pct != null ? `${d.attendance.pct}%` : '—'} foot={d.attendance ? `${d.attendance.present} of ${d.attendance.total} days` : ''} tone={d.attendance?.pct < 75 ? 'bad' : 'good'} />
          <StatTile icon={IndianRupee} label="Fee balance" value={money(d.fees.balance)} foot={d.fees.next ? `Next: ${money(d.fees.next.balance)} due ${fmtDate(d.fees.next.dueDate)}` : 'All clear'} tone={d.fees.next?.status === 'overdue' ? 'bad' : undefined} />
          <StatTile icon={GraduationCap} label="Last result" value={d.lastResult ? `${d.lastResult.percent}%` : '—'} foot={d.lastResult ? `${d.lastResult.exam.name} · Rank ${d.lastResult.rank}` : 'No published results'} />
          <StatTile icon={Timer} label="Pending tests" value={d.pendingTests.length} foot={d.pendingTests[0]?.title} tone="ai" />
        </div>
        <div className="grid grid-2 mb">
          <div className="card">
            <div className="card-head"><h2 className="row"><MonitorPlay size={17} /> My courses</h2><Link to="/my/courses" className="small">All →</Link></div>
            <div className="card-body stack">
              {d.courses.length ? d.courses.slice(0, 4).map((c) => (
                <Link key={c._id} to={`/my/courses/${c._id}`} className="stack" style={{ gap: 4, color: 'inherit', textDecoration: 'none' }}>
                  <div className="row between"><strong>{c.title}</strong><span className="small">{c.pct}%</span></div>
                  <Meter value={c.pct} color={c.pct === 100 ? 'var(--good)' : undefined} />
                  <span className="small muted">{c.nextLessonTitle ? `Next: ${c.nextLessonTitle}` : 'Completed'}</span>
                </Link>
              )) : <span className="muted">No courses yet.</span>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2 className="row"><ClipboardList size={17} /> Assignments due</h2><Link to="/my/assignments" className="small">All →</Link></div>
            <div className="card-body stack">
              {d.assignments.pending.length ? d.assignments.pending.slice(0, 4).map((a) => (
                <div key={a._id} className="row between">
                  <div><strong>{a.title}</strong><div className="small muted">{a.subject} · {a.maxMarks} marks</div></div>
                  <Badge tone={a.overdue ? 'bad' : 'warn'}>{a.overdue ? 'Overdue' : 'Due'} {fmtDate(a.dueDate).replace(/ \d{4}$/, '')}</Badge>
                </div>
              )) : <span className="muted">Nothing due. 🎉</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-3">
          <div className="card">
            <div className="card-head"><h2 className="row"><CalendarDays size={17} /> Today&apos;s classes</h2><Link to="/my/timetable" className="small">Week →</Link></div>
            <div className="card-body stack">
              {d.today.length ? d.today.map((s) => (
                <div key={s._id} className="row between"><div><strong>{s.subject}</strong><div className="small muted">{s.teacher?.name}</div></div><span className="mono small">{s.start}–{s.end}</span></div>
              )) : <span className="muted">No classes today.</span>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2 className="row"><Timer size={17} /> Online tests</h2><Link to="/my/tests" className="small">All →</Link></div>
            <div className="card-body stack">
              {d.pendingTests.length ? d.pendingTests.map((t) => (
                <div key={t._id} className="row between">
                  <div><strong>{t.title}</strong><div className="small muted">{t.questions} questions · {t.durationMin} min</div></div>
                  <Link className="btn btn-sm btn-primary" to={`/my/tests/${t._id}/take`}>Start</Link>
                </div>
              )) : <span className="muted">You&apos;re all caught up.</span>}
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h2 className="row"><Bell size={17} /> Notices</h2><Link to="/my/notices" className="small">All →</Link></div>
            <div className="card-body stack">
              {d.notices.length ? d.notices.map((n) => (
                <div key={n._id}><strong>{n.title}</strong> {n.pinned && <Badge tone="warn">Pinned</Badge>}<div className="small text-2">{n.body.slice(0, 120)}{n.body.length > 120 ? '…' : ''}</div></div>
              )) : <Empty text="No notices." />}
            </div>
          </div>
        </div>
      </>
    )}</Async>
  )
}
