import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { myWings, useAuth } from '../../lib/auth.jsx'
import { fmtDate, money } from '../../lib/format.js'
import { Async, Confirm, Empty, Field, Modal, PageHead, SearchInput, StatusBadge, useAction, useApi, WingBadges, WingPicker } from '../../components/ui.jsx'

const EMPTY = { name: '', designation: 'Teacher', department: '', subjects: '', phone: '', email: '', salary: '', joiningDate: '', status: 'active' }

function StaffForm({ item, onClose, onSaved }) {
  const { user } = useAuth()
  const allowed = myWings(user)
  const [form, setForm] = useState(item ? { ...EMPTY, ...item, subjects: (item.subjects || []).join(', '), wings: item.wings || [] } : { ...EMPTY, wings: user.wings || [] })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, subjects: form.subjects.split(',').map((s) => s.trim()).filter(Boolean), salary: Number(form.salary) || 0 }
    const ok = await run(() => (item ? api.put(`/staff/${item._id}`, body) : api.post('/staff', body)), 'Saved.')
    if (ok) onSaved()
  }
  return (
    <Modal title={item ? 'Edit staff' : 'Add staff'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="staff-form" disabled={busy}>Save</button></>}>
      <form id="staff-form" className="form-grid" onSubmit={submit}>
        <Field label="Name *"><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <Field label="Designation"><input className="input" value={form.designation} onChange={set('designation')} /></Field>
        <Field label="Department"><input className="input" value={form.department || ''} onChange={set('department')} /></Field>
        <Field label="Subjects" hint="Comma separated"><input className="input" value={form.subjects} onChange={set('subjects')} /></Field>
        <Field label="Phone"><input className="input" value={form.phone || ''} onChange={set('phone')} /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Monthly salary (₹)"><input className="input" type="number" value={form.salary} onChange={set('salary')} /></Field>
        <Field label="Joining date"><input className="input" type="date" value={form.joiningDate || ''} onChange={set('joiningDate')} /></Field>
        <Field label="Status"><select className="select" value={form.status} onChange={set('status')}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
        <Field label="Wings" full hint={user.wings ? 'You can only add or remove your own wings.' : 'Leave all unticked for institute-wide staff (principal, office).'}>
          <WingPicker value={form.wings} onChange={(wings) => setForm({ ...form, wings })} allowed={allowed} />
        </Field>
      </form>
    </Modal>
  )
}

export default function StaffList() {
  const [q, setQ] = useState('')
  const state = useApi(`/staff${qs({ q })}`)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()

  return (
    <>
      <PageHead title="Staff" subtitle="Teachers, professors, faculty and office staff. Create logins for them under Settings → Users.">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Add staff</button>
      </PageHead>
      <div className="filters"><SearchInput value={q} onChange={setQ} placeholder="Name, department…" /></div>
      <Async state={state}>{(rows) => (
        <div className="card">
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Wings</th><th>Department</th><th>Subjects</th><th>Phone</th><th className="num">Salary</th><th>Joined</th><th>Status</th><th /></tr></thead>
                <tbody>{rows.map((s) => (
                  <tr key={s._id}>
                    <td><div className="cell-title">{s.name}</div><div className="cell-sub">{s.designation}</div></td>
                    <td><div className="row" style={{ gap: 4 }}><WingBadges wings={s.wings} /></div></td>
                    <td>{s.department}</td>
                    <td className="small text-2">{s.subjects?.join(', ') || '—'}</td>
                    <td>{s.phone}<div className="cell-sub">{s.email}</div></td>
                    <td className="num">{money(s.salary)}</td>
                    <td>{fmtDate(s.joiningDate)}</td>
                    <td><StatusBadge value={s.status} /></td>
                    <td className="nowrap">
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(s)} aria-label="Edit"><Pencil size={14} /></button>
                      <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(s)} aria-label="Delete"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="No staff yet." />}
        </div>
      )}</Async>
      {editing && <StaffForm item={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload() }} />}
      {deleting && <Confirm text={`Remove ${deleting.name}? Consider marking them inactive instead to keep history.`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await run(() => api.del(`/staff/${deleting._id}`), 'Removed.')) { setDeleting(null); state.reload() } }} />}
    </>
  )
}
