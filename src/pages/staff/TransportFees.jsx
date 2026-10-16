import { useState } from 'react'
import { Ban, IndianRupee, Receipt, RefreshCw } from 'lucide-react'
import { api } from '../../lib/api.js'
import { fmtDate, money, today } from '../../lib/format.js'
import { Async, Badge, Confirm, Empty, Field, Modal, PageHead, SearchInput, Segmented, StatusBadge, useAction, useApi } from '../../components/ui.jsx'

const monthKey = () => today().slice(0, 7)
const monthLabel = (m) => {
  if (!m) return '—'
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

function PayModal({ inv, onClose, onSaved }) {
  const net = inv.amount - (inv.discount || 0)
  const pending = net - (inv.paid || 0)
  const [form, setForm] = useState({ amount: pending, mode: 'cash', paidOn: today(), reference: '', note: '' })
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, amount: Number(form.amount) }
    const ok = await run(() => api.post(`/transport/invoices/${inv._id}/pay`, body), 'Payment recorded.')
    if (ok) onSaved()
  }
  return (
    <Modal title={`Collect ${money(pending)} – ${inv.student?.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="pay-form" disabled={busy}>Save payment</button></>}>
      <form id="pay-form" className="form-grid" onSubmit={submit}>
        <Field label="Amount *"><input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} max={pending} required /></Field>
        <Field label="Mode">
          <select className="select" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            {['cash', 'upi', 'card', 'bank', 'cheque'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
        </Field>
        <Field label="Paid on"><input className="input" type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} /></Field>
        <Field label="Reference / cheque #"><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        <Field label="Note" full><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </form>
    </Modal>
  )
}

function GenerateModal({ onClose, onDone }) {
  const [form, setForm] = useState({ month: monthKey(), dueDate: '' })
  const [run, busy] = useAction()
  const submit = async (e) => {
    e.preventDefault()
    const r = await run(() => api.post('/transport/invoices/generate', form))
    if (r) { onDone(`Generated ${r.created} invoice(s) for ${monthLabel(form.month)}.`); onClose() }
  }
  return (
    <Modal title="Generate monthly invoices" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="gen-form" disabled={busy}>Generate</button></>}>
      <form id="gen-form" className="form-grid" onSubmit={submit}>
        <Field label="Month" full><input className="input" type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} required /></Field>
        <Field label="Due date (optional)" full><input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
        <p className="small muted" style={{ gridColumn: '1 / -1' }}>Creates one invoice per active transport assignment using its locked monthly fee. Existing invoices for the same month are left untouched.</p>
      </form>
    </Modal>
  )
}

export default function TransportFees() {
  const [month, setMonth] = useState(monthKey())
  const [status, setStatus] = useState('')
  const [routeId, setRouteId] = useState('')
  const [q, setQ] = useState('')
  const routes = useApi('/transport/routes')
  const url = `/transport/invoices?${new URLSearchParams({ month, ...(status && { status }), ...(routeId && { route: routeId }), ...(q && { q }) })}`
  const state = useApi(url)
  const [paying, setPaying] = useState(null)
  const [waiving, setWaiving] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [run, busy] = useAction()
  const refresh = () => state.reload()

  return (
    <>
      <PageHead title="Transport Fees" subtitle="One invoice per rider per month. Generate at the start of the month and collect payments as they come in.">
        <button className="btn" onClick={() => setGenerating(true)}><RefreshCw size={14} /> Generate month</button>
      </PageHead>
      <div className="filters" style={{ flexWrap: 'wrap' }}>
        <Field label="Month"><input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <Field label="Route">
          <select className="select" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
            <option value="">All routes</option>
            {(routes.data || []).map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <Segmented value={status} onChange={setStatus} options={[{ value: '', label: 'All' }, { value: 'due', label: 'Due' }, { value: 'overdue', label: 'Overdue' }, { value: 'paid', label: 'Paid' }, { value: 'waived', label: 'Waived' }]} />
        </Field>
        <Field label="Search"><SearchInput value={q} onChange={setQ} placeholder="Name, admission #…" /></Field>
      </div>
      <Async state={state}>{(list) => {
        if (!list.length) return <Empty text="No invoices here. Generate the month to create them." />
        const totals = list.reduce((t, i) => {
          const net = i.amount - (i.discount || 0)
          t.billed += net; t.paid += i.paid || 0
          if (i.liveStatus !== 'paid' && i.liveStatus !== 'waived') t.outstanding += net - (i.paid || 0)
          return t
        }, { billed: 0, paid: 0, outstanding: 0 })
        return (
          <>
            <div className="grid grid-3 mb">
              <div className="card card-pad"><div className="small muted">Billed · {monthLabel(month)}</div><h2>{money(totals.billed)}</h2></div>
              <div className="card card-pad"><div className="small muted">Collected</div><h2>{money(totals.paid)}</h2></div>
              <div className="card card-pad"><div className="small muted">Outstanding</div><h2 style={{ color: totals.outstanding ? 'var(--bad-text)' : undefined }}>{money(totals.outstanding)}</h2></div>
            </div>
            <div className="card">
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Student</th><th>Class</th><th>Route</th><th>Month</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Balance</th><th>Due</th><th>Status</th><th></th></tr></thead>
                  <tbody>{list.map((i) => {
                    const net = i.amount - (i.discount || 0)
                    const balance = Math.max(0, net - (i.paid || 0))
                    return (
                      <tr key={i._id}>
                        <td><strong>{i.student?.name || '—'}</strong><div className="small muted">{i.student?.admissionNo}</div></td>
                        <td>{i.student?.batch?.name || '—'}</td>
                        <td>{i.route?.name || '—'}</td>
                        <td>{monthLabel(i.month)}</td>
                        <td className="num">{money(net)}{i.discount ? <div className="small muted">disc {money(i.discount)}</div> : null}</td>
                        <td className="num">{money(i.paid || 0)}</td>
                        <td className="num" style={{ color: balance ? 'var(--bad-text)' : undefined }}>{money(balance)}</td>
                        <td>{fmtDate(i.dueDate)}</td>
                        <td><StatusBadge value={i.liveStatus} /></td>
                        <td>
                          <div className="row" style={{ gap: 4 }}>
                            {i.liveStatus !== 'paid' && i.liveStatus !== 'waived' && <button className="btn btn-sm btn-primary" onClick={() => setPaying(i)}><IndianRupee size={13} /> Pay</button>}
                            {i.receiptNo && <Badge tone="good" title={`Receipt ${i.receiptNo}`}><Receipt size={11} /> {i.receiptNo}</Badge>}
                            {i.liveStatus !== 'waived' && i.liveStatus !== 'paid' && <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setWaiving(i)} title="Waive"><Ban size={13} /></button>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            </div>
          </>
        )
      }}</Async>
      {paying && <PayModal inv={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); refresh() }} />}
      {generating && <GenerateModal onClose={() => setGenerating(false)} onDone={() => refresh()} />}
      {waiving && <Confirm text={`Waive ${money(waiving.amount - (waiving.discount || 0) - (waiving.paid || 0))} on this invoice for ${waiving.student?.name}?`} busy={busy} danger={false} confirmLabel="Waive" onClose={() => setWaiving(null)} onConfirm={async () => {
        if (await run(() => api.post(`/transport/invoices/${waiving._id}/waive`), 'Waived.')) { setWaiving(null); refresh() }
      }} />}
    </>
  )
}
