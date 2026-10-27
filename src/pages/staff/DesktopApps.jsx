import { useState } from 'react'
import { CalendarClock, Cloud, CloudOff, KeyRound, Monitor, Plus, ShieldCheck, Timer } from 'lucide-react'
import { useAuth } from '../../lib/auth.jsx'
import { fmtDate, fmtDateTime, timeAgo } from '../../lib/format.js'
import { moduleLabel } from '../../../shared/modules.js'
import { DesktopKeyForm, DesktopKeyTable } from '../../components/DesktopKeys.jsx'
import { daysLeft } from '../../lib/keys.js'
import { Async, Badge, PageHead, StatTile, useApi } from '../../components/ui.jsx'

const URLS = { create: '/desktop-apps', item: (id) => `/desktop-apps/${id}` }

// Super admin: activation keys of the institute's Windows desktop (offline) apps.
// In the desktop app itself the keys cannot be changed - it shows its own licence.
export default function DesktopApps() {
  const { desktop } = useAuth()
  return desktop ? <ThisComputer /> : <KeysOnline />
}

function KeysOnline() {
  const { institute } = useAuth()
  const data = useApi('/desktop-apps')
  const [form, setForm] = useState(null) // { inst } to edit, {} to create
  return (
    <>
      <PageHead title="Desktop Apps (Windows)" subtitle="Create an activation key for each computer that runs the offline Windows app, with a monthly, yearly or fixed-date plan. An expired or deactivated key locks that computer; Renew or Activate unlocks it at its next sync.">
        <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} /> New key</button>
      </PageHead>
      <Async state={data}>{(d) => {
        const activated = d.installations.filter((i) => i.machineId && i.status === 'active').length
        const full = d.limit && d.active >= d.limit
        const live = d.installations.filter((i) => i.status === 'active')
        const expired = live.filter((i) => daysLeft(i) != null && daysLeft(i) <= 0).length
        const soon = live.filter((i) => daysLeft(i) > 0 && daysLeft(i) <= 7).length
        return (
          <>
            <div className="grid grid-4 mb">
              <StatTile icon={KeyRound} label="Active keys" value={d.limit ? `${d.active} / ${d.limit}` : d.active} foot={d.limit ? (full ? 'Limit reached - deactivate one or ask your service provider' : `${d.limit - d.active} more allowed`) : 'No limit'} tone={full ? 'bad' : undefined} />
              <StatTile icon={Monitor} label="Computers activated" value={activated} foot={`${d.installations.length - activated} key(s) not in use`} />
              <StatTile icon={CalendarClock} label="Expired / expiring" value={`${expired} / ${soon}`} foot={expired ? 'Expired keys are locked - Renew them' : 'Expiring = within 7 days'} tone={expired ? 'bad' : undefined} />
              <StatTile icon={Timer} label="Works offline for" value={`${d.offlineDays} days`} foot="Then it needs internet once to sync" />
            </div>

            <div className="card card-pad mb stack">
              <h2 className="row"><ShieldCheck size={17} /> How to activate a computer</h2>
              <ol className="small text-2" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>Click <strong>New key</strong> and give the computer a name.</li>
                <li>{d.installer ? <>Copy the <strong>Link</strong> and open it on that computer - the installer activates itself. Or install the app and type the key.</> : <>Install the Windows app on that computer and type the key on its first start.</>}</li>
                <li>If it asks for the server address, enter <span className="mono">{d.serverUrl}</span>. Internet is needed only for this first activation.</li>
              </ol>
            </div>

            <div className="card">
              <DesktopKeyTable rows={d.installations} urls={URLS} installer={d.installer} onChange={data.reload} onEdit={(inst) => setForm({ inst })} />
            </div>

            {form && (
              <DesktopKeyForm
                inst={form.inst}
                modules={d.modules}
                instituteName={institute?.instituteName || 'the institute'}
                urls={URLS}
                onClose={() => setForm(null)}
                onSaved={() => { setForm(null); data.reload() }}
              />
            )}
          </>
        )
      }}</Async>
    </>
  )
}

function ThisComputer() {
  const status = useApi('/desktop/status')
  return (
    <>
      <PageHead title="Desktop App Licence" subtitle="This computer's activation. Keys are created, deactivated and moved to another computer online, on the institute website (Super Admin → Desktop Apps)." />
      <Async state={status}>{(s) => (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card card-pad stack">
            <h2 className="row"><KeyRound size={17} /> This computer</h2>
            {s.license ? (
              <table className="table">
                <tbody>
                  <tr><th>Institute</th><td>{s.license.institute}</td></tr>
                  <tr><th>Computer name</th><td>{s.license.label} <span className="muted">(device {s.license.deviceCode})</span></td></tr>
                  <tr><th>Modules</th><td className="small">{s.license.modules.map(moduleLabel).join(', ')}</td></tr>
                  <tr><th>Key valid till</th><td>{s.license.keyExpiresAt ? <>{fmtDate(s.license.keyExpiresAt)} {daysLeft({ expiresAt: s.license.keyExpiresAt }) <= 7 && <Badge tone="warn">Renew soon</Badge>}</> : 'No expiry'}</td></tr>
                  <tr><th>Works offline until</th><td>{fmtDate(s.license.validUntil)} <span className="muted small">(renews at every sync)</span></td></tr>
                  <tr><th>Status</th><td>{s.locked ? <Badge tone="bad">Locked</Badge> : <Badge tone="good">Active</Badge>}</td></tr>
                </tbody>
              </table>
            ) : <p className="muted">This app is not activated.</p>}
            {s.locked && <div className="alert alert-error">{s.locked}</div>}
          </div>
          <div className="card card-pad stack">
            <h2 className="row">{s.online ? <Cloud size={17} /> : <CloudOff size={17} />} Sync with the server</h2>
            <div className="row" style={{ gap: 8 }}>{s.online ? <Badge tone="good">Online</Badge> : <Badge tone="warn">Offline</Badge>}<span className="small muted">{s.lastSyncAt ? `Last sync ${timeAgo(s.lastSyncAt)} (${fmtDateTime(s.lastSyncAt)})` : 'Not synced yet'}</span></div>
            <div className="small text-2">Server: <span className="mono">{s.centralUrl}</span></div>
            {s.lastError && <div className="small muted">{s.lastError}</div>}
          </div>
        </div>
      )}</Async>
    </>
  )
}
