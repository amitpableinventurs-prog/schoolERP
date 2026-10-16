import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Award, Bell, BookOpen, Bot, Brain, Bus, CalendarDays, CalendarX2, ChevronDown, ChevronLeft, ClipboardCheck, ClipboardList, Gauge,
  GraduationCap, IndianRupee, KeyRound, LayoutDashboard, LayoutGrid, LogOut, Menu, MonitorPlay, Moon, Plus, Search, Sun, Timer, Users2,
} from 'lucide-react'
import { can, useAuth, WING_LABEL } from '../lib/auth.jsx'
import { api } from '../lib/api.js'
import { initials } from '../lib/format.js'
import { flatLinks, menuFor, QUICK_ADD } from '../lib/modules.js'
import { PORTALS, portalOfRole } from '../lib/portals.js'
import { Field, Loading, Modal, useAction, useApi } from './ui.jsx'

const PORTAL_MENU = [
  { title: 'My Campus', items: [
    { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
    { to: '/my/attendance', label: 'Attendance', icon: ClipboardCheck },
    { to: '/my/timetable', label: 'Timetable', icon: CalendarDays },
    { to: '/my/results', label: 'Results', icon: GraduationCap },
    { to: '/my/tests', label: 'Online Tests', icon: Timer },
    { to: '/my/courses', label: 'Courses', icon: MonitorPlay },
    { to: '/my/assignments', label: 'Assignments', icon: ClipboardList },
    { to: '/my/materials', label: 'Study Material', icon: BookOpen },
    { to: '/my/doubts', label: 'AI Tutor & Doubts', icon: Brain, ai: true },
    { to: '/my/fees', label: 'Fees', icon: IndianRupee },
    { to: '/my/notices', label: 'Notices', icon: Bell },
    { to: '/my/leaves', label: 'Leave', icon: CalendarX2 },
    { to: '/my/transport', label: 'Transport', icon: Bus },
    { to: '/my/certificates', label: 'Certificates', icon: Award },
  ] },
]

// Parent menu: the pages of the child being viewed.
function parentMenu(user, childId) {
  const child = user.children?.find((c) => c._id === childId) || user.children?.[0]
  const sections = []
  if (user.children?.length > 1) sections.push({ title: 'Family', items: [{ to: '/children', label: 'All children', icon: Users2, end: true }] })
  if (!child) return sections
  const base = `/child/${child._id}`
  sections.push({ title: child.name.split(' ')[0], items: [
    { to: base, label: 'Overview', icon: LayoutDashboard, end: true },
    { to: `${base}/attendance`, label: 'Attendance', icon: ClipboardCheck },
    { to: `${base}/timetable`, label: 'Timetable', icon: CalendarDays },
    { to: `${base}/results`, label: 'Results', icon: GraduationCap },
    { to: `${base}/tests`, label: 'Online Tests', icon: Timer },
    { to: `${base}/courses`, label: 'Courses', icon: MonitorPlay },
    { to: `${base}/assignments`, label: 'Homework', icon: ClipboardList },
    { to: `${base}/materials`, label: 'Study Material', icon: BookOpen },
    { to: `${base}/fees`, label: 'Fees', icon: IndianRupee },
    { to: `${base}/notices`, label: 'Notices', icon: Bell },
    { to: `${base}/leaves`, label: 'Leave', icon: CalendarX2 },
    { to: `${base}/transport`, label: 'Transport', icon: Bus },
    { to: `${base}/certificates`, label: 'Certificates', icon: Award },
  ] })
  return sections
}

// Switches between siblings, staying on the same page.
function ChildSwitcher({ user, childId }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  if (!(user.children?.length > 1)) return null
  const change = (id) => navigate(childId ? pathname.replace(`/child/${childId}`, `/child/${id}`) : `/child/${id}`)
  return (
    <div className="child-switch">
      <label className="small" htmlFor="child-switch">Viewing</label>
      <select id="child-switch" className="select" value={childId || ''} onChange={(e) => change(e.target.value)}>
        {!childId && <option value="">Choose a child…</option>}
        {user.children.map((c) => <option key={c._id} value={c._id}>{c.name} · {c.batch?.name}</option>)}
      </select>
    </div>
  )
}

function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) ?? initial } catch { return initial }
  })
  useEffect(() => {
    try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key) } catch { /* private mode */ }
  }, [key, value])
  return [value, setValue]
}

function useTheme() {
  const [theme, setTheme] = useStored('theme', '')
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
  }, [theme])
  const isDark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  return [isDark, () => setTheme(isDark ? 'light' : 'dark')]
}

// A topbar dropdown that closes on outside click or Escape.
// `button(toggle, open)` renders the trigger; `children(close)` renders the menu.
function Dropdown({ button, children, width }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="dd" ref={ref}>
      {button(() => setOpen((o) => !o), open)}
      {open && <div className="dd-menu" style={width ? { width } : undefined}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

function PasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: '', next: '' })
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    const ok = await run(() => api.post('/auth/password', form), 'Password changed.')
    if (ok) onClose()
  }
  return (
    <Modal title="Change password" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label="Current password"><input className="input" type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required /></Field>
        <Field label="New password" hint="At least 6 characters"><input className="input" type="password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} minLength={6} required /></Field>
        <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" disabled={busy}>Save</button></div>
      </form>
    </Modal>
  )
}

// Ctrl+K jump-to-module palette.
function CommandPalette({ links, onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const results = links.filter((l) => l.label.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12)
  const go = (l) => { navigate(l.to); onClose() }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && results[active]) go(results[active])
    if (e.key === 'Escape') onClose()
  }
  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command center">
        <div className="palette-search">
          <Search size={18} />
          <input autoFocus placeholder="Jump to a module…" value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }} onKeyDown={onKey} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {results.map((l, i) => (
            <button key={l.to} className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => go(l)}>
              <span className={`tile-ic sm tone-${l.color || 'blue'}`}><l.icon size={15} /></span>
              {l.label}
              {l.cat && <span className="muted small" style={{ marginLeft: 'auto' }}>{l.cat}</span>}
            </button>
          ))}
          {!results.length && <div className="muted small" style={{ padding: 16 }}>No module matches “{q}”.</div>}
        </div>
      </div>
    </div>
  )
}

function SideLink({ item, counts, onNavigate, child }) {
  return (
    <NavLink to={item.to} end={item.end} onClick={onNavigate} className={child ? 'sub' : undefined}>
      {child ? <span className="dot" /> : <item.icon size={18} />}
      <span className="lbl">{item.label}</span>
      {item.ai && <span className="ai-tag">AI</span>}
      {item.count && counts[item.count] > 0 && <span className="nav-count">{counts[item.count]}</span>}
    </NavLink>
  )
}

function SideGroup({ group, counts, onNavigate }) {
  const { pathname } = useLocation()
  const hasActive = group.children.some((c) => (c.end ? pathname === c.to : pathname === c.to || pathname.startsWith(`${c.to}/`)))
  const [open, setOpen] = useState(hasActive)
  const [seen, setSeen] = useState(pathname)
  // Re-open the group when navigation lands inside it.
  if (seen !== pathname) { setSeen(pathname); if (hasActive && !open) setOpen(true) }
  const total = group.children.reduce((n, c) => n + (c.count ? counts[c.count] || 0 : 0), 0)
  return (
    <div className={`nav-tree ${open ? 'open' : ''}`}>
      <button className={`nav-parent ${hasActive ? 'has-active' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <group.icon size={18} />
        <span className="lbl">{group.label}</span>
        {total > 0 && !open && <span className="nav-count">{total}</span>}
        <ChevronLeft size={15} className="chev" />
      </button>
      {open && <div className="nav-children">{group.children.map((c) => <SideLink key={c.to} item={c} counts={counts} onNavigate={onNavigate} child />)}</div>}
    </div>
  )
}

const ROLE_LABEL = { superadmin: 'Super Admin', admin: 'Wing Admin', teacher: 'Teacher', accountant: 'Accountant', counsellor: 'Counsellor', student: 'Student', parent: 'Parent' }

export default function Layout() {
  const { user, institute, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useStored('sidebar-collapsed', '')
  const [pwd, setPwd] = useState(false)
  const [palette, setPalette] = useState(false)
  const [menuQ, setMenuQ] = useState('')
  const [isDark, toggleTheme] = useTheme()

  const { pathname } = useLocation()
  const isStaff = !['student', 'parent'].includes(user.role)
  const childId = user.role === 'parent' ? pathname.match(/^\/child\/([^/]+)/)?.[1] : null
  const pendingLeaves = useApi('/leaves/pending-count', { skip: !can(user, 'leaves') })
  const counts = { leaves: pendingLeaves.data?.count }
  const reloadLeaves = pendingLeaves.reload
  useEffect(() => {
    window.addEventListener('leaves-changed', reloadLeaves)
    return () => window.removeEventListener('leaves-changed', reloadLeaves)
  }, [reloadLeaves])

  const menu = useMemo(() => (user.role === 'student' ? PORTAL_MENU : user.role === 'parent' ? parentMenu(user, childId) : menuFor(user)), [user, childId])
  const links = useMemo(() => flatLinks(menu), [menu])
  const matches = menuQ.trim() ? links.filter((l) => l.label.toLowerCase().includes(menuQ.trim().toLowerCase())) : null
  const quick = QUICK_ADD.filter((q) => can(user, q.section))

  // Ctrl/Cmd+K opens the command palette.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleMenu = () => (window.matchMedia('(max-width: 960px)').matches ? setOpen(true) : setCollapsed(collapsed ? '' : '1'))
  const closeMobile = () => setOpen(false)
  const instituteName = institute?.instituteName || 'Smart Campus'
  const portal = PORTALS[portalOfRole(user.role)]
  const alerts = [
    counts.leaves > 0 && { to: '/leaves', icon: CalendarX2, text: `${counts.leaves} leave request${counts.leaves > 1 ? 's' : ''} waiting for approval` },
  ].filter(Boolean)

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`} data-portal={portal.key}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Link to="/" className="brand" onClick={closeMobile}>
          <div className="brand-logo"><portal.icon size={19} /></div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">{instituteName}</div>
            <div className="brand-sub">{portal.name}</div>
          </div>
        </Link>
        <div className="side-search">
          <input placeholder="Search menu…" value={menuQ} onChange={(e) => setMenuQ(e.target.value)} aria-label="Search menu" />
          <span><Search size={16} /></span>
        </div>
        {user.role === 'parent' && <ChildSwitcher user={user} childId={childId} />}
        <nav className="nav">
          {matches ? (
            <div>
              <div className="nav-group">{matches.length} result{matches.length === 1 ? '' : 's'}</div>
              {matches.map((l) => <SideLink key={l.to} item={l} counts={counts} onNavigate={() => { setMenuQ(''); closeMobile() }} />)}
            </div>
          ) : menu.map((s) => (
            <div key={s.title}>
              <div className="nav-group">{s.title}</div>
              {s.items.map((item) => (item.children
                ? <SideGroup key={item.label} group={item} counts={counts} onNavigate={closeMobile} />
                : <SideLink key={item.to} item={item} counts={counts} onNavigate={closeMobile} />))}
            </div>
          ))}
        </nav>
      </aside>
      <div className={`backdrop ${open ? 'show' : ''}`} onClick={closeMobile} />
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon" onClick={toggleMenu} aria-label="Toggle menu"><Menu size={20} /></button>
          <div className="topbar-title hide-sm">{instituteName}</div>
          <span className="portal-pill hide-md">{portal.name}</span>
          {isStaff && (
            <button className="cmd-btn" onClick={() => setPalette(true)} title="Jump to any module (Ctrl+K)">
              <Gauge size={16} /> <span className="hide-sm">Command Center</span> <ChevronDown size={14} />
            </button>
          )}
          <div className="spacer" />
          {user.wings && isStaff && (
            <span className="badge badge-warn hide-md" title="You only see and manage these wings">{user.wings.map((w) => WING_LABEL[w]).join(' + ')} wing</span>
          )}
          <button className="btn btn-ghost btn-icon hide-sm" onClick={() => setPalette(true)} aria-label="Search modules" title="Search (Ctrl+K)"><Search size={19} /></button>
          {quick.length > 0 && (
            <Dropdown button={(toggle, open) => <button className="btn btn-ghost add-btn" onClick={toggle} aria-label="Quick add" aria-expanded={open}><span className="plus"><Plus size={14} /></span><ChevronDown size={14} /></button>}>
              {(close) => (
                <>
                  <div className="dd-head">Quick add</div>
                  {quick.map((q) => <button key={q.to} onClick={() => { close(); navigate(q.to) }}><q.icon size={16} /> {q.label}</button>)}
                </>
              )}
            </Dropdown>
          )}
          {isStaff && (
            <Dropdown width={300} button={(toggle, open) => (
              <button className="btn btn-ghost bell-btn" onClick={toggle} aria-label="Notifications" aria-expanded={open}>
                <Bell size={19} />{alerts.length > 0 && <span className="bell-count">{counts.leaves}</span>}
              </button>
            )}>
              {(close) => (
                <>
                  <div className="dd-head">Notifications</div>
                  {alerts.length
                    ? alerts.map((a) => <button key={a.to} onClick={() => { close(); navigate(a.to) }}><a.icon size={16} /> {a.text}</button>)
                    : <div className="muted small" style={{ padding: '10px 14px' }}>You're all caught up.</div>}
                  {can(user, 'notices') && <button className="dd-foot" onClick={() => { close(); navigate('/notices') }}>Open notice board →</button>}
                </>
              )}
            </Dropdown>
          )}
          <button className="btn btn-ghost btn-icon" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">{isDark ? <Sun size={19} /> : <Moon size={19} />}</button>
          {isStaff && <Link className="btn btn-ghost btn-icon hide-sm" to="/#hub" aria-label="All modules" title="All modules"><LayoutGrid size={19} /></Link>}
          <Dropdown button={(toggle, open) => (
            <button className="avatar-btn" onClick={toggle} aria-label="Account menu" aria-expanded={open}><span className="avatar">{initials(user.name)}</span></button>
          )}>
            {(close) => (
              <>
                <div className="dd-user">
                  <div style={{ fontWeight: 650 }}>{user.name}</div>
                  <div className="small muted">{ROLE_LABEL[user.role]}</div>
                </div>
                <button onClick={() => { close(); setPwd(true) }}><KeyRound size={16} /> Change password</button>
                <button onClick={logout} className="danger"><LogOut size={16} /> Log out</button>
              </>
            )}
          </Dropdown>
        </header>
        <main className="content">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {isStaff && can(user, 'assistant') && pathname !== '/assistant' && (
        <Link to="/assistant" className="ai-fab" aria-label="Ask the AI assistant" title="Ask the AI assistant"><Bot size={26} /></Link>
      )}
      {pwd && <PasswordModal onClose={() => setPwd(false)} />}
      {palette && <CommandPalette links={links} onClose={() => setPalette(false)} />}
    </div>
  )
}
