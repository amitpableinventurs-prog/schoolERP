import { Pin } from 'lucide-react'
import { fmtDate } from '../../lib/format.js'
import { Async, Empty, PageHead, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyNotices() {
  const { api } = useScope()
  const state = useApi(`${api}/notices`)
  return (
    <>
      <PageHead title="Notices" />
      <Async state={state}>{(rows) => rows.length ? (
        <div className="stack">
          {rows.map((n) => (
            <div className="card card-pad" key={n._id}>
              <h2 className="row">{n.pinned && <Pin size={15} />} {n.title}</h2>
              <div className="small muted" style={{ marginTop: 2 }}>{fmtDate(n.createdAt)}</div>
              <p className="pre text-2" style={{ marginTop: 10 }}>{n.body}</p>
            </div>
          ))}
        </div>
      ) : <Empty text="No notices." />}</Async>
    </>
  )
}
