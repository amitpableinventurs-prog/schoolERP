import { useState } from 'react'
import { HandCoins, Lock, Pencil, Plus, Trash2, Unlock } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, money, today } from '../../lib/format.js'
import { Async, Confirm, Empty, Field, Meter, Modal, PageHead, Segmented, StatusBadge, useAction, useApi } from '../../components/ui.jsx'

function AdvanceForm({ item, onClose, onSaved }) {
  const staff = useApi(item ? null : '/staff?status=active')
  const [form, setForm] = useState(item
    ? { monthlyDeduction: item.monthlyDeduction, note: item.note || '' }
    : { staff: '', kind: 'advance', amount: '', monthlyDeduction: '', givenOn: today(), mode: 'cash', note: '' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const months = form.amount && form.monthlyDeduction ? Math.ceil(Number(form.amount) / Number(form.monthlyDeduction)) : null
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, amount: Number(form.amount) || undefined, monthlyDeduction: Number(form.monthlyDeduction) || undefined }
    const ok = await run(() => (item ? api.put(`/payroll/advances/${item._id}`, body) : api.post('/payroll/advances', body)), 'Saved.')
    if (ok) onSaved()
  }
  return (
    <Modal title={item ? `Edit ${item.kind} — ${item.staff?.name}` : 'Give advance / loan'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="adv-form" disabled={busy}>Save</button></>}>
      <form id="adv-form" className="form-grid" onSubmit={submit}>
        {!item && <>
          <Field label="Staff member *" full>
            <select className="select" value={form.staff} onChange={set('staff')} required>
              <option value="">Choose…</option>
              {(staff.data || []).map((s) => <option key={s._id} value={s._id}>{s.name} · {s.designation}</option>)}
            </select>
          </Field>
          <Field label="Type"><select className="select" value={form.kind} onChange={set('kind')}><option value="advance">Salary advance</option><option value="loan">Loan</option></select></Field>
          <Field label="Amount given (₹) *"><input className="input" type="number" min="1" value={form.amount} onChange={set('amount')} required /></Field>
          <Field label="Given on"><input className="input" type="date" value={form.givenOn} onChange={set('givenOn')} /></Field>
          <Field label="Paid by"><select className="select" value={form.mode} onChange={set('mode')}><option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option><option value="cheque">Cheque</option></select></Field>
        </>}
        <Field label="Recover per month (₹)" hint={months ? `≈ ${months} month(s)` : !item ? 'Blank = recover fully next payroll' : undefined}><input className="input" type="number" min="1" value={form.monthlyDeduction} onChange={set('monthlyDeduction')} required={!!item} /></Field>
        <Field label="Note" full><input className="input" value={form.note} onChange={set('note')} /></Field>
      </form>
    </Modal>
  )
}

export default function SalaryAdvances() {
  const [status, setStatus] = useState('open')
  const state = useApi(`/payroll/advances${qs({ status })}`)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()
  const setOpen = async (a, open) => {
    if (await run(() => api.put(`/payroll/advances/${a._id}`, { status: open ? 'open' : 'closed' }), open ? 'Re-opened.' : 'Closed.')) state.reload()
  }
  return (
    <>
      <PageHead title="Advances & Loans" subtitle="Money given to staff ahead of salary. The monthly instalment is deducted automatically on each payslip until it is fully recovered.">
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Give advance / loan</button>
      </PageHead>
      <div className="filters">
        <Segmented value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: '', label: 'All' }]} />
      </div>
      <Async state={state}>{(rows) => {
        if (!rows.length) return <Empty icon={HandCoins} text="No advances here." />
        const outstanding = rows.filter((a) => a.status === 'open').reduce((s, a) => s + a.balance, 0)
        return (
          <>
            <div className="grid grid-3 mb">
              <div className="card card-pad"><div className="small muted">Given</div><h2>{money(rows.reduce((s, a) => s + a.amount, 0))}</h2></div>
              <div className="card card-pad"><div className="small muted">Recovered</div><h2>{money(rows.reduce((s, a) => s + (a.recovered || 0), 0))}</h2></div>
              <div className="card card-pad"><div className="small muted">Still to recover</div><h2 style={{ color: outstanding ? 'var(--bad-text)' : undefined }}>{money(outstanding)}</h2></div>
            </div>
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Staff</th><th>Type</th><th>Given</th><th className="num">Amount</th><th className="num">Per month</th><th style={{ minWidth: 160 }}>Recovered</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
                  <tbody>{rows.map((a) => (
                    <tr key={a._id}>
                      <td><div className="cell-title">{a.staff?.name || '—'}</div><div className="cell-sub">{a.staff?.designation}{a.note ? ` · ${a.note}` : ''}</div></td>
                      <td><StatusBadge value={a.kind} /></td>
                      <td>{fmtDate(a.givenOn)}<div className="cell-sub">{a.mode?.toUpperCase()}</div></td>
                      <td className="num">{money(a.amount)}</td>
                      <td className="num">{money(a.monthlyDeduction)}</td>
                      <td><Meter value={(a.recovered / a.amount) * 100} /><div className="cell-sub">{money(a.recovered)}</div></td>
                      <td className="num"><strong>{money(a.balance)}</strong></td>
                      <td><StatusBadge value={a.status} /></td>
                      <td className="nowrap">
                        {a.status === 'open' && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(a)} aria-label="Edit"><Pencil size={14} /></button>}
                        {a.status === 'open'
                          ? <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setOpen(a, false)} title="Close (settled outside payroll / written off)" aria-label="Close"><Lock size={14} /></button>
                          : a.balance > 0 && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setOpen(a, true)} title="Re-open" aria-label="Re-open"><Unlock size={14} /></button>}
                        {!a.recovered && <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(a)} aria-label="Delete"><Trash2 size={14} /></button>}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>
        )
      }}</Async>
      {editing && <AdvanceForm item={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload() }} />}
      {deleting && <Confirm text={`Delete this ${money(deleting.amount)} ${deleting.kind} of ${deleting.staff?.name}?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (await run(() => api.del(`/payroll/advances/${deleting._id}`), 'Deleted.')) { setDeleting(null); state.reload() }
      }} />}
    </>
  )
}
