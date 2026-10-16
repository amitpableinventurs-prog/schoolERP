import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Banknote, CheckCheck, Download, FileText, Pencil, Plus, RefreshCw, Trash2, Undo2, Users, Wallet } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { money, monthName, today } from '../../lib/format.js'
import { Async, Confirm, Empty, Field, Modal, PageHead, SearchInput, Segmented, StatTile, StatusBadge, useAction, useApi, useToast } from '../../components/ui.jsx'

const thisMonth = () => today().slice(0, 7)

function Lines({ label, rows, onChange }) {
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <div className="row between mb"><strong className="small">{label}</strong><button type="button" className="btn btn-sm" onClick={() => onChange([...rows, { name: '', amount: '' }])}><Plus size={13} /> Add</button></div>
      {rows.map((r, i) => (
        <div className="row mb" key={i} style={{ gap: 6 }}>
          <input className="input" placeholder="Description" value={r.name} onChange={(e) => set(i, 'name', e.target.value)} style={{ flex: 2 }} />
          <input className="input" type="number" min="0" placeholder="₹" value={r.amount} onChange={(e) => set(i, 'amount', e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  )
}

function EditSlip({ slip, onClose, onSaved }) {
  const [form, setForm] = useState({
    workingDays: slip.workingDays,
    paidDays: slip.paidDays,
    additions: slip.additions || [],
    extraDeductions: slip.extraDeductions || [],
    note: slip.note || '',
  })
  const [run, busy] = useAction()
  const lop = Math.max(0, (Number(form.workingDays) || 0) - (Number(form.paidDays) || 0))
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, workingDays: Number(form.workingDays), paidDays: Number(form.paidDays) }
    const ok = await run(() => api.put(`/payroll/payslips/${slip._id}`, body), 'Payslip recalculated.')
    if (ok) onSaved()
  }
  return (
    <Modal title={`${slip.staffName} — ${monthName(slip.month)}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="slip-form" disabled={busy}>Save & recalculate</button></>}>
      <form id="slip-form" className="form-grid" onSubmit={submit}>
        <Field label="Working days"><input className="input" type="number" min="1" max="31" value={form.workingDays} onChange={(e) => setForm({ ...form, workingDays: e.target.value })} required /></Field>
        <Field label="Paid days" hint={lop ? `${lop} day(s) loss of pay` : 'No loss of pay'}><input className="input" type="number" min="0" max={form.workingDays} step="0.5" value={form.paidDays} onChange={(e) => setForm({ ...form, paidDays: e.target.value })} required /></Field>
        <Lines label="One-off additions (bonus, arrears, overtime…)" rows={form.additions} onChange={(additions) => setForm({ ...form, additions })} />
        <Lines label="One-off deductions (fine, recovery…)" rows={form.extraDeductions} onChange={(extraDeductions) => setForm({ ...form, extraDeductions })} />
        <Field label="Note on payslip" full><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </form>
      <p className="small muted mt">Earnings, PF and ESI are recalculated from the salary structure saved when the payslip was generated. Open advances are recovered automatically.</p>
    </Modal>
  )
}

function GenerateModal({ month, onClose, onDone }) {
  const [form, setForm] = useState({ month, workingDays: '', refreshDrafts: false })
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    const r = await run(() => api.post('/payroll/generate', { ...form, workingDays: Number(form.workingDays) || undefined }))
    if (r) onDone(r)
  }
  return (
    <Modal title="Generate payroll" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="gen-form" disabled={busy}>Generate</button></>}>
      <form id="gen-form" className="form-grid" onSubmit={submit}>
        <Field label="Month"><input className="input" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required /></Field>
        <Field label="Working days" hint="Blank = all days of the month"><input className="input" type="number" min="1" max="31" value={form.workingDays} onChange={(e) => setForm({ ...form, workingDays: e.target.value })} /></Field>
        <label className="check" style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={form.refreshDrafts} onChange={(e) => setForm({ ...form, refreshDrafts: e.target.checked })} /> Recalculate existing drafts from the latest salary structures</label>
        <p className="small muted" style={{ gridColumn: '1 / -1' }}>Creates a draft payslip for every active staff member who doesn&apos;t have one this month. Staff who joined mid-month are paid from their joining date. Approved and paid payslips are never changed.</p>
      </form>
    </Modal>
  )
}

function PayModal({ slips, onClose, onDone }) {
  const total = slips.reduce((s, p) => s + p.net, 0)
  const [form, setForm] = useState({ paidOn: today(), mode: 'bank', reference: '' })
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    const r = await run(() => api.post('/payroll/pay', { ...form, ids: slips.map((s) => s._id) }))
    if (r) onDone(r)
  }
  return (
    <Modal title={`Pay ${slips.length} staff — ${money(total)}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="pay-form" disabled={busy}>Mark as paid</button></>}>
      <form id="pay-form" className="form-grid" onSubmit={submit}>
        <Field label="Paid on"><input className="input" type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} required /></Field>
        <Field label="Mode">
          <select className="select" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="bank">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="upi">UPI</option>
          </select>
        </Field>
        <Field label="Reference (UTR / cheque / batch no.)" full><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
      </form>
      <p className="small muted mt">Advance and loan recoveries on these payslips are booked when they are marked paid.</p>
    </Modal>
  )
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

function downloadBankSheet(slips, month) {
  const head = ['Staff', 'Designation', 'Bank', 'Account no.', 'IFSC', 'Net pay', 'Mode', 'Slip no.']
  const rows = slips.map((p) => [p.staffName, p.designation, p.bank?.bankName, p.bank?.accountNo, p.bank?.ifsc, p.net, p.bank?.paymentMode || 'bank', p.slipNo])
  const csv = [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `salary-${month}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

export default function Payroll() {
  const [params, setParams] = useSearchParams()
  const month = params.get('month') || thisMonth()
  const setMonth = (m) => setParams(m ? { month: m } : {})
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const summary = useApi(`/payroll/summary?month=${month}`)
  const state = useApi(`/payroll/payslips${qs({ month, status, q })}`)
  const [selected, setSelected] = useState(new Set())
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [paying, setPaying] = useState(null)
  const [run, busy] = useAction()
  const say = useToast()
  const refresh = () => { state.reload(); summary.reload(); setSelected(new Set()) }

  const list = state.data || []
  const chosen = list.filter((p) => selected.has(p._id))
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const allChecked = list.length > 0 && list.every((p) => selected.has(p._id))
  const bulk = async (path, ids, message) => {
    const r = await run(() => api.post(path, { ids }))
    if (r) { refresh(); return message(r) }
  }

  const drafts = chosen.filter((p) => p.status === 'draft')
  const approved = chosen.filter((p) => p.status === 'approved')

  return (
    <>
      <PageHead title="Payroll" subtitle="Generate monthly payslips, adjust loss-of-pay and bonuses, approve and record salary payments.">
        <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" style={{ width: 'auto' }} />
        <button className="btn btn-primary" onClick={() => setGenerating(true)}><RefreshCw size={14} /> Generate payroll</button>
      </PageHead>
      <Async state={summary}>{(s) => (
        <div className="grid grid-4 mb">
          <StatTile icon={Users} label="Payslips" value={`${s.slips} / ${s.activeStaff}`} foot={s.missing ? `${s.missing} active staff not generated yet` : 'Everyone generated'} tone={s.missing ? 'bad' : 'good'} />
          <StatTile icon={Wallet} label={`Gross · ${monthName(month)}`} value={money(s.gross)} foot={`Deductions ${money(s.deductions)}`} />
          <StatTile icon={Banknote} label="Net payable" value={money(s.payable)} foot={`${s.draft} draft · ${s.approved} approved`} tone={s.payable ? 'bad' : undefined} />
          <StatTile icon={CheckCheck} label="Paid" value={money(s.paidAmount)} foot={`${s.paid} staff paid${s.advancesOutstanding ? ` · advances due ${money(s.advancesOutstanding)}` : ''}`} tone="good" />
        </div>
      )}</Async>
      <div className="filters">
        <Segmented value={status} onChange={(v) => { setStatus(v); setSelected(new Set()) }} options={[{ value: '', label: 'All' }, { value: 'draft', label: 'Draft' }, { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' }]} />
        <SearchInput value={q} onChange={setQ} placeholder="Staff, department, slip no…" />
        <div className="row" style={{ gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {drafts.length > 0 && <button className="btn btn-sm" disabled={busy} onClick={() => bulk('/payroll/approve', drafts.map((p) => p._id), (r) => say(`Approved ${r.updated} payslip(s).`))}><CheckCheck size={13} /> Approve {drafts.length}</button>}
          {approved.length > 0 && <button className="btn btn-sm" disabled={busy} onClick={() => bulk('/payroll/unapprove', approved.map((p) => p._id), (r) => say(`Moved ${r.updated} payslip(s) back to draft.`))}><Undo2 size={13} /> Back to draft</button>}
          {approved.length > 0 && <button className="btn btn-sm btn-primary" onClick={() => setPaying(approved)}><Banknote size={13} /> Pay {approved.length}</button>}
          {list.length > 0 && <button className="btn btn-sm" onClick={() => downloadBankSheet((chosen.length ? chosen : list).filter((p) => p.status !== 'draft'), month)} title="Approved and paid payslips with bank details"><Download size={13} /> Bank sheet</button>}
        </div>
      </div>
      <Async state={state}>{(rows) => {
        if (!rows.length) return <Empty icon={Wallet} text={status || q ? 'No payslips match.' : `No payslips for ${monthName(month)} yet.`}>{!status && !q && <button className="btn btn-primary" onClick={() => setGenerating(true)}><RefreshCw size={14} /> Generate payroll</button>}</Empty>
        return (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th><input type="checkbox" aria-label="Select all" checked={allChecked} onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((p) => p._id)))} /></th>
                  <th>Staff</th><th>Days</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net pay</th><th>Status</th><th />
                </tr></thead>
                <tbody>{rows.map((p) => {
                  const lop = p.workingDays - p.paidDays
                  return (
                    <tr key={p._id}>
                      <td><input type="checkbox" aria-label={`Select ${p.staffName}`} checked={selected.has(p._id)} onChange={() => toggle(p._id)} /></td>
                      <td><div className="cell-title">{p.staffName}</div><div className="cell-sub">{p.designation}{p.department ? ` · ${p.department}` : ''}</div></td>
                      <td>{p.paidDays}/{p.workingDays}{lop > 0 && <div className="cell-sub" style={{ color: 'var(--bad-text)' }}>{lop} LOP</div>}</td>
                      <td className="num">{money(p.gross)}{p.additions?.length ? <div className="cell-sub">incl. {money(p.additions.reduce((s, a) => s + a.amount, 0))} extra</div> : null}</td>
                      <td className="num">{money(p.totalDeductions)}{p.advanceRecovery?.length ? <div className="cell-sub">advance {money(p.advanceRecovery.reduce((s, a) => s + a.amount, 0))}</div> : null}</td>
                      <td className="num"><strong>{money(p.net)}</strong></td>
                      <td><StatusBadge value={p.status} />{p.status === 'paid' && <div className="cell-sub">{p.paidOn} · {p.mode?.toUpperCase()}</div>}</td>
                      <td className="nowrap">
                        {p.status === 'draft' && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(p)} aria-label="Edit" title="Edit days / bonus"><Pencil size={14} /></button>}
                        <Link className="btn btn-sm btn-ghost btn-icon" to={`/payroll/payslip/${p._id}`} aria-label="Payslip" title="Payslip"><FileText size={14} /></Link>
                        {p.status === 'draft' && <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(p)} aria-label="Delete"><Trash2 size={14} /></button>}
                      </td>
                    </tr>
                  )
                })}</tbody>
                <tfoot><tr>
                  <th /><th>{rows.length} staff</th><th />
                  <th className="num">{money(rows.reduce((s, p) => s + p.gross, 0))}</th>
                  <th className="num">{money(rows.reduce((s, p) => s + p.totalDeductions, 0))}</th>
                  <th className="num">{money(rows.reduce((s, p) => s + p.net, 0))}</th><th /><th />
                </tr></tfoot>
              </table>
            </div>
          </div>
        )
      }}</Async>
      {generating && <GenerateModal month={month} onClose={() => setGenerating(false)} onDone={(r) => {
        setGenerating(false)
        if (r.month !== month) setMonth(r.month)
        refresh()
        say(`${monthName(r.month)}: ${r.created} payslip(s) created${r.refreshed ? `, ${r.refreshed} draft(s) recalculated` : ''}${r.skipped ? `, ${r.skipped} skipped (already generated, not joined yet or zero salary)` : ''}.`)
      }} />}
      {editing && <EditSlip slip={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      {paying && <PayModal slips={paying} onClose={() => setPaying(null)} onDone={(r) => { setPaying(null); refresh(); say(`Paid ${r.paid} staff — ${money(r.amount)}.`) }} />}
      {deleting && <Confirm text={`Delete the draft payslip of ${deleting.staffName}? You can generate it again later.`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (await run(() => api.del(`/payroll/payslips/${deleting._id}`), 'Deleted.')) { setDeleting(null); refresh() }
      }} />}
    </>
  )
}
