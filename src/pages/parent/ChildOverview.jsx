import { Link } from 'react-router-dom'
import { Bell, CalendarDays, CalendarX2, ClipboardCheck, ClipboardList, GraduationCap, IndianRupee, MonitorPlay, Phone } from 'lucide-react'
import { useAuth } from '../../lib/auth.jsx'
import { assignmentState, fmtDate, money, TYPE_LABEL } from '../../lib/format.js'
import { useScope } from '../../lib/scope.jsx'
import { Async, Badge, Empty, Meter, PageHead, StatTile, useApi } from '../../components/ui.jsx'

// A parent's dashboard for one child.
export default function ChildOverview() {
  const { api, to } = useScope()
  const { institute } = useAuth()
  const state = useApi(`${api}/home`)
  return (
    <Async state={state}>{(d) => {
      const s = d.student
      const first = s.name.split(' ')[0]
      return (
        <>
          <PageHead title={s.name} subtitle={`${s.batch.name} · ${TYPE_LABEL[s.batch.type]} · Admission no. ${s.admissionNo} · Roll no. ${s.rollNo ?? '—'} · Class teacher: ${s.batch.classTeacher?.name || '—'}`}>
            <Link className="btn" to={to('leaves')}><CalendarX2 size={15} /> Apply for leave</Link>
            {institute?.phone && <a className="btn" href={`tel:${institute.phone}`}><Phone size={15} /> Call school</a>}
          </PageHead>

          <div className="grid grid-4 mb">
            <StatTile icon={ClipboardCheck} label="Attendance (30 days)" value={d.attendance?.pct != null ? `${d.attendance.pct}%` : '—'} foot={d.attendance ? `${d.attendance.present} present · ${d.attendance.absent} absent · ${d.attendance.leave} leave` : ''} tone={d.attendance?.pct < 75 ? 'bad' : 'good'} />
            <StatTile icon={IndianRupee} label="Fee balance" value={money(d.fees.balance)} foot={d.fees.next ? `Next: ${money(d.fees.next.balance)} due ${fmtDate(d.fees.next.dueDate)}` : 'All clear'} tone={d.fees.next?.status === 'overdue' ? 'bad' : undefined} />
            <StatTile icon={GraduationCap} label="Last result" value={d.lastResult ? `${d.lastResult.percent}%` : '—'} foot={d.lastResult ? `${d.lastResult.exam.name} · Grade ${d.lastResult.grade} · Rank ${d.lastResult.rank}` : 'No published results'} />
            <StatTile icon={ClipboardList} label="Homework pending" value={d.assignments.pending.length} foot={d.assignments.pending.some((a) => a.overdue) ? 'Some are overdue' : d.assignments.pending[0] ? `Next due ${fmtDate(d.assignments.pending[0].dueDate)}` : 'All submitted'} tone={d.assignments.pending.some((a) => a.overdue) ? 'bad' : 'ai'} />
          </div>

          <div className="grid grid-2 mb">
            <div className="card">
              <div className="card-head"><h2 className="row"><ClipboardList size={17} /> Homework & assignments</h2><Link to={to('assignments')} className="small">All →</Link></div>
              <div className="card-body stack">
                {[...d.assignments.pending, ...d.assignments.recentGraded].slice(0, 6).map((a) => {
                  const st = assignmentState(a)
                  return (
                    <div key={a._id} className="row between" style={{ alignItems: 'flex-start' }}>
                      <div>
                        <strong>{a.title}</strong>
                        <div className="small muted">{a.subject} · due {fmtDate(a.dueDate)}</div>
                        {a.submission?.feedback && <div className="small text-2">“{a.submission.feedback}”</div>}
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                  )
                })}
                {!d.assignments.pending.length && !d.assignments.recentGraded.length && <span className="muted">No assignments yet.</span>}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h2 className="row"><MonitorPlay size={17} /> Online courses</h2><Link to={to('courses')} className="small">All →</Link></div>
              <div className="card-body stack">
                {d.courses.length ? d.courses.map((c) => (
                  <div key={c._id} className="stack" style={{ gap: 4 }}>
                    <div className="row between"><strong>{c.title}</strong><span className="small">{c.completed}/{c.total} lessons · {c.pct}%</span></div>
                    <Meter value={c.pct} color={c.pct === 100 ? 'var(--good)' : undefined} />
                    {c.quizPct != null && <span className="small muted">Quiz average {c.quizPct}%</span>}
                  </div>
                )) : <span className="muted">No courses yet.</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-3">
            <div className="card">
              <div className="card-head"><h2 className="row"><CalendarDays size={17} /> Today&apos;s classes</h2><Link to={to('timetable')} className="small">Week →</Link></div>
              <div className="card-body stack">
                {d.today.length ? d.today.map((t) => (
                  <div key={t._id} className="row between"><div><strong>{t.subject}</strong><div className="small muted">{t.teacher?.name}</div></div><span className="mono small">{t.start}–{t.end}</span></div>
                )) : <span className="muted">No classes today.</span>}
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h2 className="row"><GraduationCap size={17} /> Tests</h2><Link to={to('tests')} className="small">All →</Link></div>
              <div className="card-body stack">
                {d.pendingTests.length ? d.pendingTests.map((t) => (
                  <div key={t._id}><strong>{t.title}</strong><div className="small muted">Not attempted yet · {t.questions} questions · {t.durationMin} min</div></div>
                )) : <span className="muted">{first} has no pending online tests.</span>}
                <Link to={to('results')} className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>Exam results & report cards</Link>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h2 className="row"><Bell size={17} /> Notices</h2><Link to={to('notices')} className="small">All →</Link></div>
              <div className="card-body stack">
                {d.notices.length ? d.notices.map((n) => (
                  <div key={n._id}><strong>{n.title}</strong> {n.pinned && <Badge tone="warn">Pinned</Badge>}<div className="small text-2">{n.body.slice(0, 120)}{n.body.length > 120 ? '…' : ''}</div></div>
                )) : <Empty text="No notices." />}
              </div>
            </div>
          </div>
        </>
      )
    }}</Async>
  )
}
