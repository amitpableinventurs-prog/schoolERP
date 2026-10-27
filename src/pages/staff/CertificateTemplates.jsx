import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Award, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { isAdmin, useAuth } from '../../lib/auth.jsx'
import { CertificateDoc } from '../../components/Certificate.jsx'
import { Async, Badge, Confirm, Empty, Field, Modal, PageHead, useAction, useApi } from '../../components/ui.jsx'

const KIND_LABEL = { bonafide: 'Bonafide', character: 'Character', transfer: 'Transfer / Leaving', merit: 'Merit', appreciation: 'Appreciation', participation: 'Participation', completion: 'Course completion', custom: 'Custom' }
const STYLE_LABEL = { classic: 'Classic (navy & gold)', royal: 'Royal (maroon & gold)', modern: 'Modern (colour band)', elegant: 'Elegant (green & gold)' }
const BLANK = { name: '', kind: 'custom', code: '', heading: '', body: '', style: 'classic', orientation: 'portrait', signatories: ['Class Teacher', 'Principal'], active: true }

function TemplateEditor({ template, fields, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...BLANK, ...template, signatories: (template?.signatories || BLANK.signatories).join(', ') }))
  const [preview, setPreview] = useState(null)
  const [run, busy] = useAction()
  const bodyRef = useRef(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const signatories = form.signatories.split(',').map((s) => s.trim()).filter(Boolean)

  // Preview of the text being edited, with a sample student.
  const key = JSON.stringify([form.body, form.heading, form.style, form.orientation, form.signatories])
  useEffect(() => {
    if (!form.body.trim()) return undefined
    const t = setTimeout(() => {
      api.post('/certificates/preview', {
        draft: { heading: form.heading, body: form.body, style: form.style, orientation: form.orientation, signatories, code: form.code || 'CRT' },
        extras: { purpose: 'Purpose', achievement: 'First Position', event: 'Annual Day', eventDate: '2026-11-14', course: 'Course', reason: 'Reason' },
      }).then(setPreview, () => {})
    }, 400)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const insert = (field) => {
    const el = bodyRef.current
    const tag = `{{${field}}}`
    const start = el?.selectionStart ?? form.body.length
    const end = el?.selectionEnd ?? form.body.length
    setForm({ ...form, body: form.body.slice(0, start) + tag + form.body.slice(end) })
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + tag.length, start + tag.length) })
  }

  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, signatories }
    const ok = await run(() => (template?._id ? api.put(`/certificates/templates/${template._id}`, body) : api.post('/certificates/templates', body)), 'Template saved.')
    if (ok) onSaved()
  }

  return (
    <Modal title={template?._id ? `Edit · ${template.name}` : 'New certificate template'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="tpl-form" disabled={busy}>Save template</button></>}>
      <div className="issue-grid">
        <form id="tpl-form" className="form-grid" onSubmit={submit}>
          <Field label="Template name *"><input className="input" value={form.name} onChange={set('name')} required /></Field>
          <Field label="Type"><select className="select" value={form.kind} onChange={set('kind')}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Heading on certificate *" full><input className="input" value={form.heading} onChange={set('heading')} placeholder="e.g. Certificate of Excellence" required /></Field>
          <Field label="Design"><select className="select" value={form.style} onChange={set('style')}>{Object.entries(STYLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Page"><select className="select" value={form.orientation} onChange={set('orientation')}><option value="portrait">A4 portrait</option><option value="landscape">A4 landscape</option></select></Field>
          <Field label="Serial prefix" hint="e.g. BON → BON-2026-00001"><input className="input" value={form.code} onChange={set('code')} maxLength={6} /></Field>
          <Field label="Signatures" hint="Comma separated, up to 4"><input className="input" value={form.signatories} onChange={set('signatories')} /></Field>
          <Field label="Certificate text *" full hint="A line with only {{name}} is printed large, like on merit certificates. Leave an empty line between paragraphs.">
            <textarea ref={bodyRef} className="textarea" value={form.body} onChange={set('body')} required style={{ minHeight: 170, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 }} />
          </Field>
          <div className="full">
            <div className="small muted" style={{ marginBottom: 6 }}>Click to insert a field:</div>
            <div className="chip-row">{Object.entries(fields).map(([k, l]) => <button type="button" key={k} className="chip" title={l} onClick={() => insert(k)}>{`{{${k}}}`}</button>)}</div>
          </div>
          <label className="check full"><input type="checkbox" checked={form.active} onChange={set('active')} /> Active (can be issued)</label>
        </form>
        <div>
          <div className="small muted" style={{ marginBottom: 6 }}>Preview (sample student)</div>
          {preview && form.body.trim() ? <CertificateDoc data={preview} preview /> : <div className="muted small">Type the certificate text to see a preview.</div>}
        </div>
      </div>
    </Modal>
  )
}

export default function CertificateTemplates() {
  const { user } = useAuth()
  const admin = isAdmin(user)
  const state = useApi('/certificates/templates')
  const meta = useApi('/certificates/meta')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()
  return (
    <>
      <PageHead title="Certificate templates" subtitle="Ready-made formats with fields that fill in automatically from the student record.">
        <Link className="btn" to="/certificates"><ArrowLeft size={16} /> Issued certificates</Link>
        {admin && <button className="btn btn-primary" onClick={() => setEditing({})} disabled={!meta.data}><Plus size={16} /> New template</button>}
      </PageHead>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="tpl-grid">
          {rows.map((t) => (
            <div key={t._id} className={`card tpl-card ${t.active ? '' : 'off'}`}>
              <div className={`tpl-thumb cert-swatch-${t.style}`}><Award size={26} /><span>{t.heading}</span></div>
              <div className="tpl-info">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <h3>{t.name}</h3>
                  {!t.active && <Badge>Inactive</Badge>}
                </div>
                <div className="row small" style={{ gap: 6 }}>
                  <Badge tone="info">{KIND_LABEL[t.kind]}</Badge>
                  <Badge>{t.orientation === 'landscape' ? 'Landscape' : 'Portrait'}</Badge>
                  <span className="muted mono">{t.code}-…</span>
                </div>
                <div className="small muted">{t.issued} issued</div>
                <div className="row" style={{ marginTop: 'auto' }}>
                  {t.active && <Link className="btn btn-sm btn-primary" to={`/certificates?issue=1&template=${t._id}`}><Award size={14} /> Issue</Link>}
                  {admin && <button className="btn btn-sm" onClick={() => setEditing(t)} disabled={!meta.data}><Pencil size={14} /> Edit</button>}
                  {admin && <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(t)} aria-label="Delete template"><Trash2 size={14} /></button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <Empty text="No templates." />}</Async>
      {editing && meta.data && <TemplateEditor template={editing._id ? editing : null} fields={meta.data.fields} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload() }} />}
      {deleting && (
        <Confirm
          text={deleting.issued ? `“${deleting.name}” has been used ${deleting.issued} times, so it will be switched off instead of deleted.` : `Delete the template “${deleting.name}”?`}
          busy={busy}
          onClose={() => setDeleting(null)}
          onConfirm={async () => { if (await run(() => api.del(`/certificates/templates/${deleting._id}`), 'Done.')) { setDeleting(null); state.reload() } }}
        />
      )}
    </>
  )
}
