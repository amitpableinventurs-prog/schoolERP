import { Fragment, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, ChevronDown, ChevronRight, LogIn, ShieldAlert, Trash2 } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { ROLE_NAME } from '../../lib/auth.jsx'
import { fmtDateTime } from '../../lib/format.js'
import { Async, Badge, Empty, PageHead, SearchInput, StatTile, useAction, useApi, WingBadges } from '../../components/ui.jsx'

const ACTION = {
  create: ['good', 'Created'], update: ['info', 'Updated'], delete: ['bad', 'Deleted'], ai: ['ai', 'AI'],
  login: ['', 'Login'], login_failed: ['bad', 'Failed login'], logout: ['', 'Logout'], other: ['', 'Other'],
}

function Summary({ data }) {
  const t = data.today
  const changes = (t.create || 0) + (t.update || 0) + (t.delete || 0) + (t.ai || 0)
  return (
    <>
      <div className="grid grid-4 mb">
        <StatTile icon={Activity} label="Changes today" value={changes} foot={`${t.create || 0} created · ${t.update || 0} updated`} />
        <StatTile icon={Trash2} label="Deletes today" value={t.delete || 0} tone={t.delete ? 'bad' : undefined} />
        <StatTile icon={LogIn} label="Logins today" value={t.login || 0} />
        <StatTile icon={ShieldAlert} label="Failed logins today" value={t.login_failed || 0} tone={t.login_failed ? 'bad' : undefined} foot="Wrong password or unknown ID" />
      </div>
      <div className="grid grid-2 mb">
        <div className="card">
          <div className="card-head"><h2>Most active this week</h2></div>
          <div className="card-body stack" style={{ gap: 8 }}>
            {data.topUsers.length ? data.topUsers.map((u) => (
              <div key={u._id} className="row between"><span>{u.name} <span className="small muted">· {ROLE_NAME[u.role] || u.role}</span></span><strong>{u.n} changes</strong></div>
            )) : <span className="muted">No changes this week.</span>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Recent failed logins</h2></div>
          <div className="card-body stack" style={{ gap: 8 }}>
            {data.failed.length ? data.failed.map((f) => (
              <div key={f._id} className="row between small"><span>{f.summary.replace('Failed login for ', '')}{f.userName !== 'Unknown' ? ` (${f.userName})` : ''}</span><span className="muted">{fmtDateTime(f.createdAt)} · {f.ip}</span></div>
            )) : <span className="muted">None this week.</span>}
          </div>
        </div>
      </div>
    </>
  )
}

export default function ActivityLog() {
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(['user', 'wing', 'module', 'action', 'from', 'to', 'q'].map((k) => [k, params.get(k) || '']))
  const setFilter = (k, v) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }
  const summary = useApi('/activity/summary')
  const users = useApi('/admin/admins?all=1')
  const state = useApi(`/activity${qs(filters)}`)
  const [older, setOlder] = useState({ key: '', rows: [], more: null })
  const [open, setOpen] = useState(null)
  const [run, busy] = useAction()

  // Rows loaded with "Load older" belong to the current filters only.
  const key = state.version
  const extra = older.key === key ? older : { key, rows: [], more: null }
  const rows = state.data ? [...state.data.rows, ...extra.rows] : []
  const more = extra.more ?? state.data?.more
  const loadOlder = async () => {
    const last = rows.at(-1)
    const r = await run(() => api.get(`/activity${qs({ ...filters, before: last.createdAt })}`))
    if (r) setOlder({ key, rows: [...extra.rows, ...r.rows], more: r.more })
  }

  return (
    <>
      <PageHead title="Activity Log" subtitle="Everything admins and staff changed — who, when, in which wing — plus every login and failed login. Records cannot be edited or deleted from the app." />
      <Async state={summary}>{(d) => <Summary data={d} />}</Async>
      <div className="filters">
        <select className="select" value={filters.user} onChange={(e) => setFilter('user', e.target.value)}>
          <option value="">Everyone</option>
          {(users.data || []).map((u) => <option key={u._id} value={u._id}>{u.name} · {ROLE_NAME[u.role] || u.role}</option>)}
        </select>
        <select className="select" value={filters.wing} onChange={(e) => setFilter('wing', e.target.value)}>
          <option value="">All wings</option><option value="school">School</option><option value="college">College</option><option value="coaching">Coaching</option><option value="all">Institute-wide users</option>
        </select>
        <select className="select" value={filters.module} onChange={(e) => setFilter('module', e.target.value)}>
          <option value="">All modules</option>
          {(summary.data?.modules || []).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="select" value={filters.action} onChange={(e) => setFilter('action', e.target.value)}>
          <option value="">All actions</option>
          {Object.entries(ACTION).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="input" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="From date" />
        <input className="input" type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="To date" />
        <SearchInput value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search text…" />
      </div>
      <Async state={state}>{() => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th style={{ width: 28 }} /><th>When</th><th>Who</th><th>Action</th><th>Module</th><th>What happened</th></tr></thead>
              <tbody>{rows.map((r) => {
                const [tone, label] = ACTION[r.action] || ACTION.other
                const isOpen = open === r._id
                return (
                  <Fragment key={r._id}>
                    <tr className="clickable" onClick={() => setOpen(isOpen ? null : r._id)}>
                      <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="small nowrap">{fmtDateTime(r.createdAt)}</td>
                      <td><div className="cell-title">{r.userName}</div><div className="row" style={{ gap: 4, marginTop: 2 }}><span className="cell-sub">{ROLE_NAME[r.role] || r.role || '—'}</span>{r.role && r.role !== 'superadmin' && <WingBadges wings={r.wings} />}</div></td>
                      <td><Badge tone={tone}>{label}</Badge></td>
                      <td className="small">{r.module}</td>
                      <td style={{ maxWidth: 420 }}>{r.summary}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td />
                        <td colSpan={5}>
                          <div className="small text-2 mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {r.method} {r.path} · status {r.status ?? '—'} · IP {r.ip || '—'}{r.target ? ` · record ${r.target}` : ''}
                            {r.detail ? `\n${JSON.stringify(r.detail, null, 2)}` : ''}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}</tbody>
            </table>
          </div>
          {more && <div className="card-body"><button className="btn" onClick={loadOlder} disabled={busy}>{busy ? 'Loading…' : 'Load older'}</button></div>}
        </div>
      ) : <Empty icon={Activity} text="No activity matches these filters." />}</Async>
    </>
  )
}
