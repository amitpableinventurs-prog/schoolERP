import { useRef, useState } from 'react'
import { Camera, HeartHandshake, KeyRound, Pencil, Phone, Trash2, UserRound } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useAuth } from '../../lib/auth.jsx'
import { uploadFile } from '../../lib/files.js'
import { fmtDate, TYPE_LABEL } from '../../lib/format.js'
import { useScope } from '../../lib/scope.jsx'
import { PasswordModal } from '../../components/Layout.jsx'
import { Async, Avatar, Badge, Field, Modal, PageHead, useAction, useApi, useToast } from '../../components/ui.jsx'

const BLOOD = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const RELATIONS = ['', 'Father', 'Mother', 'Guardian', 'Grandparent', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Other']

function Info({ label, value, note }) {
  return (
    <div className="info">
      <div className="small muted">{label}</div>
      <div className="info-value">{value || <span className="muted">Not added</span>}</div>
      {note && <div className="small muted">{note}</div>}
    </div>
  )
}

function EditForm({ section, student, base, onClose, onSaved }) {
  const personal = section === 'personal'
  const keys = personal ? ['phone', 'email', 'address', 'bloodGroup'] : ['fatherName', 'motherName', 'guardianName', 'guardianRelation', 'guardianEmail', 'guardianOccupation', 'emergencyPhone']
  const [form, setForm] = useState(() => Object.fromEntries(keys.map((k) => [k, student[k] || ''])))
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const r = await run(() => api.put(`${base}/profile`, form), 'Details saved.')
    if (r) onSaved(r)
  }
  return (
    <Modal title={personal ? 'Edit personal information' : 'Edit parents / guardian information'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="profile-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <form id="profile-form" className="form-grid" onSubmit={submit}>
        {personal ? (
          <>
            <Field label="Student mobile"><input className="input" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Email"><input className="input" type="email" inputMode="email" autoCapitalize="none" value={form.email} onChange={set('email')} /></Field>
            <Field label="Blood group"><select className="select" value={form.bloodGroup} onChange={set('bloodGroup')}>{BLOOD.map((b) => <option key={b} value={b}>{b || '—'}</option>)}</select></Field>
            <Field label="Home address" full><textarea className="textarea" value={form.address} onChange={set('address')} style={{ minHeight: 70 }} /></Field>
          </>
        ) : (
          <>
            <Field label="Father's name"><input className="input" value={form.fatherName} onChange={set('fatherName')} /></Field>
            <Field label="Mother's name"><input className="input" value={form.motherName} onChange={set('motherName')} /></Field>
            <Field label="Guardian name"><input className="input" value={form.guardianName} onChange={set('guardianName')} /></Field>
            <Field label="Relation to student"><select className="select" value={form.guardianRelation} onChange={set('guardianRelation')}>{RELATIONS.map((r) => <option key={r} value={r}>{r || '—'}</option>)}</select></Field>
            <Field label="Guardian email" hint="Password reset links are sent here"><input className="input" type="email" inputMode="email" autoCapitalize="none" value={form.guardianEmail} onChange={set('guardianEmail')} /></Field>
            <Field label="Occupation"><input className="input" value={form.guardianOccupation} onChange={set('guardianOccupation')} /></Field>
            <Field label="Emergency contact number"><input className="input" type="tel" inputMode="tel" value={form.emergencyPhone} onChange={set('emergencyPhone')} /></Field>
            <p className="small muted full">The guardian mobile ({student.guardianPhone || 'not added'}) is also the parent login, so only the school office can change it.</p>
          </>
        )}
      </form>
    </Modal>
  )
}

// Student / parent profile: photo, personal details and parents / guardian details.
export default function MyProfile() {
  const { api: base, viewer, my } = useScope()
  const { refresh } = useAuth()
  const state = useApi(`${base}/profile`)
  const [editing, setEditing] = useState(null)
  const [pwd, setPwd] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [run] = useAction()
  const toast = useToast()
  const input = useRef(null)

  const saved = (r) => {
    setEditing(null)
    state.setData(r)
    refresh()
  }
  const changePhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const up = await uploadFile(file, 'photo', viewer === 'parent' ? { student: state.data.student._id } : {})
      saved(await api.put(`${base}/profile`, { photo: up._id }))
      toast('Photo updated.')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setUploading(false)
    }
  }
  const removePhoto = async () => {
    const r = await run(() => api.put(`${base}/profile`, { photo: null }), 'Photo removed.')
    if (r) saved(r)
  }

  return (
    <>
      <PageHead title={viewer === 'parent' ? my('profile') : 'My profile'} subtitle="Personal details, parents / guardian details and photo. Ask the school office to correct anything you cannot edit here.">
        {viewer === 'student' && <button className="btn" onClick={() => setPwd(true)}><KeyRound size={15} /> Change password</button>}
      </PageHead>
      <Async state={state}>{({ student: s }) => (
        <>
          <div className="card card-pad mb profile-head">
            <div className="profile-photo">
              <Avatar name={s.name} photo={s.photo} size="xl" />
              <button className="btn btn-sm photo-btn" onClick={() => input.current?.click()} disabled={uploading}><Camera size={14} /> {uploading ? 'Uploading…' : s.photo ? 'Change photo' : 'Add photo'}</button>
              {s.photo && !uploading && <button className="btn btn-ghost btn-sm" onClick={removePhoto}><Trash2 size={13} /> Remove</button>}
              <input ref={input} type="file" accept="image/*" hidden onChange={changePhoto} />
            </div>
            <div className="stack" style={{ gap: 6, minWidth: 0 }}>
              <h1>{s.name}</h1>
              <div className="row text-2">
                <span className="mono">{s.admissionNo}</span>·<span>{s.batch?.name}</span>
                {s.batch?.type && <Badge tone="info">{TYPE_LABEL[s.batch.type]}</Badge>}
                <Badge tone={s.status === 'active' ? 'good' : ''}>{s.status}</Badge>
              </div>
              <div className="small muted">Roll no. {s.rollNo ?? '—'} · Class teacher: {s.batch?.classTeacher?.name || '—'} · Admitted {fmtDate(s.admissionDate)}</div>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <div className="card-head">
                <h2 className="row"><UserRound size={17} /> Personal information</h2>
                <button className="btn btn-sm" onClick={() => setEditing('personal')}><Pencil size={13} /> Edit</button>
              </div>
              <div className="card-body info-grid">
                <Info label="Full name" value={s.name} />
                <Info label="Gender" value={s.gender && s.gender.charAt(0).toUpperCase() + s.gender.slice(1)} />
                <Info label="Date of birth" value={s.dob && fmtDate(s.dob)} />
                <Info label="Blood group" value={s.bloodGroup} />
                <Info label="Student mobile" value={s.phone} />
                <Info label="Email" value={s.email} />
                <Info label="Class / batch" value={s.batch?.name} />
                <Info label="Program" value={s.batch?.program} />
                <div className="full"><Info label="Home address" value={s.address} /></div>
              </div>
            </div>
            <div className="card">
              <div className="card-head">
                <h2 className="row"><HeartHandshake size={17} /> Parents / guardian</h2>
                <button className="btn btn-sm" onClick={() => setEditing('guardian')}><Pencil size={13} /> Edit</button>
              </div>
              <div className="card-body info-grid">
                <Info label="Father's name" value={s.fatherName} />
                <Info label="Mother's name" value={s.motherName} />
                <Info label="Guardian" value={s.guardianName && `${s.guardianName}${s.guardianRelation ? ` (${s.guardianRelation})` : ''}`} />
                <Info label="Guardian mobile" value={s.guardianPhone && <a href={`tel:${s.guardianPhone}`} className="row" style={{ gap: 4, display: 'inline-flex' }}><Phone size={13} /> {s.guardianPhone}</a>} note="Parent portal login" />
                <Info label="Guardian email" value={s.guardianEmail} />
                <Info label="Occupation" value={s.guardianOccupation} />
                <Info label="Emergency contact" value={s.emergencyPhone} />
              </div>
            </div>
          </div>
          {editing && <EditForm section={editing} student={s} base={base} onClose={() => setEditing(null)} onSaved={saved} />}
        </>
      )}</Async>
      {pwd && <PasswordModal onClose={() => setPwd(false)} />}
    </>
  )
}
