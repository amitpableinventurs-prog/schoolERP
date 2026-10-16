import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Building2, Plus, ShieldCheck } from 'lucide-react'
import { ROLE_NAME, WING_LABEL } from '../../lib/auth.jsx'
import { fmtDateTime } from '../../lib/format.js'
import { UserForm } from './Settings.jsx'
import { Async, Badge, Empty, PageHead, Segmented, useApi, WingBadges } from '../../components/ui.jsx'

// Super admin: who manages which wing, and how active each login has been this week.
export default function Admins() {
  const overview = useApi('/admin/overview')
  const [who, setWho] = useState('admins')
  const list = useApi(`/admin/admins${who === 'all' ? '?all=1' : ''}`)
  const [form, setForm] = useState(null) // { user } to edit, { wings } to create
  const reload = () => { overview.reload(); list.reload() }

  return (
    <>
      <PageHead title="Admins & Wings" subtitle="Allocate an admin to each wing. A wing admin sees and manages only that wing's students, staff, fees, exams and LMS. Every change they make is in the Activity Log.">
        <button className="btn btn-primary" onClick={() => setForm({ wings: [] })}><Plus size={16} /> New admin</button>
      </PageHead>

      <Async state={overview}>{(d) => (
        <div className="grid grid-3 mb">
          {d.wings.map((w) => (
            <div key={w.wing} className="card card-pad stack">
              <div className="row between">
                <h2 className="row"><Building2 size={17} /> {WING_LABEL[w.wing]} wing</h2>
                <button className="btn btn-sm" onClick={() => setForm({ wings: [w.wing] })}><Plus size={13} /> Allocate admin</button>
              </div>
              <div className="row small text-2" style={{ gap: 16 }}><span><strong>{w.students}</strong> students</span><span><strong>{w.batches}</strong> batches</span></div>
              <div className="row" style={{ gap: 6 }}>
                {w.admins.length
                  ? w.admins.map((a) => <Badge key={a._id} tone={a.active ? 'good' : ''}><ShieldCheck size={12} /> {a.name}{a.active ? '' : ' (disabled)'}</Badge>)
                  : <Badge tone="bad">No admin allocated</Badge>}
              </div>
            </div>
          ))}
          {d.wholeInstitute.length > 0 && <p className="small muted" style={{ gridColumn: '1 / -1' }}>Institute-wide admins: {d.wholeInstitute.map((a) => a.name).join(', ')}</p>}
        </div>
      )}</Async>

      <div className="filters">
        <Segmented value={who} onChange={setWho} options={[{ value: 'admins', label: 'Wing admins' }, { value: 'all', label: 'All staff logins' }]} />
        <span className="small muted">Activity counts are for the last 7 days.</span>
      </div>
      <Async state={list}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Wings</th><th>Last login</th><th className="num">Changes</th><th className="num">Deletes</th><th className="num">Failed logins</th><th>Last activity</th><th>Status</th><th /></tr></thead>
              <tbody>{rows.map((u) => (
                <tr key={u._id}>
                  <td><div className="cell-title">{u.name}</div><div className="cell-sub mono">{u.loginId}</div></td>
                  <td><Badge tone={u.role === 'superadmin' ? 'ai' : u.role === 'admin' ? 'warn' : 'info'}>{ROLE_NAME[u.role] || u.role}</Badge></td>
                  <td><div className="row" style={{ gap: 4 }}>{u.role === 'superadmin' ? <Badge tone="ai">Everything</Badge> : <WingBadges wings={u.wings} />}</div></td>
                  <td className="small">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : <span className="muted">Never</span>}</td>
                  <td className="num">{u.activity.actions}</td>
                  <td className="num">{u.activity.deletes ? <Badge tone="warn">{u.activity.deletes}</Badge> : 0}</td>
                  <td className="num">{u.activity.failed ? <Badge tone="bad">{u.activity.failed}</Badge> : 0}</td>
                  <td className="small text-2">{u.activity.lastAt ? fmtDateTime(u.activity.lastAt) : '—'}</td>
                  <td>{u.active ? <Badge tone="good">Active</Badge> : <Badge>Disabled</Badge>}</td>
                  <td className="nowrap">
                    <Link className="btn btn-sm btn-ghost" to={`/activity?user=${u._id}`} title="See this person's activity"><Activity size={14} /></Link>
                    {u.role !== 'superadmin' && <button className="btn btn-sm" onClick={() => setForm({ user: u })}>Edit</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty text={who === 'admins' ? 'No wing admins yet. Allocate one to each wing above.' : 'No logins.'} />}</Async>

      {form && (
        <UserForm
          key={form.user?._id || form.wings.join()}
          user={form.user}
          defaultRole="admin"
          defaultWings={form.wings}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload() }}
        />
      )}
    </>
  )
}
