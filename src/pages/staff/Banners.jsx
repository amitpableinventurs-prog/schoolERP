import { useRef, useState } from 'react'
import { Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fileUrl, uploadFile } from '../../lib/files.js'
import { fmtDate } from '../../lib/format.js'
import { Async, Badge, Confirm, Empty, Field, Modal, PageHead, useAction, useApi, useToast } from '../../components/ui.jsx'

const AUDIENCE = { all: 'Everyone', students: 'Students & parents', parents: 'Parents only', staff: 'Staff only' }

function BannerForm({ banner, onClose, onSaved }) {
  const [form, setForm] = useState(() => banner
    ? { title: banner.title, subtitle: banner.subtitle || '', image: banner.image, link: banner.link || '', audience: banner.audience, order: banner.order || 0, startDate: banner.startDate || '', endDate: banner.endDate || '', active: banner.active }
    : { title: '', subtitle: '', image: '', link: '', audience: 'students', order: 0, startDate: '', endDate: '', active: true })
  const [uploading, setUploading] = useState(false)
  const [run, busy] = useAction()
  const toast = useToast()
  const input = useRef(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const up = await uploadFile(file, 'banner')
      setForm((f) => ({ ...f, image: up._id }))
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setUploading(false)
    }
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!form.image) return toast('Choose the banner picture first.', 'error')
    const body = { ...form, order: Number(form.order) || 0 }
    if (await run(() => (banner ? api.put(`/banners/${banner._id}`, body) : api.post('/banners', body)), 'Banner saved.')) onSaved()
  }
  return (
    <Modal title={banner ? 'Edit banner' : 'New banner'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="banner-form" disabled={busy || uploading}>Save</button></>}>
      <form id="banner-form" className="form-grid" onSubmit={submit}>
        <div className="full stack" style={{ gap: 8 }}>
          {form.image
            ? <img className="banner-preview" src={fileUrl(form.image)} alt="" />
            : <button type="button" className="banner-preview empty" onClick={() => input.current?.click()}><ImagePlus size={26} /> Choose a picture (wide, about 1200 × 400)</button>}
          <div><button type="button" className="btn btn-sm" onClick={() => input.current?.click()} disabled={uploading}><ImagePlus size={14} /> {uploading ? 'Uploading…' : form.image ? 'Change picture' : 'Upload picture'}</button></div>
          <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
        </div>
        <Field label="Title *"><input className="input" value={form.title} onChange={set('title')} required placeholder="e.g. Admissions open 2027-28" /></Field>
        <Field label="Second line"><input className="input" value={form.subtitle} onChange={set('subtitle')} placeholder="e.g. Apply before 31 January" /></Field>
        <Field label="Opens when tapped (optional)" hint="A portal page like /my/fees, /my/calendar, or a website https://…"><input className="input" value={form.link} onChange={set('link')} placeholder="/my/calendar" /></Field>
        <Field label="Shown to"><select className="select" value={form.audience} onChange={set('audience')}>{Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Show from (optional)"><input className="input" type="date" value={form.startDate} onChange={set('startDate')} /></Field>
        <Field label="Show until (optional)"><input className="input" type="date" value={form.endDate} min={form.startDate || undefined} onChange={set('endDate')} /></Field>
        <Field label="Position" hint="Lower numbers come first"><input className="input" type="number" value={form.order} onChange={set('order')} /></Field>
        <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Showing</label>
      </form>
    </Modal>
  )
}

// Pictures at the top of the student / parent app home screen.
export default function Banners() {
  const state = useApi('/banners')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()
  const toggle = async (b) => { if (await run(() => api.put(`/banners/${b._id}`, { active: !b.active }), b.active ? 'Banner hidden.' : 'Banner showing.')) state.reload() }
  return (
    <>
      <PageHead title="App banners" subtitle="Pictures that slide at the top of the student and parent home screen: admissions, events, fee reminders, results.">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> New banner</button>
      </PageHead>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="grid grid-2">
          {rows.map((b) => (
            <div className="card" key={b._id} style={{ overflow: 'hidden', opacity: b.active ? 1 : 0.6 }}>
              <img className="banner-thumb" src={fileUrl(b.image)} alt="" />
              <div className="card-body stack" style={{ gap: 6 }}>
                <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <div style={{ minWidth: 0 }}><div className="cell-title">{b.title}</div>{b.subtitle && <div className="cell-sub">{b.subtitle}</div>}</div>
                  <Badge tone={b.active ? 'good' : ''}>{b.active ? 'Showing' : 'Hidden'}</Badge>
                </div>
                <div className="small muted">{[AUDIENCE[b.audience], b.link && `opens ${b.link}`, (b.startDate || b.endDate) && `${b.startDate ? fmtDate(b.startDate) : 'now'} – ${b.endDate ? fmtDate(b.endDate) : 'no end'}`, `position ${b.order || 0}`].filter(Boolean).join(' · ')}</div>
                <div className="row">
                  <button className="btn btn-sm" onClick={() => toggle(b)} disabled={busy}>{b.active ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}</button>
                  <button className="btn btn-sm" onClick={() => setEditing(b)}><Pencil size={14} /> Edit</button>
                  <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(b)} aria-label="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty text="No banners yet. Add one and it appears on the student and parent home screen at once." />}</Async>
      {editing && <BannerForm banner={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload() }} />}
      {deleting && <Confirm text={`Delete the banner "${deleting.title}"?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await run(() => api.del(`/banners/${deleting._id}`), 'Banner deleted.')) { setDeleting(null); state.reload() } }} />}
    </>
  )
}
