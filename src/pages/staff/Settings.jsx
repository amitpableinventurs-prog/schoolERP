import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../../lib/api.js'
import { myWings, ROLE_NAME, useAuth } from '../../lib/auth.jsx'
import { fmtDateTime } from '../../lib/format.js'
import { Async, Badge, Field, Loading, Modal, PageHead, Tabs, useAction, useApi, WingBadges, WingPicker } from '../../components/ui.jsx'

function Institute() {
  const { refresh, user } = useAuth()
  const locked = user.role !== 'superadmin'
  const [form, setForm] = useState(null)
  const [run, busy] = useAction()
  useEffect(() => { api.get('/settings').then(setForm) }, [])
  if (!form) return <Loading />
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    if (await run(() => api.put('/settings', { ...form, attendanceThreshold: Number(form.attendanceThreshold), passPercent: Number(form.passPercent) }), 'Settings saved.')) refresh()
  }
  return (
    <form className="card card-pad stack" onSubmit={submit} style={{ maxWidth: 760 }}>
      {locked && <div className="alert alert-info small">Institute settings are managed by the super admin.</div>}
      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
      <div className="form-grid">
        <Field label="Institute name"><input className="input" value={form.instituteName} onChange={set('instituteName')} required /></Field>
        <Field label="Tagline"><input className="input" value={form.tagline || ''} onChange={set('tagline')} /></Field>
        <Field label="Phone"><input className="input" value={form.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Address" full><input className="input" value={form.address || ''} onChange={set('address')} /></Field>
        <Field label="Academic year"><input className="input" value={form.academicYear || ''} onChange={set('academicYear')} /></Field>
        <Field label="Minimum attendance %" hint="Used for warnings and risk scoring"><input className="input" type="number" value={form.attendanceThreshold} onChange={set('attendanceThreshold')} /></Field>
        <Field label="Pass percentage"><input className="input" type="number" value={form.passPercent} onChange={set('passPercent')} /></Field>
      </div>
      </fieldset>
      {!locked && <div><button className="btn btn-primary" disabled={busy}>Save</button></div>}
    </form>
  )
}

const ROLES = [['admin', 'Wing admin'], ['teacher', 'Teacher'], ['accountant', 'Accountant'], ['counsellor', 'Admission counsellor']]

// Create / edit a login. The super admin can also create admins; a wing admin only staff of their wings.
export function UserForm({ user, onClose, onSaved, defaultRole = 'teacher', defaultWings }) {
  const { user: me } = useAuth()
  const staff = useApi('/staff?status=active')
  const roles = ROLES.filter(([v]) => me.role === 'superadmin' || v !== 'admin')
  const [form, setForm] = useState(user
    ? { name: user.name, role: user.role, active: user.active, password: '', wings: user.wings || [], allWings: !user.wings?.length }
    : { name: '', loginId: '', role: defaultRole, staff: '', password: '', wings: defaultWings || me.wings || [], allWings: false })
  const editingSelf = user && user._id === me.id
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form }
    if (user && !body.password) delete body.password
    if (editingSelf) { delete body.wings; delete body.allWings; delete body.role }
    if (me.role !== 'superadmin') delete body.allWings
    if (await run(() => (user ? api.put(`/users/${user._id}`, body) : api.post('/users', body)), 'Saved.')) onSaved()
  }
  return (
    <Modal title={user ? `Edit ${user.name}` : defaultRole === 'admin' ? 'New wing admin' : 'New staff login'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="user-form" disabled={busy}>Save</button></>}>
      <form id="user-form" className="form-grid" onSubmit={submit}>
        {!user && (
          <Field label="Link to staff member" full>
            <select className="select" value={form.staff} onChange={(e) => {
              const s = (staff.data || []).find((x) => x._id === e.target.value)
              setForm({ ...form, staff: e.target.value, name: s?.name || form.name, loginId: s?.email || form.loginId })
            }}>
              <option value="">—</option>
              {(staff.data || []).map((s) => <option key={s._id} value={s._id}>{s.name} · {s.designation}</option>)}
            </select>
          </Field>
        )}
        <Field label="Name"><input className="input" value={form.name} onChange={set('name')} required /></Field>
        {!user && <Field label="Login (email)"><input className="input" value={form.loginId} onChange={set('loginId')} required /></Field>}
        <Field label="Role"><select className="select" value={form.role} onChange={set('role')} disabled={editingSelf}>{roles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label={user ? 'New password (optional)' : 'Password'}><input className="input" type="password" value={form.password} onChange={set('password')} minLength={6} required={!user} /></Field>
        {!editingSelf && (
          <Field label={form.role === 'admin' ? 'Allocated wings *' : 'Wings'} full hint={me.wings ? `You can only allocate your own wing${me.wings.length > 1 ? 's' : ''}.` : form.role === 'admin' ? 'The admin sees and manages only these wings.' : 'Leave unticked (or tick “Whole institute”) for institute-wide staff.'}>
            <div className="stack" style={{ gap: 6 }}>
              {me.role === 'superadmin' && <label className="check"><input type="checkbox" checked={form.allWings} onChange={(e) => setForm({ ...form, allWings: e.target.checked })} /> Whole institute</label>}
              {!form.allWings && <WingPicker value={form.wings} onChange={(wings) => setForm({ ...form, wings })} allowed={myWings(me)} />}
            </div>
          </Field>
        )}
        {user && !editingSelf && <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active (unticking logs them out at once)</label>}
      </form>
    </Modal>
  )
}

function Users() {
  const { user: me } = useAuth()
  const state = useApi('/users')
  const [editing, setEditing] = useState(null)
  return (
    <>
      <div className="row between mb">
        <p className="text-2">{me.wings ? `Staff logins of your wing${me.wings.length > 1 ? 's' : ''}. ` : 'Staff and admin logins. '}Students and parents get portal logins automatically on admission.</p>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> New login</button>
      </div>
      <Async state={state}>{(users) => (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Login</th><th>Role</th><th>Wings</th><th>Last login</th><th>Status</th><th /></tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u._id}>
                  <td>{u.name}<div className="cell-sub">{u.staff?.designation}</div></td>
                  <td className="mono">{u.loginId}</td>
                  <td><Badge tone={u.role === 'superadmin' ? 'ai' : u.role === 'admin' ? 'warn' : 'info'}>{ROLE_NAME[u.role] || u.role}</Badge></td>
                  <td><div className="row" style={{ gap: 4 }}>{u.role === 'superadmin' ? <Badge tone="ai">Everything</Badge> : <WingBadges wings={u.wings} />}</div></td>
                  <td className="small">{fmtDateTime(u.lastLoginAt)}</td>
                  <td>{u.active ? <Badge tone="good">Active</Badge> : <Badge>Disabled</Badge>}</td>
                  <td>{u.role !== 'superadmin' || u._id === me.id ? <button className="btn btn-sm" onClick={() => setEditing(u)}>Edit</button> : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}</Async>
      {editing && <UserForm user={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload() }} />}
    </>
  )
}

export default function Settings() {
  const [tab, setTab] = useState('institute')
  return (
    <>
      <PageHead title="Settings" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'institute', label: 'Institute' }, { value: 'users', label: 'Users & roles' }]} />
      {tab === 'institute' ? <Institute /> : <Users />}
    </>
  )
}
