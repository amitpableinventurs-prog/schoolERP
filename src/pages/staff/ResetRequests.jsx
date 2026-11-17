import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, KeyRound, X } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDateTime, waLink } from '../../lib/format.js'
import { Async, Badge, Empty, Field, Modal, PageHead, useAction, useApi, useToast, WhatsAppIcon } from '../../components/ui.jsx'

const ROLE = { student: 'Student', parent: 'Parent', teacher: 'Teacher', accountant: 'Accountant', counsellor: 'Counsellor', admin: 'Wing admin' }

// After the reset: the new password, ready to send on WhatsApp with the live login link.
function Done({ result, onClose }) {
  const toast = useToast()
  const message = `Your Smart Campus password has been reset.\nLogin ID: ${result.loginId}\nNew password: ${result.password}\nSign in here: ${result.loginUrl}\nPlease change the password after signing in (menu → Change password).`
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); toast('Copied.') } catch { toast('Copy failed — select the text instead.', 'error') }
  }
  return (
    <Modal title={`New password for ${result.name}`} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="stack">
        <div className="alert alert-info pre" style={{ userSelect: 'all' }}>{message}</div>
        <div className="row">
          {result.phone && <a className="btn btn-primary" target="_blank" rel="noreferrer" href={waLink(result.phone, message)}><WhatsAppIcon size={15} color="currentColor" /> Send on WhatsApp</a>}
          <button className="btn" onClick={copy}><Copy size={14} /> Copy message</button>
        </div>
      </div>
    </Modal>
  )
}

function ResetModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    const r = await run(() => api.post(`/reset-requests/${user._id}/reset`, { password }))
    if (r) onDone(r)
  }
  return (
    <Modal title={`Reset password: ${user.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="reset-form" disabled={busy}>Reset password</button></>}>
      <form id="reset-form" className="stack" onSubmit={submit}>
        <p className="text-2">Login ID <span className="mono">{user.loginId}</span> · {ROLE[user.role]}</p>
        <Field label="New password" hint="Leave empty for a random 6-digit password"><input className="input" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} placeholder="Random" /></Field>
        <p className="small muted">Please confirm the person's identity (call the registered guardian number) before sharing a new password.</p>
      </form>
    </Modal>
  )
}

// "Forgot password" requests from people with no email on record.
export default function ResetRequests() {
  const state = useApi('/reset-requests')
  const [resetting, setResetting] = useState(null)
  const [done, setDone] = useState(null)
  const [run, busy] = useAction()
  const changed = () => { state.reload(); window.dispatchEvent(new Event('resets-changed')) }
  const dismiss = async (u) => { if (await run(() => api.post(`/reset-requests/${u._id}/dismiss`), 'Request dismissed.')) changed() }
  return (
    <>
      <PageHead title="Password requests" subtitle="People who pressed “Forgot password?” and have no email on record. Reset the password and share it with them, e.g. on WhatsApp." />
      <Async state={state}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Login ID</th><th>Who</th><th>Asked</th><th /></tr></thead>
              <tbody>{rows.map((u) => (
                <tr key={u._id}>
                  <td>
                    <div className="cell-title">{u.name}</div>
                    {u.student && <div className="cell-sub"><Link to={`/students/${u.student._id}`}>{u.student.admissionNo}</Link> · {u.student.batch?.name}</div>}
                    {u.children?.length > 0 && <div className="cell-sub">Parent of {u.children.map((c) => c.name).join(', ')}</div>}
                  </td>
                  <td className="mono">{u.loginId}</td>
                  <td><Badge tone="info">{ROLE[u.role] || u.role}</Badge></td>
                  <td className="small">{fmtDateTime(u.resetRequestedAt)}</td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm btn-primary" onClick={() => setResetting(u)}><KeyRound size={13} /> Reset</button>
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => dismiss(u)} disabled={busy} title="Dismiss" aria-label="Dismiss"><X size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty icon={KeyRound} text="No password requests right now." />}</Async>
      {resetting && <ResetModal user={resetting} onClose={() => setResetting(null)} onDone={(r) => { setResetting(null); setDone(r); changed() }} />}
      {done && <Done result={done} onClose={() => setDone(null)} />}
    </>
  )
}
