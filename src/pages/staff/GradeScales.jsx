import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { isAdmin, useAuth } from '../../lib/auth.jsx'
import { TYPE_LABEL } from '../../lib/format.js'
import { Async, Badge, Confirm, Empty, Field, Modal, PageHead, useAction, useApi, WingPicker } from '../../components/ui.jsx'

function ScaleForm({ scale, onClose, onSaved }) {
  const [form, setForm] = useState({ name: scale?.name || '', passPercent: scale?.passPercent ?? 33, appliesTo: scale?.appliesTo || [] })
  const [bands, setBands] = useState(scale?.bands?.length ? scale.bands.map((b) => ({ ...b, point: b.point ?? '', remark: b.remark || '' })) : [{ min: 0, grade: '', point: '', remark: '' }])
  const [run, busy] = useAction()
  const setBand = (i, patch) => setBands(bands.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, passPercent: Number(form.passPercent), bands }
    const saved = await run(() => (scale ? api.put(`/exams/grade-scales/${scale._id}`, body) : api.post('/exams/grade-scales', body)), 'Grade scale saved. Exams using it were re-graded.')
    if (saved) onSaved()
  }
  return (
    <Modal title={scale ? `Edit ${scale.name}` : 'New grade scale'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="scale-form" disabled={busy}>Save</button></>}>
      <form id="scale-form" className="form-grid" onSubmit={submit}>
        <Field label="Name *"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Pass percentage *" hint="Per subject and overall."><input className="input" type="number" min="0" max="100" value={form.passPercent} onChange={(e) => setForm({ ...form, passPercent: e.target.value })} required /></Field>
        <Field label="Default for wings" hint="Exams of these wings use this scale unless they pick another." full>
          <WingPicker value={form.appliesTo} onChange={(appliesTo) => setForm({ ...form, appliesTo })} />
        </Field>
        <div className="full">
          <div className="band-row paper-head"><span>From %</span><span>Grade</span><span>Grade point</span><span>Remark</span><span /></div>
          {bands.map((b, i) => (
            <div className="band-row" key={i}>
              <input className="input" type="number" min="0" max="100" step="0.1" value={b.min} onChange={(e) => setBand(i, { min: e.target.value })} aria-label="From percent" />
              <input className="input" value={b.grade} onChange={(e) => setBand(i, { grade: e.target.value })} aria-label="Grade" placeholder="A1" />
              <input className="input" type="number" step="0.1" value={b.point} onChange={(e) => setBand(i, { point: e.target.value })} aria-label="Grade point" placeholder="10" />
              <input className="input" value={b.remark} onChange={(e) => setBand(i, { remark: e.target.value })} aria-label="Remark" placeholder="Outstanding" />
              <button type="button" className="btn btn-ghost btn-icon" onClick={() => setBands(bands.filter((_, j) => j !== i))} aria-label="Remove" disabled={bands.length === 1}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => setBands([...bands, { min: '', grade: '', point: '', remark: '' }])}><Plus size={13} /> Grade</button>
          <p className="small muted" style={{ marginTop: 6 }}>A grade applies from its % up to the next grade. The lowest grade must start at 0.</p>
        </div>
      </form>
    </Modal>
  )
}

export default function GradeScales() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const state = useApi('/exams/grade-scales')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()

  return (
    <>
      <div className="row mb"><Link to="/exams" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Examinations</Link></div>
      <PageHead title="Grade system" subtitle="Grade scales with pass percentage and grade points (GPA). Each wing has a default; an exam can pick its own.">
        {admin && <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> New scale</button>}
      </PageHead>
      <Async state={state}>{(scales) => scales.length ? (
        <div className="grid grid-3">
          {scales.map((s) => (
            <div className="card card-pad stack" key={s._id}>
              <div className="row between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h2>{s.name}</h2>
                  <div className="row" style={{ gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {s.appliesTo.map((w) => <Badge key={w} tone="info">Default: {TYPE_LABEL[w]}</Badge>)}
                    <Badge>Pass {s.passPercent}%</Badge>
                    {s.exams > 0 && <Badge>{s.exams} exam(s)</Badge>}
                  </div>
                </div>
                {admin && (
                  <div className="nowrap">
                    <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(s)} aria-label="Edit"><Pencil size={14} /></button>
                    <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(s)} aria-label="Delete"><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              <table className="table">
                <thead><tr><th>Marks</th><th>Grade</th><th className="num">Point</th><th>Remark</th></tr></thead>
                <tbody>{s.bands.map((b, i) => (
                  <tr key={b.grade}><td className="nowrap">{b.min}%{i ? `–<${s.bands[i - 1].min}%` : '+'}</td><td><strong>{b.grade}</strong></td><td className="num">{b.point ?? '—'}</td><td className="small">{b.remark || ''}</td></tr>
                ))}</tbody>
              </table>
            </div>
          ))}
        </div>
      ) : <Empty text="No grade scales." />}</Async>
      {!admin && <p className="small muted mt">Only an admin can change grade scales.</p>}
      {editing && <ScaleForm scale={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload() }} />}
      {deleting && <Confirm text={`Delete ${deleting.name}?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await run(() => api.del(`/exams/grade-scales/${deleting._id}`), 'Deleted.')) { setDeleting(null); state.reload() } }} />}
    </>
  )
}
