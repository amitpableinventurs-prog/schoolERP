import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck, Search, ShieldX } from 'lucide-react'
import { fmtDate } from '../lib/format.js'
import { useApi } from '../components/ui.jsx'

// Public page: anyone (a school, employer, embassy…) can check a certificate serial number.
export default function Verify() {
  const { serial } = useParams()
  const navigate = useNavigate()
  const [input, setInput] = useState(serial || '')
  const state = useApi(serial ? `/verify/${encodeURIComponent(serial)}` : null)
  const d = state.data
  const failed = state.error

  return (
    <div className="verify-wrap">
      <div className="verify-card card">
        <div className="verify-head">
          <BadgeCheck size={28} />
          <div>
            <h1>Certificate verification</h1>
            <p className="text-2 small">Enter the certificate number printed at the top of the certificate.</p>
          </div>
        </div>
        <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); if (input.trim()) navigate(`/verify/${encodeURIComponent(input.trim().toUpperCase())}`) }}>
          <input className="input mono" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. BON-2026-00001" aria-label="Certificate number" />
          <button className="btn btn-primary"><Search size={15} /> Verify</button>
        </form>

        {serial && state.loading && <div className="muted small">Checking…</div>}
        {serial && failed && !state.loading && (
          <div className="verify-result bad">
            <ShieldX size={26} />
            <div><strong>Not found</strong><div className="small">{String(failed).includes('Too many') ? failed : `No certificate with number ${serial} exists. Please check the number.`}</div></div>
          </div>
        )}
        {d && !state.loading && (
          <div className={`verify-result ${d.valid ? 'good' : 'bad'}`}>
            {d.valid ? <BadgeCheck size={26} /> : <ShieldX size={26} />}
            <div style={{ flex: 1 }}>
              <strong>{d.valid ? 'Genuine certificate' : 'This certificate has been revoked'}</strong>
              <table className="verify-table">
                <tbody>
                  <tr><th>Certificate</th><td>{d.heading}</td></tr>
                  <tr><th>Number</th><td className="mono">{d.serialNo}</td></tr>
                  <tr><th>Issued to</th><td>{d.studentName} ({d.admissionNo})</td></tr>
                  {d.className && <tr><th>Class</th><td>{d.className}</td></tr>}
                  <tr><th>Issued on</th><td>{fmtDate(d.issuedOn)}</td></tr>
                  <tr><th>Issued by</th><td>{d.institute}</td></tr>
                  {d.revokedReason && <tr><th>Reason</th><td>{d.revokedReason}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <Link to="/" className="small" style={{ textAlign: 'center' }}>Go to the ERP login</Link>
      </div>
    </div>
  )
}
