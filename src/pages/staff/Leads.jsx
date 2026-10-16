import { useDeferredValue, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, GraduationCap, Phone, Plus, Sparkles, Trash2 } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { myWings, useAuth, WING_LABEL } from '../../lib/auth.jsx'
import { fmtDate, fmtDateTime, today, waLink } from '../../lib/format.js'
import { Async, Badge, BatchSelect, Confirm, Empty, Field, Modal, PageHead, SearchInput, Segmented, StatusBadge, useAction, useAiStatus, useApi, WhatsAppIcon } from '../../components/ui.jsx'

const STATUSES = ['new', 'contacted', 'demo', 'visited', 'converted', 'lost']
const SOURCES = ['walkin', 'website', 'referral', 'social', 'ads', 'call', 'other']

function ScoreBadge({ score }) {
  const tone = score >= 60 ? 'good' : score >= 35 ? 'warn' : 'bad'
  return <Badge tone={tone} title="AI-assisted conversion score">{score >= 60 ? 'Hot' : score >= 35 ? 'Warm' : 'Cold'} · {score}</Badge>
}

function LeadForm({ lead, onClose, onSaved }) {
  const wings = myWings(useAuth().user)
  const [form, setForm] = useState(lead || { name: '', phone: '', email: '', course: '', type: wings.includes('coaching') ? 'coaching' : wings[0], source: 'walkin', status: 'new', nextFollowUp: today(), notes: '' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = Object.fromEntries(['name', 'phone', 'email', 'course', 'type', 'source', 'status', 'nextFollowUp', 'notes'].map((k) => [k, form[k] ?? '']))
    const saved = await run(() => (lead ? api.put(`/leads/${lead._id}`, body) : api.post('/leads', body)), 'Saved.')
    if (saved) onSaved(saved)
  }
  return (
    <Modal title={lead ? 'Edit enquiry' : 'New enquiry'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="lead-form" disabled={busy}>Save</button></>}>
      <form id="lead-form" className="form-grid" onSubmit={submit}>
        <Field label="Name *"><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <Field label="Phone (WhatsApp) *"><input className="input" value={form.phone} onChange={set('phone')} required /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email || ''} onChange={set('email')} /></Field>
        <Field label="Interested in"><input className="input" value={form.course || ''} onChange={set('course')} placeholder="JEE 2027 / Class 11 / BCA" /></Field>
        <Field label="Type"><select className="select" value={form.type} onChange={set('type')}>{wings.map((w) => <option key={w} value={w}>{WING_LABEL[w]}</option>)}</select></Field>
        <Field label="Source"><select className="select" value={form.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        <Field label="Status"><select className="select" value={form.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
        <Field label="Next follow-up"><input className="input" type="date" value={form.nextFollowUp || ''} onChange={set('nextFollowUp')} /></Field>
        <Field label="Notes" full><textarea className="textarea" value={form.notes || ''} onChange={set('notes')} style={{ minHeight: 60 }} /></Field>
      </form>
    </Modal>
  )
}

function LeadDetail({ lead: initial, onClose, onChanged }) {
  const [lead, setLead] = useState(initial)
  const [note, setNote] = useState('')
  const [next, setNext] = useState('')
  const [status, setStatus] = useState('')
  const [ai, setAi] = useState(null)
  const [convert, setConvert] = useState(null)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [run, busy] = useAction()
  const aiEnabled = useAiStatus()
  const navigate = useNavigate()

  const addFollowup = async (e) => {
    e.preventDefault()
    const updated = await run(() => api.post(`/leads/${lead._id}/followups`, { note, nextFollowUp: next || undefined, status: status || undefined }), 'Follow-up logged.')
    if (updated) { setLead(updated); setNote(''); setNext(''); setStatus(''); onChanged() }
  }

  const aiMessage = async () => {
    const r = await run(() => api.post(`/leads/${lead._id}/ai-message`, { language: 'Hinglish' }))
    if (r) setAi(r)
  }

  const doConvert = async (e) => {
    e.preventDefault()
    const r = await run(() => api.post(`/leads/${lead._id}/convert`, convert), 'Admission done! Fee plan and portal login created.')
    if (r) { onChanged(); navigate(`/students/${r.student._id}`) }
  }

  if (editing) return <LeadForm lead={lead} onClose={() => setEditing(false)} onSaved={(l) => { setLead(l); setEditing(false); onChanged() }} />

  return (
    <Modal title={lead.name} size="lg" onClose={onClose}>
      <div className="row between mb">
        <div className="row">
          <StatusBadge value={lead.status} /><ScoreBadge score={lead.score} /><Badge>{lead.source}</Badge>
          {lead.course && <Badge tone="info">{lead.course}</Badge>}
        </div>
        <div className="row">
          <a className="btn btn-sm" href={`tel:${lead.phone}`}><Phone size={14} /> {lead.phone}</a>
          <a className="btn btn-sm" target="_blank" rel="noreferrer" href={waLink(lead.phone, `Hello ${lead.name}, `)}><WhatsAppIcon size={14} /> WhatsApp</a>
          <button className="btn btn-sm" onClick={() => setEditing(true)}>Edit</button>
          <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(true)} aria-label="Delete"><Trash2 size={14} /></button>
        </div>
      </div>
      {lead.notes && <p className="text-2 mb">{lead.notes}</p>}

      <div className="grid grid-2">
        <div className="stack">
          <h3>Log a follow-up</h3>
          <form className="stack" onSubmit={addFollowup}>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened on the call / visit?" required style={{ minHeight: 70 }} />
            <div className="row">
              <input className="input" type="date" value={next} onChange={(e) => setNext(e.target.value)} style={{ width: 'auto' }} aria-label="Next follow-up date" />
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }} aria-label="New status">
                <option value="">Keep status</option>{STATUSES.filter((s) => s !== 'converted').map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-primary" disabled={busy}>Save</button>
            </div>
          </form>
          <div className="hr" />
          <h3>History</h3>
          {lead.followUps?.length ? [...lead.followUps].reverse().map((f, i) => (
            <div key={i} className="small"><span className="muted">{fmtDateTime(f.at)} · {f.by}</span><div>{f.note}</div></div>
          )) : <span className="small muted">No follow-ups yet.</span>}
          <div className="small muted row"><CalendarClock size={13} /> Next follow-up: {fmtDate(lead.nextFollowUp)}</div>
        </div>

        <div className="stack">
          <h3 className="row"><Sparkles size={15} /> AI follow-up message</h3>
          {ai ? (
            <div className="stack">
              <textarea className="textarea" value={ai.message} onChange={(e) => setAi({ ...ai, message: e.target.value })} style={{ minHeight: 110 }} />
              <div className="small alert alert-ai">💡 {ai.tip}</div>
              <a className="btn btn-primary" target="_blank" rel="noreferrer" href={waLink(lead.phone, ai.message)}><WhatsAppIcon size={15} color="currentColor" /> Send on WhatsApp</a>
            </div>
          ) : (
            <button className="btn btn-ai" onClick={aiMessage} disabled={busy || aiEnabled === false}><Sparkles size={15} /> {busy ? 'Writing…' : 'Write a personalised message'}</button>
          )}
          <div className="hr" />
          {lead.status !== 'converted' ? (
            convert ? (
              <form className="stack" onSubmit={doConvert}>
                <h3>Confirm admission</h3>
                <BatchSelect value={convert.batch} onChange={(v) => setConvert({ ...convert, batch: v })} allLabel="Admit into batch…" required />
                <input className="input" placeholder="Guardian name" value={convert.guardianName} onChange={(e) => setConvert({ ...convert, guardianName: e.target.value })} />
                <input className="input" placeholder="Guardian phone (default: lead phone)" value={convert.guardianPhone} onChange={(e) => setConvert({ ...convert, guardianPhone: e.target.value })} />
                <button className="btn btn-primary" disabled={busy}><GraduationCap size={15} /> Admit student</button>
              </form>
            ) : <button className="btn" onClick={() => setConvert({ batch: '', guardianName: '', guardianPhone: '' })}><GraduationCap size={15} /> Convert to admission</button>
          ) : <div className="alert alert-info">Admitted ✓</div>}
        </div>
      </div>
      {deleting && <Confirm text={`Delete enquiry from ${lead.name}?`} busy={busy} onClose={() => setDeleting(false)} onConfirm={async () => { if (await run(() => api.del(`/leads/${lead._id}`), 'Deleted.')) { onChanged(); onClose() } }} />}
    </Modal>
  )
}

export default function Leads() {
  const wings = myWings(useAuth().user)
  const [view, setView] = useState('board')
  const [type, setType] = useState('')
  const [due, setDue] = useState(false)
  const [q, setQ] = useState('')
  const query = useDeferredValue(q)
  const state = useApi(`/leads${qs({ type, q: query, due: due ? '1' : '' })}`)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState(null)

  return (
    <>
      <PageHead title="Admissions CRM" subtitle="Track enquiries from walk-ins, website, referrals and ads. Leads are scored automatically; follow-up reminders run daily.">
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> New enquiry</button>
      </PageHead>
      <div className="filters">
        <Segmented value={view} onChange={setView} options={[{ value: 'board', label: 'Pipeline' }, { value: 'table', label: 'List' }]} />
        <select className="select" value={type} onChange={(e) => setType(e.target.value)}><option value="">{wings.length > 1 ? 'All my wings' : WING_LABEL[wings[0]]}</option>{wings.length > 1 && wings.map((w) => <option key={w} value={w}>{WING_LABEL[w]}</option>)}</select>
        <label className="check"><input type="checkbox" checked={due} onChange={(e) => setDue(e.target.checked)} /> Follow-up due</label>
        <SearchInput value={q} onChange={setQ} placeholder="Name, phone, course" />
      </div>
      <Async state={state}>{(leads) => {
        if (!leads.length) return <Empty text="No enquiries here." />
        if (view === 'board') {
          return (
            <div className="kanban">
              {STATUSES.map((s) => {
                const col = leads.filter((l) => l.status === s).sort((a, b) => b.score - a.score)
                return (
                  <div className="kan-col" key={s}>
                    <h3><span>{s}</span><span className="muted">{col.length}</span></h3>
                    {col.map((l) => (
                      <div key={l._id} className="kan-card" onClick={() => setOpen(l)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(l)}>
                        <div className="row between"><strong>{l.name}</strong><ScoreBadge score={l.score} /></div>
                        <div className="small muted">{l.course || '—'} · {l.source}</div>
                        {l.nextFollowUp && <div className={`small ${l.nextFollowUp <= today() && !['converted', 'lost'].includes(l.status) ? '' : 'muted'}`} style={l.nextFollowUp <= today() && !['converted', 'lost'].includes(l.status) ? { color: 'var(--bad-text)', fontWeight: 600 } : undefined}>Follow-up {fmtDate(l.nextFollowUp)}</div>}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )
        }
        return (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Name</th><th>Interested in</th><th>Source</th><th>Status</th><th>Score</th><th>Next follow-up</th><th className="num">Calls</th></tr></thead>
                <tbody>{leads.map((l) => (
                  <tr key={l._id} className="clickable" onClick={() => setOpen(l)}>
                    <td><div className="cell-title">{l.name}</div><div className="cell-sub">{l.phone}</div></td>
                    <td>{l.course}</td><td>{l.source}</td><td><StatusBadge value={l.status} /></td><td><ScoreBadge score={l.score} /></td>
                    <td>{fmtDate(l.nextFollowUp)}</td><td className="num">{l.followUps?.length || 0}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )
      }}</Async>
      {adding && <LeadForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); state.reload() }} />}
      {open && <LeadDetail lead={open} onClose={() => setOpen(null)} onChanged={state.reload} />}
    </>
  )
}
