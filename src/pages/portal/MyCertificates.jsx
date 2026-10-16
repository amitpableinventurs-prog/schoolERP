import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Award } from 'lucide-react'
import { fmtDate } from '../../lib/format.js'
import { CertificateDoc } from '../../components/Certificate.jsx'
import { PrintBar } from '../../components/Documents.jsx'
import { Async, Badge, Empty, PageHead, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyCertificates() {
  const { api, to, my } = useScope()
  const state = useApi(`${api}/certificates`)
  return (
    <>
      <PageHead title={my('certificates')} subtitle="Certificates issued by the institute. Open one to print or save it as PDF." />
      <Async state={state}>{(rows) => rows.length ? (
        <div className="tpl-grid">
          {rows.map((c) => (
            <Link key={c._id} to={to(`certificates/${c._id}`)} className={`card tpl-card link-card ${c.status === 'revoked' ? 'off' : ''}`}>
              <div className={`tpl-thumb cert-swatch-${c.style}`}><Award size={26} /><span>{c.heading}</span></div>
              <div className="tpl-info">
                <h3>{c.heading}</h3>
                <div className="small muted mono">{c.serialNo}</div>
                <div className="row small">Issued {fmtDate(c.issuedOn)} {c.status === 'revoked' ? <Badge tone="bad">Revoked</Badge> : <Badge tone="good">Valid</Badge>}</div>
              </div>
            </Link>
          ))}
        </div>
      ) : <Empty icon={Award} text="No certificates yet." />}</Async>
    </>
  )
}

export function MyCertificate() {
  const { id } = useParams()
  const { api, to } = useScope()
  const state = useApi(`${api}/certificates/${id}`)
  return (
    <>
      <PrintBar back={<Link to={to('certificates')} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Certificates</Link>} />
      <Async state={state}>{(c) => <div className="cert-page"><CertificateDoc data={c} /></div>}</Async>
    </>
  )
}
