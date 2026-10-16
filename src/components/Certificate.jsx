// A printable certificate. Sizes are in container units, so the same markup works
// as a small preview, on screen and on an A4 page.
import { Award } from 'lucide-react'
import { fmtDate, verifyUrl } from '../lib/format.js'

export function CertificateDoc({ data, preview = false }) {
  const { heading, body, style = 'classic', orientation = 'portrait', signatories = [], serialNo, issuedOn, institute = {}, status } = data
  const studentName = data.student?.name
  const paragraphs = String(body || '').split(/\n\s*\n/)
  const initials = (institute.instituteName || 'SC').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
  return (
    <div className={`cert cert-${style} cert-${orientation}`}>
      {!preview && <style>{`@page { size: A4 ${orientation}; margin: 0; }`}</style>}
      <div className="cert-frame">
        <div className="cert-inner">
          <div className="cert-watermark" aria-hidden="true">{initials}</div>
          <div className="cert-top">
            <span>Certificate No. <strong>{serialNo}</strong></span>
            <span>Date: <strong>{fmtDate(issuedOn)}</strong></span>
          </div>
          <div className="cert-logo"><Award /></div>
          <div className="cert-institute">{institute.instituteName}</div>
          {institute.address && <div className="cert-address">{institute.address}</div>}
          <h1 className="cert-heading">{heading}</h1>
          <div className="cert-rule" aria-hidden="true"><span /></div>
          <div className="cert-body">
            {paragraphs.map((p, i) => (
              <p key={i}>
                {p.split('\n').map((line, j) => (
                  line.trim() === studentName
                    ? <span key={j} className="cert-name">{line.trim()}</span>
                    : <span key={j} className="cert-line">{line}</span>
                ))}
              </p>
            ))}
          </div>
          <div className="cert-signs">
            {signatories.map((s) => <div key={s}><span className="cert-sign-line" />{s}</div>)}
          </div>
          {serialNo && !serialNo.endsWith('XXXXX') && <div className="cert-verify">Verify this certificate at {verifyUrl(serialNo)}</div>}
          {status === 'revoked' && <div className="cert-void">REVOKED</div>}
        </div>
      </div>
    </div>
  )
}
