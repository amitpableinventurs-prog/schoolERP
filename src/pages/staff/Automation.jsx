import { useState } from 'react'
import { Bell, CheckCheck, Play, Save, SkipForward, Zap } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { useAuth } from '../../lib/auth.jsx'
import { fmtDateTime, waLink } from '../../lib/format.js'
import { Async, Badge, Empty, Field, PageHead, Segmented, StatusBadge, Tabs, useAction, useApi, WhatsAppIcon } from '../../components/ui.jsx'

const RULE_LABEL = {
  fee_reminder: 'Fee reminder', absent_alert: 'Absent alert', low_attendance: 'Low attendance', lead_followup: 'Lead follow-up',
  birthday_wish: 'Birthday', exam_result: 'Exam result', test_result: 'Test score', assignment_due: 'Assignment due',
}
const PLACEHOLDERS = {
  fee_reminder: '{guardian} {student} {installment} {amount} {dueText} {institute}',
  absent_alert: '{guardian} {student} {date} {batch} {institute}',
  low_attendance: '{guardian} {student} {pct} {threshold} {institute}',
  lead_followup: '{name} {course} {institute}',
  birthday_wish: '{student} {institute}',
  exam_result: '{guardian} {student} {percent} {grade} {rank} {exam} {institute}',
  test_result: '{guardian} {student} {score} {total} {test} {institute}',
  assignment_due: '{guardian} {student} {assignment} {subject} {due} {institute}',
}

function RuleCard({ rule, admin, onChanged }) {
  const [form, setForm] = useState({ enabled: rule.enabled, hour: rule.hour, config: rule.config })
  const [run, busy] = useAction()
  const dirty = JSON.stringify(form) !== JSON.stringify({ enabled: rule.enabled, hour: rule.hour, config: rule.config })
  const setConfig = (k, v) => setForm({ ...form, config: { ...form.config, [k]: v } })

  return (
    <div className="card card-pad stack">
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="row"><Zap size={16} /> {rule.name}</h2>
          <p className="small text-2" style={{ marginTop: 4 }}>{rule.description}</p>
        </div>
        <label className="check" title={admin ? '' : 'Only admins can change rules'}>
          <input type="checkbox" checked={form.enabled} disabled={!admin} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> {form.enabled ? 'On' : 'Off'}
        </label>
      </div>
      <Field label="Message template" hint={`Placeholders: ${PLACEHOLDERS[rule.key] || ''}`}>
        <textarea className="textarea small" value={form.config.template || ''} disabled={!admin} onChange={(e) => setConfig('template', e.target.value)} style={{ minHeight: 70 }} />
      </Field>
      <div className="row">
        <Field label="Runs daily after">
          <select className="select" value={form.hour} disabled={!admin} onChange={(e) => setForm({ ...form, hour: Number(e.target.value) })}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
          </select>
        </Field>
        {rule.key === 'fee_reminder' && <>
          <Field label="Days before due"><input className="input" type="number" min="0" value={form.config.daysBefore ?? 3} disabled={!admin} onChange={(e) => setConfig('daysBefore', Number(e.target.value))} style={{ width: 90 }} /></Field>
          <Field label="Repeat overdue every (days)"><input className="input" type="number" min="1" value={form.config.repeatEveryDays ?? 3} disabled={!admin} onChange={(e) => setConfig('repeatEveryDays', Number(e.target.value))} style={{ width: 90 }} /></Field>
        </>}
        {rule.key === 'assignment_due' && (
          <Field label="Days before due"><input className="input" type="number" min="0" value={form.config.daysBefore ?? 1} disabled={!admin} onChange={(e) => setConfig('daysBefore', Number(e.target.value))} style={{ width: 90 }} /></Field>
        )}
      </div>
      <div className="row between">
        <span className="small muted">{rule.lastRunAt ? `Last run ${fmtDateTime(rule.lastRunAt)} — ${rule.lastResult}` : 'Not run yet'}</span>
        <div className="row">
          {admin && dirty && <button className="btn btn-sm" disabled={busy} onClick={async () => { if (await run(() => api.put(`/automation/rules/${rule.key}`, form), 'Rule saved.')) onChanged() }}><Save size={13} /> Save</button>}
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={async () => { const r = await run(() => api.post(`/automation/rules/${rule.key}/run`)); if (r) { onChanged(r.summary) } }}><Play size={13} /> Run now</button>
        </div>
      </div>
    </div>
  )
}

function Rules({ onRan }) {
  const state = useApi('/automation/rules')
  const { user } = useAuth()
  const [run, busy] = useAction()
  const [last, setLast] = useState('')
  const admin = user.role === 'superadmin'
  const changed = (summary) => { if (summary) { setLast(summary); onRan() } state.reload() }
  return (
    <>
      <div className="row between mb">
        <div className="alert alert-info" style={{ flex: 1 }}>Rules run automatically once a day after their hour, and queue messages in the Outbox. Running a rule twice never sends duplicates.</div>
        {admin && <button className="btn btn-primary" disabled={busy} onClick={async () => { const r = await run(() => api.post('/automation/run-all')); if (r) changed(`${r.reduce((s, x) => s + x.queued, 0)} new messages queued across ${r.length} rules.`) }}><Play size={15} /> Run all now</button>}
      </div>
      {last && <div className="alert alert-ai mb">{last}</div>}
      <Async state={state}>{(rules) => (
        <div className="grid grid-2">{rules.map((r) => <RuleCard key={`${r.key}-${r.updatedAt}`} rule={r} admin={admin} onChanged={changed} />)}</div>
      )}</Async>
    </>
  )
}

function OutboxList({ version }) {
  const [status, setStatus] = useState('pending')
  const [rule, setRule] = useState('')
  const [channel, setChannel] = useState('')
  const state = useApi(`/outbox${qs({ status, rule, channel, v: version })}`)
  const [selected, setSelected] = useState(new Set())
  const [run, busy] = useAction()

  const mark = async (ids, newStatus) => {
    if (await run(() => api.post('/outbox/bulk', { ids, status: newStatus }), `${ids.length} marked ${newStatus}.`)) { setSelected(new Set()); state.reload() }
  }
  const sendOne = (m) => {
    if (m.phone) window.open(waLink(m.phone, m.message), '_blank', 'noopener')
    api.put(`/outbox/${m._id}`, { status: 'sent' }).then(state.reload)
  }

  return (
    <>
      <div className="filters">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'pending', label: `Pending${state.data?.counts?.pending ? ` (${state.data.counts.pending})` : ''}` }, { value: 'sent', label: 'Sent' }, { value: 'skipped', label: 'Skipped' }, { value: '', label: 'All' }]} />
        <select className="select" value={rule} onChange={(e) => setRule(e.target.value)}><option value="">All rules</option>{Object.entries(RULE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="select" value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">All channels</option><option value="whatsapp">WhatsApp</option><option value="app">Staff tasks</option></select>
        {selected.size > 0 && <>
          <button className="btn" disabled={busy} onClick={() => mark([...selected], 'sent')}><CheckCheck size={15} /> Mark {selected.size} sent</button>
          <button className="btn" disabled={busy} onClick={() => mark([...selected], 'skipped')}><SkipForward size={15} /> Skip</button>
        </>}
      </div>
      <Async state={state}>{({ items }) => (
        <div className="card">
          {items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th><input type="checkbox" aria-label="Select all" checked={selected.size === items.length} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((i) => i._id)) : new Set())} /></th>
                  <th>To</th><th>Message</th><th>Rule</th><th>Status</th><th />
                </tr></thead>
                <tbody>{items.map((m) => (
                  <tr key={m._id}>
                    <td><input type="checkbox" aria-label="Select" checked={selected.has(m._id)} onChange={(e) => { const s = new Set(selected); e.target.checked ? s.add(m._id) : s.delete(m._id); setSelected(s) }} /></td>
                    <td className="nowrap">{m.toName}<div className="cell-sub">{m.channel === 'app' ? <span className="row" style={{ gap: 4 }}><Bell size={11} /> staff task</span> : m.phone}</div></td>
                    <td className="small" style={{ maxWidth: 520 }}>{m.message}</td>
                    <td><Badge>{RULE_LABEL[m.ruleKey] || m.ruleKey}</Badge><div className="cell-sub">{fmtDateTime(m.createdAt)}</div></td>
                    <td><StatusBadge value={m.status} /></td>
                    <td className="nowrap">
                      {m.status === 'pending' && (m.channel === 'whatsapp'
                        ? <button className="btn btn-sm btn-primary" onClick={() => sendOne(m)}><WhatsAppIcon size={13} color="currentColor" /> Send</button>
                        : <button className="btn btn-sm" onClick={() => mark([m._id], 'sent')}>Done</button>)}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="Outbox is empty." />}
        </div>
      )}</Async>
    </>
  )
}

function Logs({ version }) {
  const state = useApi(`/automation/logs?v=${version}`)
  return (
    <Async state={state}>{(logs) => (
      <div className="card">
        {logs.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Rule</th><th>Trigger</th><th className="num">Queued</th><th>Result</th></tr></thead>
              <tbody>{logs.map((l) => (
                <tr key={l._id}><td className="nowrap">{fmtDateTime(l.createdAt)}</td><td>{l.ruleName}</td><td><Badge tone={l.trigger === 'schedule' ? 'info' : undefined}>{l.trigger}</Badge></td><td className="num">{l.queued}</td><td className="small text-2">{l.summary}</td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty text="No runs yet." />}
      </div>
    )}</Async>
  )
}

export default function Automation() {
  const [tab, setTab] = useState('rules')
  const [version, setVersion] = useState(0)
  return (
    <>
      <PageHead title="Automation" subtitle="Smart daily rules that prepare WhatsApp messages for parents and leads, and tasks for staff." />
      <div className="alert mb">
        Messages open in WhatsApp (web or app) with the text pre-filled — click <strong>Send</strong>, then press send in WhatsApp. To send fully automatically, connect a WhatsApp Business API provider later.
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'rules', label: 'Rules' }, { value: 'outbox', label: 'Outbox' }, { value: 'logs', label: 'Run history' }]} />
      {tab === 'rules' && <Rules onRan={() => setVersion((v) => v + 1)} />}
      {tab === 'outbox' && <OutboxList version={version} />}
      {tab === 'logs' && <Logs version={version} />}
    </>
  )
}
