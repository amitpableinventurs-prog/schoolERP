import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, KeyRound, Pencil, Phone, Trash2, UserRound } from 'lucide-react'
import { api } from '../../lib/api.js'
import { isAdmin, useAuth } from '../../lib/auth.jsx'
import { fmtDate, fmtDateTime, initials, money, TYPE_LABEL, waLink } from '../../lib/format.js'
import StudentForm from '../../components/StudentForm.jsx'
import { Async, Badge, Confirm, Empty, PctBadge, StatTile, StatusBadge, Tabs, useAction, useApi, useToast, WhatsAppIcon } from '../../components/ui.jsx'

export default function StudentProfile() {
  const { id } = useParams()
  const state = useApi(`/students/${id}`)
  const [tab, setTab] = useState('overview')
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [run, busy] = useAction()
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()

  const resetPassword = async () => {
    const r = await run(() => api.post(`/students/${id}/reset-password`))
    if (r) toast(`Login: ${r.loginId} / ${r.password}`)
  }

  const parentLogin = async () => {
    const r = await run(() => api.post(`/students/${id}/parent-login`))
    if (r) {
      toast(`Parent login: ${r.loginId} / ${r.password}`)
      state.reload()
    }
  }

  const remove = async () => {
    const r = await run(() => api.del(`/students/${id}`))
    if (r) {
      toast(r.deactivated ? 'Student has payments, so they were marked inactive instead.' : 'Student deleted.')
      navigate('/students')
    }
  }

  return (
    <Async state={state}>{(d) => {
      const s = d.student
      const balance = d.fees.reduce((a, f) => a + f.balance, 0)
      const overdue = d.fees.filter((f) => f.status === 'overdue').reduce((a, f) => a + f.balance, 0)
      return (
        <>
          <div className="row mb"><Link to="/students" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Students</Link></div>
          <div className="card card-pad mb">
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div className="row" style={{ gap: 14 }}>
                <div className="avatar avatar-lg">{initials(s.name)}</div>
                <div>
                  <h1>{s.name}</h1>
                  <div className="row text-2" style={{ marginTop: 4 }}>
                    <span className="mono">{s.admissionNo}</span>·<span>{s.batch?.name}</span><Badge tone="info">{TYPE_LABEL[s.batch?.type]}</Badge><StatusBadge value={s.status} />
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    Portal login: <span className="mono">{d.login?.loginId || '—'}</span>{d.login?.lastLoginAt && ` · last seen ${fmtDateTime(d.login.lastLoginAt)}`}
                  </div>
                  <div className="small muted">
                    Parent login: <span className="mono">{d.parent?.loginId || '—'}</span>
                    {d.parent && (d.parent.lastLoginAt ? ` · last seen ${fmtDateTime(d.parent.lastLoginAt)}` : ' · never logged in')}
                    {d.parent?.children?.length > 1 && ` · also parent of ${d.parent.children.filter((c) => c._id !== s._id).map((c) => c.name).join(', ')}`}
                  </div>
                </div>
              </div>
              <div className="page-actions">
                {s.guardianPhone && <a className="btn" href={`tel:${s.guardianPhone}`}><Phone size={15} /> Call guardian</a>}
                {s.guardianPhone && <a className="btn" target="_blank" rel="noreferrer" href={waLink(s.guardianPhone, `Dear ${s.guardianName || 'Parent'}, `)}><WhatsAppIcon size={15} /> WhatsApp</a>}
                <button className="btn" onClick={resetPassword} disabled={busy}><KeyRound size={15} /> Reset login</button>
                <button className="btn" onClick={parentLogin} disabled={busy || !s.guardianPhone} title={s.guardianPhone ? 'Create or reset the parent portal login' : 'Add a guardian phone first'}><UserRound size={15} /> {d.parent ? 'Reset parent login' : 'Create parent login'}</button>
                <button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</button>
                {isAdmin(user) && <button className="btn btn-danger" onClick={() => setDeleting(true)}><Trash2 size={15} /></button>}
              </div>
            </div>
          </div>

          <div className="grid grid-4 mb">
            <StatTile label="Attendance (90 days)" value={d.attendance.summary?.pct != null ? `${d.attendance.summary.pct}%` : '—'} foot={d.attendance.summary ? `${d.attendance.summary.present}/${d.attendance.summary.total} days present` : ''} />
            <StatTile label="Fee balance" value={money(balance)} foot={overdue ? `${money(overdue)} overdue` : 'Nothing overdue'} tone={overdue ? 'bad' : undefined} />
            <StatTile label="Latest exam" value={d.marks[0] ? `${d.marks[0].percent}%` : '—'} foot={d.marks[0] ? `${d.marks[0].exam?.name} · Rank ${d.marks[0].rank}` : 'No exams yet'} />
            <StatTile label="Exams taken" value={d.marks.length} />
          </div>

          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'overview', label: 'Profile' }, { value: 'fees', label: 'Fees' }, { value: 'results', label: 'Results' }, { value: 'attendance', label: 'Attendance' }]} />

          {tab === 'overview' && (
            <div className="card card-pad">
              <div className="form-grid">
                {[
                  ['Gender', s.gender], ['Date of birth', fmtDate(s.dob)], ['Phone', s.phone], ['Email', s.email],
                  ['Guardian', s.guardianName], ['Guardian phone', s.guardianPhone], ['Address', s.address], ['Admission date', fmtDate(s.admissionDate)],
                  ['Roll no.', s.rollNo], ['Class teacher', s.batch?.classTeacher?.name], ['Program', s.batch?.program], ['Notes', s.notes],
                ].map(([k, v]) => (
                  <div key={k}><div className="small muted">{k}</div><div style={{ textTransform: k === 'Gender' ? 'capitalize' : undefined }}>{v || '—'}</div></div>
                ))}
              </div>
            </div>
          )}

          {tab === 'fees' && (
            <div className="grid grid-2">
              <div className="card">
                <div className="card-head"><h2>Installments</h2><Link className="small" to={`/fees?student=${s._id}`}>Collect fee →</Link></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Installment</th><th>Due</th><th className="num">Amount</th><th className="num">Balance</th><th>Status</th></tr></thead>
                    <tbody>{d.fees.map((f) => (
                      <tr key={f._id}><td>{f.title}</td><td>{fmtDate(f.dueDate)}</td><td className="num">{money(f.amount - (f.discount || 0))}</td><td className="num">{money(f.balance)}</td><td><StatusBadge value={f.status} /></td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
              <div className="card">
                <div className="card-head"><h2>Payments</h2></div>
                {d.payments.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="num">Amount</th></tr></thead>
                      <tbody>{d.payments.map((p) => (
                        <tr key={p._id}><td><Link to={`/fees/receipt/${p._id}`} className="mono">{p.receiptNo}</Link></td><td>{fmtDate(p.paidOn)}</td><td style={{ textTransform: 'uppercase' }}>{p.mode}</td><td className="num">{money(p.amount)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <Empty text="No payments yet." />}
              </div>
            </div>
          )}

          {tab === 'results' && (
            <div className="card">
              {d.marks.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Exam</th><th>Date</th><th>Subjects</th><th className="num">%</th><th>Grade</th><th className="num">Rank</th><th>Remark</th><th /></tr></thead>
                    <tbody>{d.marks.map((m) => (
                      <tr key={m._id}>
                        <td className="cell-title">{m.exam?.name}</td>
                        <td>{fmtDate(m.exam?.date)}</td>
                        <td className="small text-2">{m.scores.map((sc) => `${sc.subject}: ${sc.marks}`).join(' · ')}</td>
                        <td className="num"><PctBadge value={m.percent} warnBelow={50} badBelow={35} /></td>
                        <td>{m.grade}</td>
                        <td className="num">{m.rank}</td>
                        <td className="small text-2" style={{ maxWidth: 260 }}>{m.remark || '—'}</td>
                        <td><Link className="btn btn-sm" to={`/exams/${m.exam?._id}/report/${s._id}`}>Report card</Link></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <Empty text="No exam results yet." />}
            </div>
          )}

          {tab === 'attendance' && (
            <div className="card card-pad">
              <h3 className="mb">Last 30 marked days</h3>
              {d.attendance.recent.length ? (
                <div className="row" style={{ gap: 6 }}>
                  {d.attendance.recent.map((a) => (
                    <div key={a._id} className={`badge ${a.status === 'P' ? 'badge-good' : a.status === 'A' ? 'badge-bad' : 'badge-warn'}`} title={fmtDate(a.date)}>
                      {a.date.slice(8)}/{a.date.slice(5, 7)} {a.status}
                    </div>
                  ))}
                </div>
              ) : <Empty text="No attendance yet." />}
            </div>
          )}

          {editing && <StudentForm student={s} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); state.reload() }} />}
          {deleting && <Confirm text={`Delete ${s.name}? Students with fee payments are marked inactive instead, to keep the accounts intact.`} onConfirm={remove} onClose={() => setDeleting(false)} busy={busy} />}
        </>
      )
    }}</Async>
  )
}
