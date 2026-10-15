import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowDownRight, ArrowUpRight, CheckCircle2, ClipboardCheck, Contact, Grid3x3, IndianRupee, Megaphone, Search, ShieldAlert, UserCog, Users, Wallet,
} from 'lucide-react'
import { Async, Badge, Empty, StatusBadge, useApi } from '../../components/ui.jsx'
import { BarChart, HBarList, LineChart, Sparkline } from '../../components/charts.jsx'
import { compactMoney, money, timeAgo } from '../../lib/format.js'
import { can, myWings, useAuth, WING_LABEL } from '../../lib/auth.jsx'
import { flatLinks, HUB_CATEGORIES, menuFor } from '../../lib/modules.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const STAGES = ['new', 'contacted', 'demo', 'visited', 'converted', 'lost']

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'
}

function Kpi({ icon: Icon, tone, value, label, series, change, to }) {
  const Box = to ? Link : 'div'
  return (
    <Box to={to || undefined} className="card kpi">
      <div className="kpi-top">
        <span className={`tile-ic tone-${tone}`}><Icon size={20} /></span>
        {change != null && (
          <span className={`kpi-change ${change >= 0 ? 'up' : 'down'}`}>
            {change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(change)}%
          </span>
        )}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-spark"><Sparkline values={series} color={`var(--tone-${tone})`} label={`${label} trend`} /></div>
    </Box>
  )
}

function UpdatesTicker({ updates }) {
  return (
    <div className="ticker">
      <span className="ticker-label"><Megaphone size={15} /> Updates</span>
      <div className="ticker-track">
        {updates.length ? (
          <div className="ticker-run" style={{ animationDuration: `${Math.max(18, updates.length * 9)}s` }}>
            {[...updates, ...updates].map((u, i) => (
              <Link key={`${u.id}-${i}`} to="/notices" aria-hidden={i >= updates.length}>
                <span className="ticker-dot" /> {u.title} <span className="muted">({timeAgo(u.at)})</span>
              </Link>
            ))}
          </div>
        ) : <span className="muted small">No new updates</span>}
      </div>
    </div>
  )
}

function EcosystemHub({ user }) {
  const { hash } = useLocation()
  const ref = useRef(null)
  const searchRef = useRef(null)
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const modules = useMemo(() => flatLinks(menuFor(user)).filter((m) => m.to !== '/'), [user])
  const cats = HUB_CATEGORIES.filter((c) => modules.some((m) => m.cat === c))
  const shown = modules.filter((m) => (cat === 'All' || m.cat === cat) && m.label.toLowerCase().includes(q.trim().toLowerCase()))

  useEffect(() => {
    if (hash === '#hub') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])
  // "/" focuses the module search, like the hint says.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="card hub" ref={ref} id="hub">
      <div className="hub-head">
        <h2 className="row" style={{ gap: 8 }}><Grid3x3 size={18} className="accent" /> Ecosystem Hub</h2>
        <p className="small muted"><strong className="accent">{modules.length}</strong> modules — everything your campus runs, in one place</p>
        <div className="hub-tools">
          <label className="hub-search">
            <Search size={15} />
            <input ref={searchRef} placeholder="Search modules…" value={q} onChange={(e) => setQ(e.target.value)} />
            <kbd>/</kbd>
          </label>
          <div className="pill-tabs" role="tablist">
            {['All', ...cats].map((c) => <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'active' : ''} onClick={() => setCat(c)}>{c}</button>)}
          </div>
        </div>
      </div>
      <div className="hub-grid">
        {shown.map((m) => (
          <Link key={m.to} to={m.to} className="hub-tile">
            <span className={`tile-ic tone-${m.color}`}><m.icon size={18} /></span>
            <span>{m.label}</span>
            {m.ai && <span className="ai-tag">AI</span>}
          </Link>
        ))}
        {!shown.length && <div className="muted small" style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center' }}>No module matches your search.</div>}
      </div>
    </div>
  )
}

function LiveActivity({ items }) {
  const [filter, setFilter] = useState('all')
  const shown = items.filter((a) => filter === 'all' || a.type === filter)
  return (
    <div className="card activity">
      <div className="activity-head">
        <div>
          <h2>Live Activity</h2>
          <div className="small muted">Fee payments and notices, newest first</div>
        </div>
        <div className="pill-tabs sm">
          {[['all', 'All'], ['fee', 'Fees'], ['notice', 'Notices']].map(([k, l]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      <div className="activity-list">
        {shown.map((a) => {
          const d = new Date(a.at)
          return (
            <Link key={`${a.type}-${a.id}`} to={a.link} className="act-item">
              <span className={`tile-ic ${a.type === 'fee' ? 'tone-green' : 'tone-pink'}`}>{a.type === 'fee' ? <CheckCircle2 size={18} /> : <Megaphone size={18} />}</span>
              <div className="act-body">
                <div className="act-title">
                  {a.type === 'fee' ? <><strong>{a.title}</strong> {money(a.amount)} fee</> : <><strong>Notice</strong> — {a.title}</>}
                </div>
                <div className="act-meta">
                  {timeAgo(a.at)}
                  {a.type === 'fee' ? <Badge tone="good">Paid · {a.mode?.toUpperCase()}</Badge> : <Badge tone="bad">Notice</Badge>}
                </div>
              </div>
              <div className="act-when">
                <strong>{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</strong>
                <span>{d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </Link>
          )
        })}
        {!shown.length && <Empty text="Nothing yet — payments and notices will show up here." />}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const state = useApi('/dashboard')
  const { user, institute } = useAuth()
  const wings = myWings(user)
  const where = institute?.instituteName || 'your campus'
  const wingText = user.wings ? ` (${wings.map((w) => WING_LABEL[w]).join(' + ')} wing)` : ''
  const dateText = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <Async state={state}>{(d) => {
      const col = d.charts.collection
      const prev = col[col.length - 2]?.total || 0
      const change = prev ? Math.round(((d.fees.collectedThisMonth - prev) / prev) * 100) : null
      const att = d.charts.attendance.map((a) => a.pct)
      return (
        <div className="stack" style={{ gap: 18 }}>
          <div className="dash-head">
            <div>
              <h1>{greeting()}, {user.name.split(' ')[0]} 👋</h1>
              <p className="text-2">Here's what's happening at {where}{wingText} today — {dateText}</p>
            </div>
            <UpdatesTicker updates={d.updates} />
          </div>

          <div className="kpi-grid">
            <Kpi icon={Users} tone="blue" value={d.students.total.toLocaleString('en-IN')} label="Total Students" series={d.charts.students.map((s) => s.total)} to={can(user, 'students') ? '/students' : null} />
            <Kpi icon={Wallet} tone="green" value={money(d.fees.collectedThisMonth)} label="Collected This Month" series={col.map((c) => c.total)} change={change} to={can(user, 'fees') ? '/fees' : null} />
            <Kpi icon={ClipboardCheck} tone="indigo" value={d.attendanceToday.pct != null ? `${d.attendanceToday.pct}%` : '—'} label={d.attendanceToday.marked ? 'Attendance Today' : 'Attendance (not marked)'} series={att.length ? att : [0, 0]} to={can(user, 'attendance') ? '/attendance' : null} />
            <Kpi icon={UserCog} tone="violet" value={d.staff} label="Active Staff" series={d.charts.staff.map((s) => s.total)} to={can(user, 'staff') ? '/staff' : null} />
            <Kpi icon={IndianRupee} tone="red" value={money(d.fees.outstanding)} label="Pending Dues (All Years)" series={d.charts.dues.map((s) => s.total)} to={can(user, 'fees') ? '/fees' : null} />
          </div>

          <div className="hub-row">
            <EcosystemHub user={user} />
            <LiveActivity items={d.activity} />
          </div>

          <div className="grid grid-2">
            <div className="card">
              <div className="card-head"><h2>Fee collection</h2><span className="sub">Last 6 months</span></div>
              <div className="card-body">
                <BarChart
                  title="Monthly fee collection"
                  data={col.map((c) => ({ label: `${MONTHS[Number(c.month.slice(5)) - 1]} ${c.month.slice(2, 4)}`, value: c.total }))}
                  format={money}
                  axisFormat={compactMoney}
                />
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h2>Attendance trend</h2><span className="sub">Daily %, last 14 school days</span></div>
              <div className="card-body">
                {d.charts.attendance.length ? (
                  <LineChart
                    title="Daily attendance percentage"
                    data={d.charts.attendance.map((a) => ({ label: new Date(`${a.date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: a.pct }))}
                    min={50}
                    max={100}
                    format={(v) => `${Math.round(v)}%`}
                    reference={75}
                    referenceLabel="75% required"
                  />
                ) : <Empty text="No attendance marked yet." />}
              </div>
            </div>
          </div>

          <div className="grid grid-3">
            <div className="card span-2">
              <div className="card-head">
                <h2 className="row"><ShieldAlert size={18} /> Students needing attention</h2>
                <Link to="/insights" className="small">See all →</Link>
              </div>
              {d.atRisk.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Student</th><th>Risk</th><th>Why</th></tr></thead>
                    <tbody>
                      {d.atRisk.map((r) => (
                        <tr key={r.student._id}>
                          <td><Link to={`/students/${r.student._id}`} className="cell-title">{r.student.name}</Link><div className="cell-sub">{r.student.batch?.name}</div></td>
                          <td><StatusBadge value={r.level} label={`${r.level} · ${r.score}`} /></td>
                          <td className="small text-2">{r.reasons.join(' · ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty text="No students at risk right now. 🎉" />}
            </div>
            <div className="card">
              <div className="card-head">
                <h2 className="row"><Contact size={18} /> Admissions pipeline</h2>
                <Link to="/leads" className="small">Open CRM →</Link>
              </div>
              <div className="card-body">
                <HBarList items={STAGES.map((s) => ({ label: s, value: d.leads.byStatus[s] || 0 }))} />
                <div className="hr" />
                <div className="row between">
                  <span className="text-2">Open enquiries</span>
                  <Badge tone="info">{d.leads.open}</Badge>
                </div>
                <div className="row between mt" style={{ marginTop: 8 }}>
                  <span className="text-2">Follow-ups due today</span>
                  <Badge tone={d.leads.followupsDue ? 'warn' : 'good'}>{d.leads.followupsDue}</Badge>
                </div>
                <div className="row between" style={{ marginTop: 8 }}>
                  <span className="text-2">Overdue fees</span>
                  <Badge tone={d.fees.overdue ? 'bad' : 'good'}>{compactMoney(d.fees.overdue)} · {d.fees.defaulters} students</Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }}</Async>
  )
}
