import { BookOpen, ExternalLink } from 'lucide-react'
import { fmtDate } from '../../lib/format.js'
import { KIND_ICON } from '../staff/Materials.jsx'
import { Async, Badge, Empty, PageHead, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyMaterials() {
  const { api } = useScope()
  const state = useApi(`${api}/materials`)
  return (
    <>
      <PageHead title="Study material" subtitle="Notes, lectures, DPPs and assignments shared by your teachers." />
      <Async state={state}>{(rows) => rows.length ? (
        <div className="grid grid-3">
          {rows.map((m) => {
            const Icon = KIND_ICON[m.kind] || BookOpen
            return (
              <div className="card card-pad stack" key={m._id}>
                <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <span className="stat-icon"><Icon size={16} /></span>
                  <div><div className="cell-title">{m.title}</div><div className="cell-sub">{m.subject || 'General'} · {fmtDate(m.createdAt)}</div></div>
                </div>
                {m.description && <p className="small text-2">{m.description}</p>}
                <div className="row between">
                  <div className="row"><Badge>{m.kind}</Badge>{m.dueDate && <Badge tone="warn">Due {fmtDate(m.dueDate)}</Badge>}</div>
                  {m.url && <a className="btn btn-sm" href={m.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open</a>}
                </div>
              </div>
            )
          })}
        </div>
      ) : <Empty text="Nothing shared yet." />}</Async>
    </>
  )
}
