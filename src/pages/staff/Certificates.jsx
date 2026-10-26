import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Award, FileBadge, Plus, ScrollText } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, today } from '../../lib/format.js'
import { CertificateDoc } from '../../components/Certificate.jsx'
import { Async, Badge, BatchSelect, Empty, Field, Modal, PageHead, SearchInput, StatTile, useAction, useApi } from '../../components/ui.jsx'

const EXTRA_LABEL = {
  purpose: { label: 'Purpose', placeholder: 'e.g. bank account opening, scholarship' },
  conduct: { label: 'Conduct', placeholder: 'e.g. good, very good, excellent' },
  reason: { label: 'Reason for leaving', placeholder: "e.g. parent's transfer, completed course" },
  achievement: { label: 'Achievement', placeholder: 'e.g. First Position' },
  event: { label: 'Event / exam', placeholder: 'e.g. Annual Science Exhibition 2026' },
  eventDate: { label: 'Event date', type: 'date' },
  course: { label: 'Course', placeholder: 'e.g. JEE Foundation' },
  remarks: { label: 'Remarks', placeholder: 'Optional line at the end' },
}

// Which typed-in fields a template's text uses.
const extrasIn = (body = '') => Object.keys(EXTRA_LABEL).filter((k) => new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`).test(body))

function StudentPicker({ value, onChange }) {
  const [batch, setBatch] = useState('')
  const [q, setQ] = useState('')
  const list = useApi(batch || q.trim().length > 1 ? `/students${qs({ batch, q: q.trim(), status: 'active' })}` : null)
  const rows = list.data || []
  const all = rows.length > 0 && rows.every((s) => value.includes(s._id))
  const toggle = (id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <BatchSelect value={batch} onChange={setBatch} allLabel="Choose class / batch" />
        <input className="input" placeholder="…or search name / adm. no." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="pick-list">
        {!batch && q.trim().length < 2 && <div className="muted small" style={{ padding: 12 }}>Choose a class or search to list students.</div>}
        {list.loading && <div className="muted small" style={{ padding: 12 }}>Loading…</div>}
        {rows.length > 0 && (
          <label className="check pick-all"><input type="checkbox" checked={all} onChange={() => onChange(all ? value.filter((id) => !rows.some((s) => s._id === id)) : [...new Set([...value, ...rows.map((s) => s._id)])])} /> Select all ({rows.length})</label>
        )}
        {rows.map((s) => (
          <label key={s._id} className="check">
            <input type="checkbox" checked={value.includes(s._id)} onChange={() => toggle(s._id)} />
            <span>{s.name} <span className="muted small">· {s.admissionNo} · {s.batch?.name}</span></span>
          </label>
        ))}
        {(batch || q.trim().length > 1) && !list.loading && !rows.length && <div className="muted small" style={{ padding: 12 }}>No students found.</div>}
      </div>
      <div className="small text-2">{value.length} student{value.length === 1 ? '' : 's'} selected</div>
    </div>
  )
}

function IssueModal({ templates, initialTemplate, onClose, onIssued }) {
  const active = templates.filter((t) => t.active)
  const [form, setForm] = useState({ template: initialTemplate || active[0]?._id || '', issuedOn: today(), extras: { conduct: 'good' }, shared: true, ignoreDues: false })
  const [students, setStudents] = useState([])
  const [preview, setPreview] = useState(null)
  const [run, busy] = useAction()
  const template = templates.find((t) => t._id === form.template)
  const extras = extrasIn(template?.body)
  const setExtra = (k, v) => setForm({ ...form, extras: { ...form.extras, [k]: v } })

  // Live preview with the first chosen student (debounced).
  const previewKey = JSON.stringify([form.template, form.issuedOn, form.extras, students[0]])
  useEffect(() => {
    if (!form.template) return undefined
    const t = setTimeout(() => {
      api.post('/certificates/preview', { template: form.template, issuedOn: form.issuedOn, extras: form.extras, student: students[0] }).then(setPreview, () => {})
    }, 350)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey])

  const submit = async (e) => {
    e.preventDefault()
    const r = await run(() => api.post('/certificates/issue', { ...form, students }), students.length > 1 ? `${students.length} certificates issued.` : 'Certificate issued.')
    if (r) onIssued(r)
  }

  return (
    <Modal title="Issue certificate" size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="issue-form" disabled={busy || !students.length || !form.template}><Award size={15} /> {busy ? 'Issuing…' : `Issue ${students.length || ''} certificate${students.length === 1 ? '' : 's'}`}</button></>}>
      <div className="issue-grid">
        <form id="issue-form" className="stack" onSubmit={submit}>
          <Field label="Template *">
            <select className="select" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} required>
              {active.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Students *"><StudentPicker value={students} onChange={setStudents} /></Field>
          <div className="form-grid">
            <Field label="Issue date"><input className="input" type="date" value={form.issuedOn} onChange={(e) => setForm({ ...form, issuedOn: e.target.value })} required /></Field>
            {extras.map((k) => (
              <Field key={k} label={EXTRA_LABEL[k].label}>
                <input className="input" type={EXTRA_LABEL[k].type || 'text'} placeholder={EXTRA_LABEL[k].placeholder} value={form.extras[k] || ''} onChange={(e) => setExtra(k, e.target.value)} />
              </Field>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={form.shared} onChange={(e) => setForm({ ...form, shared: e.target.checked })} /> Show in student &amp; parent portal</label>
          {template?.kind === 'transfer' && (
            <label className="check"><input type="checkbox" checked={form.ignoreDues} onChange={(e) => setForm({ ...form, ignoreDues: e.target.checked })} /> Issue even with pending dues</label>
          )}
        </form>
        <div>
          <div className="small muted" style={{ marginBottom: 6 }}>Preview{students.length ? ' (first selected student)' : ' (sample student)'}</div>
          {preview ? <CertificateDoc data={preview} preview /> : <div className="muted small">Choose a template…</div>}
        </div>
      </div>
    </Modal>
  )
}

export default function Certificates() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState({ q: '', template: '', batch: '', status: '' })
  const templates = useApi('/certificates/templates')
  const state = useApi(`/certificates${qs(filters)}`)
  const issuing = params.get('issue') === '1'
  const closeIssue = () => setParams({}, { replace: true })

  const stats = useMemo(() => {
    const rows = state.data || []
    const month = today().slice(0, 7)
    return { total: rows.length, month: rows.filter((r) => r.issuedOn?.startsWith(month)).length, revoked: rows.filter((r) => r.status === 'revoked').length }
  }, [state.data])

  const set = (k) => (v) => setFilters({ ...filters, [k]: v })
  return (
    <>
      <PageHead title="Certificates" subtitle="Issue bonafide, character, transfer, merit, appreciation and other certificates with verifiable serial numbers.">
        <Link className="btn" to="/certificates/templates"><ScrollText size={16} /> Templates</Link>
        <button className="btn btn-primary" onClick={() => setParams({ issue: '1' })} disabled={!templates.data}><Plus size={16} /> Issue certificate</button>
      </PageHead>
      <div className="grid grid-3 mb">
        <StatTile icon={Award} label="Issued (shown below)" value={stats.total} />
        <StatTile icon={FileBadge} label="Issued this month" value={stats.month} tone="good" />
        <StatTile icon={ScrollText} label="Revoked" value={stats.revoked} tone="bad" />
      </div>
      <div className="filters">
        <SearchInput value={filters.q} onChange={set('q')} placeholder="Student, adm. no. or serial…" />
        <select className="select" value={filters.template} onChange={(e) => set('template')(e.target.value)}>
          <option value="">All certificates</option>
          {(templates.data || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <BatchSelect value={filters.batch} onChange={set('batch')} />
        <select className="select" value={filters.status} onChange={(e) => set('status')(e.target.value)}>
          <option value="">Any status</option><option value="issued">Valid</option><option value="revoked">Revoked</option>
        </select>
      </div>
      <div className="card">
        <Async state={state}>{(rows) => rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Serial no.</th><th>Student</th><th>Certificate</th><th>Issued on</th><th>Issued by</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c._id} className="clickable" onClick={() => navigate(`/certificates/${c._id}`)}>
                    <td className="mono small">{c.serialNo}</td>
                    <td><div className="cell-title">{c.student?.name}</div><div className="cell-sub">{c.student?.admissionNo} · {c.batch?.name}</div></td>
                    <td>{c.heading}</td>
                    <td className="nowrap">{fmtDate(c.issuedOn)}</td>
                    <td className="small text-2">{c.issuedByName}</td>
                    <td>{c.status === 'revoked' ? <Badge tone="bad">Revoked</Badge> : <Badge tone="good">Valid</Badge>}{!c.shared && <Badge>Hidden</Badge>}</td>
                    <td className="right"><Link to={`/certificates/${c._id}`} className="btn btn-sm" onClick={(e) => e.stopPropagation()}>View / Print</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon={Award} text="No certificates yet. Click “Issue certificate” to create the first one." />}</Async>
      </div>
      {issuing && templates.data && (
        <IssueModal
          templates={templates.data}
          initialTemplate={params.get('template')}
          onClose={closeIssue}
          onIssued={(r) => {
            closeIssue()
            if (r.count === 1) navigate(`/certificates/${r.first}`)
            else state.reload()
          }}
        />
      )}
    </>
  )
}
