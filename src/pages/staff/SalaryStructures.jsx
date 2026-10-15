import { useState } from 'react'
import { Pencil, Plus, Trash2, Wand2 } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { money } from '../../lib/format.js'
import { Async, Badge, Empty, Field, Modal, PageHead, SearchInput, Segmented, useAction, useApi, WingBadges } from '../../components/ui.jsx'

const STANDARD = [
  { name: 'HRA', calc: 'percent', value: 40 },
  { name: 'Dearness Allowance (DA)', calc: 'percent', value: 10 },
  { name: 'Conveyance', calc: 'fixed', value: 1600 },
  { name: 'Special Allowance', calc: 'fixed', value: 0 },
]

const amountOf = (c, basic) => (c.calc === 'percent' ? (basic * (Number(c.value) || 0)) / 100 : Number(c.value) || 0)

// Same rules as the server's computeSlip, for a full month.
function preview(f) {
  const basic = Number(f.basic) || 0
  const earnings = [{ name: 'Basic', amount: basic }, ...f.earnings.filter((c) => c.name).map((c) => ({ name: c.name, amount: Math.round(amountOf(c, basic)) }))]
  const gross = earnings.reduce((s, e) => s + e.amount, 0)
  const deductions = []
  if (f.pf && basic) deductions.push({ name: 'PF (12%)', amount: Math.round(Math.min(basic, Number(f.pfCap) || 15000) * 0.12) })
  if (f.esi && gross && gross <= 21000) deductions.push({ name: 'ESI (0.75%)', amount: Math.ceil(gross * 0.0075) })
  if (Number(f.professionalTax)) deductions.push({ name: 'Professional Tax', amount: Number(f.professionalTax) })
  if (Number(f.tds)) deductions.push({ name: 'TDS', amount: Number(f.tds) })
  for (const c of f.deductions.filter((c) => c.name)) deductions.push({ name: c.name, amount: Math.round(amountOf(c, basic)) })
  const total = deductions.reduce((s, d) => s + d.amount, 0)
  return { earnings, deductions, gross, total, net: Math.max(0, gross - total) }
}

function Components({ label, rows, onChange }) {
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div className="full" style={{ gridColumn: '1 / -1' }}>
      <div className="row between mb"><strong className="small">{label}</strong><button type="button" className="btn btn-sm" onClick={() => onChange([...rows, { name: '', calc: 'fixed', value: '' }])}><Plus size={13} /> Add</button></div>
      {rows.length ? rows.map((r, i) => (
        <div className="row mb" key={i} style={{ gap: 6 }}>
          <input className="input" placeholder="Name (e.g. HRA)" value={r.name} onChange={(e) => set(i, 'name', e.target.value)} style={{ flex: 2 }} />
          <select className="select" value={r.calc} onChange={(e) => set(i, 'calc', e.target.value)} style={{ flex: 1.3 }}>
            <option value="fixed">Fixed ₹</option>
            <option value="percent">% of basic</option>
          </select>
          <input className="input" type="number" min="0" step="any" placeholder={r.calc === 'percent' ? '%' : '₹'} value={r.value} onChange={(e) => set(i, 'value', e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 size={14} /></button>
        </div>
      )) : <p className="small muted">None.</p>}
    </div>
  )
}

function StructureForm({ row, onClose, onSaved }) {
  const s = row.structure || {}
  const [form, setForm] = useState({
    basic: s.basic ?? row.staff.salary ?? 0,
    earnings: s.earnings || [],
    deductions: s.deductions || [],
    pf: s.pf ?? false,
    pfCap: s.pfCap ?? 15000,
    esi: s.esi ?? false,
    professionalTax: s.professionalTax ?? 0,
    tds: s.tds ?? 0,
    paymentMode: s.paymentMode || 'bank',
    bankName: s.bankName || '',
    accountNo: s.accountNo || '',
    ifsc: s.ifsc || '',
    pan: s.pan || '',
    uan: s.uan || '',
    notes: s.notes || '',
  })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const p = preview(form)
  const submit = async (e) => {
    e.preventDefault()
    const ok = await run(() => api.put(`/payroll/structures/${row.staff._id}`, form), 'Salary structure saved.')
    if (ok) onSaved()
  }
  const addStandard = () => {
    const have = new Set(form.earnings.map((c) => c.name.toLowerCase()))
    setForm({ ...form, earnings: [...form.earnings, ...STANDARD.filter((c) => !have.has(c.name.toLowerCase()))] })
  }
  return (
    <Modal size="lg" title={`Salary structure — ${row.staff.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="structure-form" disabled={busy}>Save</button></>}>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form id="structure-form" className="form-grid" onSubmit={submit}>
          <Field label="Basic salary (monthly ₹) *" full><input className="input" type="number" min="0" value={form.basic} onChange={set('basic')} required /></Field>
          <Components label="Earnings / allowances" rows={form.earnings} onChange={(earnings) => setForm({ ...form, earnings })} />
          <div style={{ gridColumn: '1 / -1' }}><button type="button" className="btn btn-sm btn-ghost" onClick={addStandard}><Wand2 size={13} /> Add standard allowances (HRA, DA, conveyance…)</button></div>
          <Field label="Statutory" full>
            <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
              <label className="check"><input type="checkbox" checked={form.pf} onChange={set('pf')} /> PF 12%</label>
              <label className="check"><input type="checkbox" checked={form.esi} onChange={set('esi')} /> ESI 0.75%</label>
            </div>
          </Field>
          {form.pf && <Field label="PF wage ceiling (₹)" hint="PF is 12% of basic up to this amount"><input className="input" type="number" min="0" value={form.pfCap} onChange={set('pfCap')} /></Field>}
          <Field label="Professional tax (₹/month)"><input className="input" type="number" min="0" value={form.professionalTax} onChange={set('professionalTax')} /></Field>
          <Field label="TDS (₹/month)"><input className="input" type="number" min="0" value={form.tds} onChange={set('tds')} /></Field>
          <Components label="Other fixed deductions" rows={form.deductions} onChange={(deductions) => setForm({ ...form, deductions })} />
          <Field label="Salary paid by">
            <select className="select" value={form.paymentMode} onChange={set('paymentMode')}>
              <option value="bank">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="upi">UPI</option>
            </select>
          </Field>
          <Field label="Bank name"><input className="input" value={form.bankName} onChange={set('bankName')} /></Field>
          <Field label="Account no."><input className="input" value={form.accountNo} onChange={set('accountNo')} /></Field>
          <Field label="IFSC"><input className="input" value={form.ifsc} onChange={set('ifsc')} style={{ textTransform: 'uppercase' }} /></Field>
          <Field label="PAN"><input className="input" value={form.pan} onChange={set('pan')} style={{ textTransform: 'uppercase' }} /></Field>
          <Field label="UAN (PF)"><input className="input" value={form.uan} onChange={set('uan')} /></Field>
          <Field label="Notes" full><input className="input" value={form.notes} onChange={set('notes')} /></Field>
        </form>
        <div className="card card-pad" style={{ position: 'sticky', top: 0 }}>
          <div className="small muted mb">Full month preview</div>
          <table className="table">
            <tbody>
              {p.earnings.map((e) => <tr key={e.name}><td>{e.name}</td><td className="num">{money(e.amount)}</td></tr>)}
              <tr><th>Gross</th><th className="num">{money(p.gross)}</th></tr>
              {p.deductions.map((d) => <tr key={d.name}><td className="text-2">− {d.name}</td><td className="num">{money(d.amount)}</td></tr>)}
              <tr><th>Net pay</th><th className="num" style={{ color: 'var(--good-text)' }}>{money(p.net)}</th></tr>
            </tbody>
          </table>
          <p className="small muted mt">Earnings and PF are reduced in proportion to paid days when a month has loss-of-pay days. Advance recoveries are added on the payslip.</p>
        </div>
      </div>
    </Modal>
  )
}

export default function SalaryStructures() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('active')
  const state = useApi(`/payroll/structures${qs({ q, status: status === 'all' ? 'all' : undefined })}`)
  const [editing, setEditing] = useState(null)
  return (
    <>
      <PageHead title="Salary Structures" subtitle="Basic pay, allowances, PF / ESI / PT / TDS and bank details for each staff member. Payroll uses these every month." />
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Name, designation…" />
        <Segmented value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active staff' }, { value: 'all', label: 'All' }]} />
      </div>
      <Async state={state}>{(rows) => {
        if (!rows.length) return <Empty text="No staff found. Add staff in the Staff Directory first." />
        const totals = rows.filter((r) => r.staff.status === 'active').reduce((t, r) => ({ gross: t.gross + r.gross, net: t.net + r.net }), { gross: 0, net: 0 })
        const missing = rows.filter((r) => !r.configured).length
        return (
          <>
            <div className="grid grid-3 mb">
              <div className="card card-pad"><div className="small muted">Monthly gross (active)</div><h2>{money(totals.gross)}</h2></div>
              <div className="card card-pad"><div className="small muted">Monthly net pay</div><h2>{money(totals.net)}</h2></div>
              <div className="card card-pad"><div className="small muted">Without a structure</div><h2 style={{ color: missing ? 'var(--warn-text)' : undefined }}>{missing}</h2><div className="small muted">Paid their directory salary as basic</div></div>
            </div>
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Staff</th><th>Wings</th><th className="num">Basic</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net</th><th>Paid by</th><th /></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.staff._id}>
                      <td><div className="cell-title">{r.staff.name}</div><div className="cell-sub">{r.staff.designation}{r.staff.department ? ` · ${r.staff.department}` : ''}</div></td>
                      <td><div className="row" style={{ gap: 4 }}><WingBadges wings={r.staff.wings} /></div></td>
                      <td className="num">{money(r.structure ? r.structure.basic : r.staff.salary)}</td>
                      <td className="num">{money(r.gross)}</td>
                      <td className="num">{money(r.deductions)}</td>
                      <td className="num"><strong>{money(r.net)}</strong></td>
                      <td>{r.configured ? <span className="small">{(r.structure.paymentMode || 'bank').toUpperCase()}{r.structure.accountNo ? ` · ••${r.structure.accountNo.slice(-4)}` : ''}</span> : <Badge tone="warn">Not set</Badge>}</td>
                      <td><button className="btn btn-sm" onClick={() => setEditing(r)}><Pencil size={13} /> {r.configured ? 'Edit' : 'Set up'}</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>
        )
      }}</Async>
      {editing && <StructureForm row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload() }} />}
    </>
  )
}
