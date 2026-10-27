import { useState } from 'react'
import { CalendarClock, Copy, Download, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { daysLeft, PLAN_LABEL } from '../lib/keys.js'
import { fmtDate, timeAgo } from '../lib/format.js'
import { ALL_MODULES, PLATFORM_MODULES, moduleLabel } from '../../shared/modules.js'
import { Badge, Empty, Field, Modal, useAction, useToast } from './ui.jsx'

export function ModuleChecks({ value, onChange, allowed = ALL_MODULES }) {
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

const toDateInput = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60_000).toISOString().slice(0, 10) : '')

// Plan, end date and how long is left.
export function KeyValidity({ inst }) {
  const left = daysLeft(inst)
  if (left == null) return <Badge tone="good">No expiry</Badge>
  return (
    <div className="small">
      <div>{PLAN_LABEL[inst.plan] || 'Plan'} · till <strong>{fmtDate(inst.expiresAt)}</strong></div>
      {left <= 0 ? <Badge tone="bad">Expired</Badge> : left <= 7 ? <Badge tone="warn">{left} day{left === 1 ? '' : 's'} left</Badge> : <span className="muted">{left} days left</span>}
    </div>
  )
}

// Desktop app keys of one institute: used by the owner console and the institute's super admin.
// `urls.create` adds a key, `urls.item(id)` edits one.
export function DesktopKeyTable({ rows, urls, installer, onChange, onEdit }) {
  const [run, busy] = useAction()
  const toast = useToast()
  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`) } catch { toast(text) }
  }
  const update = (inst, body, message) => run(async () => { await api.put(urls.item(inst._id), body); onChange() }, message)
  const deactivate = (inst) => window.confirm(`Deactivate "${inst.label}"? ${inst.machineId ? 'That computer locks at its next sync and stays locked until you activate the key again.' : 'The key cannot be activated until you activate it again.'}`)
    && update(inst, { status: 'revoked' }, 'Key deactivated - the computer locks at its next sync')
  const move = (inst) => window.confirm(`Free "${inst.label}" for another computer? ${inst.deviceName || 'The current computer'} stops syncing.`)
    && run(async () => { await api.post(`${urls.item(inst._id)}/reset-device`); onChange() }, 'The key can now be activated on another computer')
  const remove = (inst) => window.confirm(`Delete the key of "${inst.label}" (${inst.key})? This cannot be undone.${inst.machineId && inst.status === 'active' ? ` ${inst.deviceName || 'That computer'} locks at its next sync and needs a new key.` : ''}`)
    && run(async () => { await api.del(urls.item(inst._id)); onChange() }, 'Key deleted')
  const renew = (inst) => window.confirm(`Renew "${inst.label}" for one more ${inst.plan === 'yearly' ? 'year' : 'month'}?`)
    && run(async () => { await api.post(`${urls.item(inst._id)}/renew`); onChange() }, 'Renewed - the computer opens at its next sync if it was locked')

  if (!rows.length) return <Empty text="No desktop app keys yet." />
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Computer name</th><th>Activation key</th><th>Modules</th><th>Plan / validity</th><th>Activated on</th><th>Last sync</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map((i) => (
          <tr key={i._id}>
            <td><div className="cell-title">{i.label}</div><div className="cell-sub">Device {i.deviceCode}</div></td>
            <td className="nowrap"><span className="mono">{i.key}</span> <button className="btn btn-ghost btn-sm btn-icon" title="Copy key" onClick={() => copy(i.key, 'Key')}><Copy size={13} /></button></td>
            <td className="small">{i.modules?.length ? i.effectiveModules.map(moduleLabel).join(', ') : <Badge tone="good">All of the institute's</Badge>}</td>
            <td><KeyValidity inst={i} /></td>
            <td className="small">{i.machineId ? <><div>{i.deviceName || 'Activated'}</div><div className="muted">since {fmtDate(i.activatedAt)}{i.appVersion ? ` · v${i.appVersion}` : ''}</div></> : <span className="muted">Not activated yet</span>}</td>
            <td className="small">
              {i.lastSeenAt ? timeAgo(i.lastSeenAt) : '—'}
              {i.sync?.conflicts?.length > 0 && <div><Badge tone="warn" title={i.sync.conflicts.slice(0, 5).map((c) => `${c.model}: ${c.reason}`).join('\n')}>{i.sync.conflicts.length} conflicts</Badge></div>}
            </td>
            <td>{i.status === 'active' ? <Badge tone="good">Active</Badge> : <Badge tone="bad">Deactivated</Badge>}</td>
            <td className="nowrap">
              <button className="btn btn-sm" title={installer ? 'Copy download link (the installer activates itself)' : 'The installer is not built yet'} onClick={() => copy(i.downloadUrl, 'Download link')} disabled={!installer || i.status !== 'active'}><Download size={14} /> Link</button>{' '}
              {['monthly', 'yearly'].includes(i.plan) && <button className={`btn btn-sm${daysLeft(i) <= 7 ? ' btn-primary' : ' btn-ghost'}`} onClick={() => renew(i)} disabled={busy} title={`Add one ${i.plan === 'yearly' ? 'year' : 'month'}`}><CalendarClock size={14} /> Renew</button>}
              <button className="btn btn-sm btn-ghost" onClick={() => onEdit(i)}>Edit</button>
              {i.machineId && i.status === 'active' && <button className="btn btn-sm btn-ghost" onClick={() => move(i)} disabled={busy} title="Allow activation on a different computer">Move</button>}
              {i.status === 'active'
                ? <button className="btn btn-sm btn-ghost btn-danger" onClick={() => deactivate(i)} disabled={busy} title="Deactivate"><ShieldOff size={14} /> Deactivate</button>
                : <button className="btn btn-sm btn-ghost" onClick={() => update(i, { status: 'active' }, 'Key active again - the computer opens at its next sync')} disabled={busy}><ShieldCheck size={14} /> Activate</button>}
              <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => remove(i)} disabled={busy} title="Delete key" aria-label="Delete key"><Trash2 size={14} /></button>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

export function DesktopKeyForm({ inst, modules, instituteName, urls, onClose, onSaved }) {
  const allowed = modules || ALL_MODULES
  const [label, setLabel] = useState(inst?.label || '')
  const [limit, setLimit] = useState(Boolean(inst?.modules?.length))
  const [picked, setPicked] = useState(inst?.modules?.length ? inst.modules : allowed)
  const [plan, setPlan] = useState(inst ? inst.plan || 'none' : 'yearly')
  const [until, setUntil] = useState(toDateInput(inst?.expiresAt))
  const [run, busy] = useAction()
  const preview = (() => {
    if (inst && inst.plan === plan && plan !== 'custom') return inst.expiresAt ? `Stays till ${fmtDate(inst.expiresAt)} - use Renew to extend.` : null
    if (plan === 'monthly' || plan === 'yearly') { const d = new Date(); d.setMonth(d.getMonth() + (plan === 'yearly' ? 12 : 1)); return `Valid till ${fmtDate(d)}, then the computer locks until it is renewed.` }
    return plan === 'none' ? 'The key never expires.' : null
  })()
  const submit = (e) => {
    e.preventDefault()
    const body = { label, modules: limit ? picked : [], plan, ...(plan === 'custom' ? { expiresAt: until } : {}) }
    run(async () => {
      if (inst) await api.put(urls.item(inst._id), body)
      else await api.post(urls.create, body)
      onSaved()
    }, inst ? 'Saved - applies at its next sync' : 'Key created - copy it or its download link')
  }
  return (
    <Modal title={inst ? `Edit ${inst.label}` : 'New desktop app key'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="inst-form" disabled={busy}>{inst ? 'Save' : 'Create key'}</button></>}>
      <form id="inst-form" className="stack" onSubmit={submit}>
        <Field label="Computer name" hint='Which computer / who uses it, e.g. "Accounts PC" or "Principal laptop"'><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} required autoFocus /></Field>
        <Field label="Plan / validity" hint={preview}>
          <select className="select" value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="monthly">Monthly (1 month, renew every month)</option>
            <option value="yearly">Yearly (1 year, renew every year)</option>
            <option value="custom">Till a fixed date</option>
            <option value="none">No expiry</option>
          </select>
        </Field>
        {plan === 'custom' && <Field label="Expires on"><input className="input" type="date" value={until} min={toDateInput(new Date())} onChange={(e) => setUntil(e.target.value)} required /></Field>}
        <label className="check"><input type="checkbox" checked={limit} onChange={(e) => setLimit(e.target.checked)} /> Give this computer only some modules</label>
        {limit && <ModuleChecks value={picked} onChange={setPicked} allowed={allowed} />}
        {!limit && <div className="small muted">This computer gets all modules of {instituteName}.</div>}
      </form>
    </Modal>
  )
}
