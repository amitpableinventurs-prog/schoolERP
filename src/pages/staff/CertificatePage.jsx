import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, Copy, Eye, EyeOff } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDateTime, verifyUrl } from '../../lib/format.js'
import { CertificateDoc } from '../../components/Certificate.jsx'
import { PrintBar } from '../../components/Documents.jsx'
import { Async, Field, Modal, useAction, useApi, useToast } from '../../components/ui.jsx'

function RevokeModal({ cert, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    if (await run(() => api.post(`/certificates/${cert._id}/revoke`, { reason }), 'Certificate revoked.')) onDone()
  }
  return (
    <Modal title={`Revoke ${cert.serialNo}`} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <p className="text-2">A revoked certificate shows as <strong>not valid</strong> on the verification page. This cannot be undone — issue a new one if needed.</p>
        <Field label="Reason *"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. issued with a wrong date of birth" required autoFocus /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-danger" disabled={busy}><Ban size={15} /> Revoke</button></div>
      </form>
    </Modal>
  )
}

export default function CertificatePage() {
  const { id } = useParams()
  const state = useApi(`/certificates/${id}`)
  const [revoking, setRevoking] = useState(false)
  const [run, busy] = useAction()
  const toast = useToast()
  return (
    <Async state={state}>{(c) => (
      <>
        <PrintBar back={(
          <div className="row">
            <Link to="/certificates" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Certificates</Link>
            <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(verifyUrl(c.serialNo)).then(() => toast('Verification link copied.'))}><Copy size={14} /> Copy verify link</button>
            <button className="btn btn-sm" disabled={busy} onClick={async () => { if (await run(() => api.post(`/certificates/${c._id}/share`, { shared: !c.shared }), c.shared ? 'Hidden from the portal.' : 'Shown in the portal.')) state.reload() }}>
              {c.shared ? <><EyeOff size={14} /> Hide from portal</> : <><Eye size={14} /> Show in portal</>}
            </button>
            {c.status !== 'revoked' && <button className="btn btn-sm btn-danger" onClick={() => setRevoking(true)}><Ban size={14} /> Revoke</button>}
          </div>
        )} />
        {c.status === 'revoked' && (
          <div className="alert alert-error mb no-print">Revoked on {fmtDateTime(c.revokedAt)}{c.revokedReason ? ` — ${c.revokedReason}` : ''}</div>
        )}
        <div className="cert-page"><CertificateDoc data={c} /></div>
        <p className="small muted no-print" style={{ textAlign: 'center', marginTop: 12 }}>Issued by {c.issuedByName || '—'} · {fmtDateTime(c.createdAt)} · {c.shared ? 'Visible' : 'Hidden'} in the student / parent portal</p>
        {revoking && <RevokeModal cert={c} onClose={() => setRevoking(false)} onDone={() => { setRevoking(false); state.reload() }} />}
      </>
    )}</Async>
  )
}
