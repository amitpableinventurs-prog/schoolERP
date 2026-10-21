import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, CheckCircle2, Copy, Crown, Download, Globe, KeyRound, LogOut, Monitor, Plus, RefreshCw, ShieldOff, XCircle } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDate, fmtDateTime, timeAgo } from '../../lib/format.js'
import { ALL_MODULES, PLATFORM_MODULES, moduleLabel } from '../../../shared/modules.js'
import { Async, Badge, Empty, Field, Loading, Modal, PageHead, StatTile, useAction, useApi, useToast } from '../../components/ui.jsx'

// Owner console (/owner): the provider's control panel over every client institute.
export default function OwnerApp() {
  const [state, setState] = useState({ loading: true, owner: null })
  const refresh = () => api.get('/platform/me').then((d) => setState({ loading: false, owner: d.owner }), () => setState({ loading: false, owner: null }))
  useEffect(() => { refresh() }, [])
  if (state.loading) return <Loading text="Opening owner console…" />
  if (!state.owner) return <OwnerLogin onDone={refresh} />
  const logout = async () => { await api.post('/platform/logout'); setState({ loading: false, owner: null }) }
  return (
    <div className="owner-shell" data-portal="superadmin">
      <header className="owner-top">
        <Link to="/owner" className="row" style={{ gap: 10 }}>
          <span className="auth-logo"><Crown size={18} /></span>
          <div><strong>Owner Console</strong><div className="small muted">Smart Campus platform</div></div>
        </Link>
        <div className="spacer" />
        <span className="small muted hide-sm">{state.owner.email}</span>
        <button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={15} /> Log out</button>
      </header>
      <main className="owner-main">
        <Routes>
          <Route index element={<OwnerHome />} />
          <Route path=":id" element={<OwnerTenant />} />
          <Route path="*" element={<Navigate to="/owner" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function OwnerLogin({ onDone }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/platform/login', form)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="auth-form" style={{ minHeight: '100vh' }} data-portal="superadmin">
      <form className="card card-pad auth-card stack" onSubmit={submit}>
        <div className="auth-card-icon"><Crown size={22} /></div>
        <div>
          <h1>Owner Console</h1>
          <p className="text-2" style={{ marginTop: 4 }}>Manage every client institute, domain and desktop licence.</p>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="username" required autoFocus /></Field>
        <Field label="Password"><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" required /></Field>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

function ModuleChecks({ value, onChange, allowed = ALL_MODULES }) {
  const set = new Set(value)
  const toggle = (key) => onChange(PLATFORM_MODULES.map((m) => m.key).filter((k) => (k === key ? !set.has(k) : set.has(k))))
  return (
    <div className="module-checks">
      <div className="small muted full">Always included: dashboard, students, classes, staff, notices, settings, admins, activity log.</div>
      {PLATFORM_MODULES.filter((m) => allowed.includes(m.key)).map((m) => (
        <label key={m.key} className="check module-check">
          <input type="checkbox" checked={set.has(m.key)} onChange={() => toggle(m.key)} />
          <span><strong>{m.label}</strong><em className="hint">{m.desc}</em></span>
        </label>
      ))}
    </div>
  )
}

function statusOf(t) {
  if (t.status === 'suspended') return <Badge tone="bad">Suspended</Badge>
  if (t.expiresAt && new Date(t.expiresAt) < new Date()) return <Badge tone="bad">Expired</Badge>
  if (t.expiresAt && new Date(t.expiresAt) - Date.now() < 15 * 86_400_000) return <Badge tone="warn">Renew by {fmtDate(t.expiresAt)}</Badge>
  return <Badge tone="good">Active</Badge>
}

function OwnerHome() {
  const overview = useApi('/platform/overview')
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  return (
    <>
      <PageHead title="Client institutes" subtitle="Every client runs on your central server with its own database. Give each one a web address, choose its modules and issue desktop licences.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New institute</button>
      </PageHead>
      <Async state={overview}>{(d) => {
        const total = d.tenants.reduce((a, t) => ({ students: a.students + (t.stats?.students || 0), installs: a.installs + t.installations.active }), { students: 0, installs: 0 })
        return (
          <>
            <div className="grid grid-4 mb">
              <StatTile icon={Building2} label="Institutes" value={d.tenants.length} foot={`${d.tenants.filter((t) => !t.block).length} active`} />
              <StatTile icon={Globe} label="Custom domains" value={d.tenants.reduce((n, t) => n + t.domains.length, 0)} foot={`plus *.${d.platform.domain}`} />
              <StatTile icon={Monitor} label="Desktop installs" value={total.installs} foot="active licences" />
              <StatTile icon={Download} label="Installer" value={d.platform.installer ? 'Ready' : 'Not built'} foot={d.platform.installer ? `${(d.platform.installer.size / 1048576).toFixed(0)} MB · ${fmtDate(d.platform.installer.builtAt)}` : 'npm run desktop:build'} tone={d.platform.installer ? 'good' : 'warn'} />
            </div>
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Institute</th><th>Web address</th><th>Modules</th><th>Status</th><th className="num">Students</th><th className="num">Desktops</th><th>Last activity</th><th /></tr></thead>
                  <tbody>{d.tenants.map((t) => (
                    <tr key={t._id} className="clickable" onClick={() => navigate(`/owner/${t._id}`)}>
                      <td><div className="cell-title">{t.name} {t.isMain && <Badge tone="ai">Main</Badge>}</div><div className="cell-sub">{t.code} · {t.dbName}</div></td>
                      <td className="small">{t.urls.slice(0, 2).map((u) => <div key={u}>{u.replace(/^https?:\/\//, '')}</div>)}{t.urls.length > 2 && <div className="muted">+{t.urls.length - 2} more</div>}</td>
                      <td className="small">{t.modules.length === ALL_MODULES.length ? <Badge tone="good">All</Badge> : `${t.modules.length} of ${ALL_MODULES.length}`}</td>
                      <td>{statusOf(t)}</td>
                      <td className="num">{t.stats?.students ?? '—'}</td>
                      <td className="num">{t.installations.active}</td>
                      <td className="small text-2">{t.stats?.lastActivityAt ? timeAgo(t.stats.lastActivityAt) : '—'}</td>
                      <td><Link className="btn btn-sm" to={`/owner/${t._id}`}>Manage</Link></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>
        )
      }}</Async>
      {creating && <NewTenant onClose={() => setCreating(false)} onSaved={(t) => navigate(`/owner/${t._id}`)} />}
    </>
  )
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)

function NewTenant({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', code: '', domains: '', adminName: 'Super Admin', adminEmail: '', adminPassword: '', expiresAt: '', modules: [...ALL_MODULES], demo: false })
  const [codeTouched, setCodeTouched] = useState(false)
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const submit = (e) => {
    e.preventDefault()
    run(async () => onSaved(await api.post('/platform/tenants', form)), 'Institute created')
  }
  return (
    <Modal title="New client institute" onClose={onClose} size="lg" footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="new-tenant" disabled={busy}>{busy ? 'Creating…' : 'Create institute'}</button></>}>
      <form id="new-tenant" className="form-grid" onSubmit={submit}>
        <Field label="Institute name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, code: codeTouched ? form.code : slug(e.target.value) })} required autoFocus /></Field>
        <Field label="Code" hint="Used in its address and database name"><input className="input" value={form.code} onChange={(e) => { setCodeTouched(true); setForm({ ...form, code: slug(e.target.value) }) }} required /></Field>
        <Field label="Custom domain(s)" hint="Optional, e.g. erp.clientschool.com - can be added later" full><input className="input" value={form.domains} onChange={set('domains')} placeholder="erp.clientschool.com" /></Field>
        <Field label="Super admin name"><input className="input" value={form.adminName} onChange={set('adminName')} /></Field>
        <Field label="Super admin email" hint="The institute owner logs in with this"><input className="input" type="email" value={form.adminEmail} onChange={set('adminEmail')} required /></Field>
        <Field label="Super admin password"><input className="input" value={form.adminPassword} onChange={set('adminPassword')} minLength={6} required /></Field>
        <Field label="Subscription ends" hint="Empty = no end date"><input className="input" type="date" value={form.expiresAt} onChange={set('expiresAt')} /></Field>
        <Field label="Modules" full><ModuleChecks value={form.modules} onChange={(modules) => setForm({ ...form, modules })} /></Field>
        <label className="check full"><input type="checkbox" checked={form.demo} onChange={set('demo')} /> Fill with demo data (for a trial / demo account)</label>
      </form>
    </Modal>
  )
}

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')

function OwnerTenant() {
  const { id } = useParams()
  const detail = useApi(`/platform/tenants/${id}`)
  return (
    <>
      <Link to="/owner" className="btn btn-ghost btn-sm mb"><ArrowLeft size={15} /> All institutes</Link>
      <Async state={detail}>{(d) => (
        <>
          <PageHead title={<span className="row" style={{ gap: 10 }}>{d.tenant.name} {statusOf(d.tenant)}</span>} subtitle={`Code ${d.tenant.code} · database ${d.tenant.dbName} · ${d.stats ? `${d.stats.students} students, ${d.stats.staff} staff, ${d.stats.users} staff logins` : ''}`} />
          {d.tenant.block && <div className="alert alert-error mb">{d.tenant.block}</div>}
          <div className="grid grid-2 mb" style={{ alignItems: 'start' }}>
            <TenantSettings key={detail.version} tenant={d.tenant} onSaved={detail.reload} />
            <div className="stack">
              <Domains key={`d${detail.version}`} tenant={d.tenant} platform={d.platform} onSaved={detail.reload} />
              <SuperAdmin tenant={d.tenant} admins={d.superAdmins} />
            </div>
          </div>
          <Installations tenant={d.tenant} rows={d.installations} platform={d.platform} onChange={detail.reload} />
        </>
      )}</Async>
    </>
  )
}

function TenantSettings({ tenant, onSaved }) {
  const [form, setForm] = useState({
    name: tenant.name, status: tenant.status, expiresAt: toDateInput(tenant.expiresAt), offlineGraceDays: tenant.offlineGraceDays ?? '',
    maxInstallations: tenant.maxInstallations ?? '', modules: tenant.modules, notes: tenant.notes || '',
    contact: { name: tenant.contact?.name || '', phone: tenant.contact?.phone || '', email: tenant.contact?.email || '' },
  })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const setContact = (k) => (e) => setForm({ ...form, contact: { ...form.contact, [k]: e.target.value } })
  const save = (e) => {
    e.preventDefault()
    run(async () => { await api.put(`/platform/tenants/${tenant._id}`, form); onSaved() }, 'Saved')
  }
  return (
    <form className="card card-pad stack" onSubmit={save}>
      <h2>Plan & subscription</h2>
      <div className="form-grid">
        <Field label="Institute name"><input className="input" value={form.name} onChange={set('name')} required /></Field>
        <Field label="Status">
          <select className="select" value={form.status} onChange={set('status')} disabled={tenant.isMain}>
            <option value="active">Active</option>
            <option value="suspended">Suspended (blocks web + desktop)</option>
          </select>
        </Field>
        <Field label="Subscription ends" hint="Empty = no end date"><input className="input" type="date" value={form.expiresAt} onChange={set('expiresAt')} /></Field>
        <Field label="Offline days allowed" hint="Desktop locks after this many days without internet (default 15)"><input className="input" type="number" min="1" max="365" value={form.offlineGraceDays} onChange={set('offlineGraceDays')} /></Field>
        <Field label="Max desktop installs" hint="Empty = no limit"><input className="input" type="number" min="1" value={form.maxInstallations} onChange={set('maxInstallations')} /></Field>
        <Field label="Contact person"><input className="input" value={form.contact.name} onChange={setContact('name')} /></Field>
        <Field label="Contact phone"><input className="input" value={form.contact.phone} onChange={setContact('phone')} /></Field>
        <Field label="Contact email"><input className="input" type="email" value={form.contact.email} onChange={setContact('email')} /></Field>
        <Field label="Modules" full><ModuleChecks value={form.modules} onChange={(modules) => setForm({ ...form, modules })} /></Field>
        <Field label="Notes" full><textarea className="input" rows={2} value={form.notes} onChange={set('notes')} /></Field>
      </div>
      <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  )
}

function Domains({ tenant, platform, onSaved }) {
  const [domains, setDomains] = useState(tenant.domains.join('\n'))
  const [dns, setDns] = useState(null)
  const [run, busy] = useAction()
  const save = () => run(async () => { await api.put(`/platform/tenants/${tenant._id}`, { domains: domains.split(/[\s,]+/).filter(Boolean) }); onSaved() }, 'Domains saved')
  const check = () => run(async () => setDns(await api.get(`/platform/tenants/${tenant._id}/dns`)))
  return (
    <div className="card card-pad stack">
      <h2 className="row"><Globe size={17} /> Web addresses</h2>
      <div className="small stack" style={{ gap: 4 }}>
        {tenant.urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className="mono">{u}</a>)}
      </div>
      <Field label="Client's own domains (one per line)" hint="The client points the domain to your server; you keep full control here.">
        <textarea className="input mono" rows={2} value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="erp.clientschool.com" />
      </Field>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-sm btn-primary" onClick={save} disabled={busy}>Save domains</button>
        <button className="btn btn-sm" onClick={check} disabled={busy || !tenant.domains.length}><RefreshCw size={14} /> Check DNS</button>
      </div>
      <div className="alert alert-info small">
        <strong>DNS setting at the client's domain provider (GoDaddy, Hostinger…):</strong>
        <div>• Subdomain like <span className="mono">erp.clientschool.com</span>: add a <strong>CNAME</strong> record, name <span className="mono">erp</span>, value <span className="mono">{platform.cnameTarget || 'your-server-domain (set PLATFORM_CNAME_TARGET)'}</span></div>
        <div>• Main domain like <span className="mono">clientschool.com</span>: add an <strong>A</strong> record, name <span className="mono">@</span>, value <span className="mono">{platform.serverIp || 'your server IP (set SERVER_IP)'}</span></div>
        <div>HTTPS certificates are issued automatically by Caddy once DNS points here.</div>
      </div>
      {dns && (
        <div className="stack small" style={{ gap: 6 }}>
          {dns.results.map((r) => (
            <div key={r.domain} className="row" style={{ gap: 8 }}>
              {r.ok ? <CheckCircle2 size={16} color="var(--good)" /> : <XCircle size={16} color="var(--bad)" />}
              <span className="mono">{r.domain}</span>
              <span className="muted">{r.ok ? `points here (${r.how})` : `not pointing here yet${r.cname.length ? ` - CNAME ${r.cname.join(', ')}` : ''}${r.a.length ? ` - A ${r.a.join(', ')}` : ''}${!r.cname.length && !r.a.length ? ' - no DNS record found' : ''}`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SuperAdmin({ tenant, admins }) {
  const [password, setPassword] = useState('')
  const [run, busy] = useAction()
  const reset = (e) => {
    e.preventDefault()
    run(async () => { const r = await api.post(`/platform/tenants/${tenant._id}/admin-password`, { password }); setPassword(''); return r }, 'Super admin password changed')
  }
  return (
    <form className="card card-pad stack" onSubmit={reset}>
      <h2 className="row"><KeyRound size={17} /> Institute super admin</h2>
      {admins.length ? admins.map((a) => (
        <div key={a._id} className="small"><strong>{a.name}</strong> · <span className="mono">{a.loginId}</span> · last login {a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'never'}</div>
      )) : <div className="small muted">No super admin yet.</div>}
      <div className="row" style={{ gap: 8 }}>
        <input className="input" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required style={{ maxWidth: 220 }} />
        <button className="btn btn-sm" disabled={busy}>Reset password</button>
      </div>
    </form>
  )
}

function Installations({ tenant, rows, platform, onChange }) {
  const [form, setForm] = useState(null) // { inst } to edit, {} to create
  const [run, busy] = useAction()
  const toast = useToast()
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`) } catch { toast(text) }
  }
  const update = (inst, body, message) => run(async () => { await api.put(`/platform/installations/${inst._id}`, body); onChange() }, message)
  const resetDevice = (inst) => run(async () => { await api.post(`/platform/installations/${inst._id}/reset-device`); onChange() }, 'The key can now be activated on another computer')
  return (
    <div className="card">
      <div className="card-pad row between">
        <div>
          <h2 className="row"><Monitor size={17} /> Desktop app (Windows .exe)</h2>
          <p className="small text-2" style={{ marginTop: 4 }}>Each installation gets its own key and modules. Send the download link: the installer puts a desktop shortcut and activates itself. It works offline and syncs with your server.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} /> New installation</button>
      </div>
      {!platform.installer && <div className="alert mb" style={{ margin: '0 16px 16px' }}>The installer is not built yet. Run <span className="mono">npm run desktop:build</span> on your machine, then the download links work.</div>}
      {rows.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Installation</th><th>Activation key</th><th>Modules</th><th>Computer</th><th>Last sync</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((i) => (
              <tr key={i._id}>
                <td><div className="cell-title">{i.label}</div><div className="cell-sub">Device {i.deviceCode}</div></td>
                <td><span className="mono">{i.key}</span> <button className="btn btn-ghost btn-sm btn-icon" title="Copy key" onClick={() => copy(i.key, 'Key')}><Copy size={13} /></button></td>
                <td className="small">{i.modules?.length ? i.effectiveModules.map(moduleLabel).join(', ') : <Badge tone="good">All of the institute's</Badge>}</td>
                <td className="small">{i.machineId ? <><div>{i.deviceName || 'Activated'}</div><div className="muted">since {fmtDate(i.activatedAt)}{i.appVersion ? ` · v${i.appVersion}` : ''}</div></> : <span className="muted">Not activated yet</span>}</td>
                <td className="small">
                  {i.lastSeenAt ? timeAgo(i.lastSeenAt) : '—'}
                  {i.sync?.conflicts?.length > 0 && <div><Badge tone="warn" title={i.sync.conflicts.slice(0, 5).map((c) => `${c.model}: ${c.reason}`).join('\n')}>{i.sync.conflicts.length} conflicts</Badge></div>}
                </td>
                <td>{i.status === 'active' ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Revoked</Badge>}</td>
                <td className="nowrap">
                  <button className="btn btn-sm" title="Copy download link" onClick={() => copy(i.downloadUrl, 'Download link')} disabled={!platform.installer}><Download size={14} /> Link</button>{' '}
                  <button className="btn btn-sm btn-ghost" onClick={() => setForm({ inst: i })}>Modules</button>
                  {i.machineId && <button className="btn btn-sm btn-ghost" onClick={() => resetDevice(i)} disabled={busy} title="Allow activation on a different computer">Move</button>}
                  {i.status === 'active'
                    ? <button className="btn btn-sm btn-ghost" onClick={() => update(i, { status: 'revoked' }, 'Installation revoked - it locks at its next sync')} disabled={busy} title="Revoke"><ShieldOff size={14} /></button>
                    : <button className="btn btn-sm btn-ghost" onClick={() => update(i, { status: 'active' }, 'Installation active again')} disabled={busy}>Restore</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty text="No desktop installations yet." />}
      {form && <InstallationForm tenant={tenant} inst={form.inst} onClose={() => setForm(null)} onSaved={() => { setForm(null); onChange() }} />}
    </div>
  )
}

function InstallationForm({ tenant, inst, onClose, onSaved }) {
  const [label, setLabel] = useState(inst?.label || '')
  const [limit, setLimit] = useState(Boolean(inst?.modules?.length))
  const [modules, setModules] = useState(inst?.modules?.length ? inst.modules : tenant.modules)
  const [run, busy] = useAction()
  const submit = (e) => {
    e.preventDefault()
    const body = { label, modules: limit ? modules : [] }
    run(async () => {
      if (inst) await api.put(`/platform/installations/${inst._id}`, body)
      else await api.post(`/platform/tenants/${tenant._id}/installations`, body)
      onSaved()
    }, inst ? 'Installation updated - applies at its next sync' : 'Installation created - copy its download link')
  }
  return (
    <Modal title={inst ? `Edit ${inst.label}` : 'New desktop installation'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="inst-form" disabled={busy}>{inst ? 'Save' : 'Create key'}</button></>}>
      <form id="inst-form" className="stack" onSubmit={submit}>
        <Field label="Name" hint='Which computer / who uses it, e.g. "Accounts PC" or "Principal laptop"'><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} required autoFocus /></Field>
        <label className="check"><input type="checkbox" checked={limit} onChange={(e) => setLimit(e.target.checked)} /> Give this computer only some modules</label>
        {limit && <ModuleChecks value={modules} onChange={setModules} allowed={tenant.modules} />}
        {!limit && <div className="small muted">This computer gets all modules of {tenant.name}.</div>}
      </form>
    </Modal>
  )
}
