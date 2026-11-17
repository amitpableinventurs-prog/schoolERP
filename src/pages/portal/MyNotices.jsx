import { useEffect } from 'react'
import { Bell, Pin, RefreshCw } from 'lucide-react'
import { fmtDate, timeAgo } from '../../lib/format.js'
import { Async, Badge, Empty, PageHead, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

const isNew = (n) => Date.now() - new Date(n.createdAt) < 3 * 86_400_000

function NoticeCard({ n }) {
  return (
    <div className="card card-pad">
      <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <h2 className="row">{n.pinned && <Pin size={15} />} {n.title}</h2>
        {isNew(n) && <Badge tone="info">New</Badge>}
      </div>
      <div className="small muted" style={{ marginTop: 2 }}>{fmtDate(n.createdAt)} · {timeAgo(n.createdAt)}{n.createdBy ? ` · ${n.createdBy}` : ''}</div>
      <p className="pre text-2" style={{ marginTop: 10 }}>{n.body}</p>
    </div>
  )
}

// Newest notices first; pinned ones stay in their own strip on top.
export default function MyNotices() {
  const { api } = useScope()
  const state = useApi(`${api}/notices`)
  const { reload } = state
  // Fresh notices whenever the app comes back to the front.
  useEffect(() => {
    const onShow = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [reload])
  return (
    <>
      <PageHead title="Notice board" subtitle="Announcements from the school, newest first.">
        <button className="btn" onClick={reload} disabled={state.loading}><RefreshCw size={15} /> Refresh</button>
      </PageHead>
      <Async state={state}>{(rows) => {
        if (!rows.length) return <Empty icon={Bell} text="No notices yet." />
        const pinned = rows.filter((n) => n.pinned)
        const latest = rows.filter((n) => !n.pinned)
        return (
          <div className="stack">
            {pinned.length > 0 && <div className="small muted row" style={{ gap: 4 }}><Pin size={13} /> Pinned</div>}
            {pinned.map((n) => <NoticeCard key={n._id} n={n} />)}
            {pinned.length > 0 && latest.length > 0 && <div className="small muted" style={{ marginTop: 6 }}>Latest</div>}
            {latest.map((n) => <NoticeCard key={n._id} n={n} />)}
          </div>
        )
      }}</Async>
    </>
  )
}
