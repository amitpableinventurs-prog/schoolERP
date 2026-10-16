import { useDeferredValue, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, IndianRupee, Plus, Receipt, Wallet } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, money, today, waLink } from '../../lib/format.js'
import { Async, BatchSelect, Empty, Field, Modal, PageHead, SearchInput, StatTile, StatusBadge, Tabs, useAction, useApi, WhatsAppIcon } from '../../components/ui.jsx'

function CollectModal({ studentId, onClose, onSaved }) {
  const [q, setQ] = useState('')
  const query = useDeferredValue(q)
  const [student, setStudent] = useState(studentId || '')
  const search = useApi(!student && query.length >= 2 ? `/students${qs({ q: query, status: 'active' })}` : null, { skip: student || query.length < 2 })
  const insts = useApi(student ? `/fees/installments${qs({ student })}` : null, { skip: !student })

  return (
    <Modal title="Collect fee" onClose={onClose} footer={student && insts.data && <><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="collect-form">Record payment & receipt</button></>}>
      {!student ? (
        <div className="stack">
          <SearchInput value={q} onChange={setQ} placeholder="Search student by name, admission no. or phone" />
          {(search.data || []).map((s) => (
            <button key={s._id} className="btn" style={{ justifyContent: 'space-between', height: 'auto', padding: '8px 12px' }} onClick={() => setStudent(s._id)}>
              <span>{s.name} <span className="muted">· {s.admissionNo}</span></span><span className="muted">{s.batch?.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <Async state={insts}>{(list) => <CollectForm student={student} installments={list} onSaved={onSaved} />}</Async>
      )}
    </Modal>
  )
}

function CollectForm({ student, installments, onSaved }) {
  const unpaid = installments.filter((i) => i.balance > 0)
  const totalDue = unpaid.reduce((s, i) => s + i.balance, 0)
  const studentInfo = installments[0]?.student
  // Pre-filled with the oldest unpaid installment.
  const [form, setForm] = useState({ installment: unpaid[0]?._id || '', amount: unpaid[0]?.balance || '', mode: 'upi', paidOn: today(), reference: '', note: '' })
  const [run, busy] = useAction()

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    const payment = await run(() => api.post('/fees/payments', { ...form, student, amount: Number(form.amount) }), 'Payment recorded.')
    if (payment) onSaved(payment)
  }

  return (
    <form id="collect-form" className="stack" onSubmit={submit}>
      <div className="row between">
        <div><strong>{studentInfo?.name}</strong> <span className="muted">{studentInfo?.admissionNo}</span></div>
        <div>Total due: <strong>{money(totalDue)}</strong></div>
      </div>
      {unpaid.length ? (
        <>
          <Field label="Against installment">
            <select className="select" value={form.installment} onChange={(e) => {
              const inst = unpaid.find((i) => i._id === e.target.value)
              setForm({ ...form, installment: e.target.value, amount: inst ? inst.balance : totalDue })
            }}>
              {unpaid.map((i) => <option key={i._id} value={i._id}>{i.title} · due {fmtDate(i.dueDate)} · {money(i.balance)}{i.status === 'overdue' ? ' (overdue)' : ''}</option>)}
              <option value="">Auto: oldest dues first</option>
            </select>
          </Field>
          <div className="form-grid">
            <Field label="Amount (₹)"><input className="input" type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
            <Field label="Mode">
              <select className="select" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="upi">UPI</option><option value="cash">Cash</option><option value="card">Card</option><option value="bank">Bank transfer</option><option value="cheque">Cheque</option>
              </select>
            </Field>
            <Field label="Date"><input className="input" type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} /></Field>
            <Field label="Reference / UTR"><input className="input" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
            <Field label="Note" full><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          </div>
        </>
      ) : <div className="alert alert-info">No pending dues for this student. 🎉</div>}
    </form>
  )
}

function Dues({ onCollect }) {
  const [status, setStatus] = useState('overdue')
  const [batch, setBatch] = useState('')
  const [q, setQ] = useState('')
  const query = useDeferredValue(q)
  const state = useApi(`/fees/installments${qs({ status, batch, q: query })}`)
  return (
    <>
      <div className="filters">
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="overdue">Overdue</option><option value="due">Upcoming dues</option><option value="unpaid">All unpaid</option><option value="paid">Paid</option><option value="">Everything</option>
        </select>
        <BatchSelect value={batch} onChange={setBatch} />
        <SearchInput value={q} onChange={setQ} placeholder="Student, admission no., phone" />
      </div>
      <Async state={state}>{(rows) => (
        <div className="card">
          <div className="card-head"><span className="sub">{rows.length} installments · balance {money(rows.reduce((s, r) => s + r.balance, 0))}</span></div>
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Batch</th><th>Installment</th><th>Due date</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th><th /></tr></thead>
                <tbody>{rows.map((i) => (
                  <tr key={i._id}>
                    <td><Link className="cell-title" to={`/students/${i.student?._id}`}>{i.student?.name}</Link><div className="cell-sub">{i.student?.admissionNo}</div></td>
                    <td>{i.batch?.name}</td>
                    <td>{i.title}</td>
                    <td>{fmtDate(i.dueDate)}{i.daysOverdue > 0 && <div className="cell-sub">{i.daysOverdue} days late</div>}</td>
                    <td className="num">{money(i.amount - (i.discount || 0))}</td>
                    <td className="num">{money(i.paid)}</td>
                    <td className="num"><strong>{money(i.balance)}</strong></td>
                    <td><StatusBadge value={i.status} /></td>
                    <td className="nowrap">
                      {i.balance > 0 && <>
                        <button className="btn btn-sm btn-primary" onClick={() => onCollect(i.student?._id)}>Collect</button>
                        {i.student?.guardianPhone && (
                          <a className="btn btn-sm btn-ghost btn-icon" style={{ marginLeft: 4 }} title="WhatsApp reminder" aria-label="WhatsApp reminder" target="_blank" rel="noreferrer"
                            href={waLink(i.student.guardianPhone, `Dear ${i.student.guardianName || 'Parent'}, ${i.title} fee of ${money(i.balance)} for ${i.student.name} ${i.status === 'overdue' ? `was due on ${fmtDate(i.dueDate)}` : `is due on ${fmtDate(i.dueDate)}`}. Kindly pay at the earliest.`)}>
                            <WhatsAppIcon size={18} />
                          </a>
                        )}
                      </>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="Nothing in this list." />}
        </div>
      )}</Async>
    </>
  )
}

function Payments() {
  const [from, setFrom] = useState(today().slice(0, 8) + '01')
  const [to, setTo] = useState(today())
  const state = useApi(`/fees/payments${qs({ from, to })}`)
  return (
    <>
      <div className="filters">
        <Field label="From"><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Async state={state}>{(rows) => (
        <div className="card">
          <div className="card-head"><span className="sub">{rows.length} payments · total {money(rows.reduce((s, r) => s + r.amount, 0))}</span></div>
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th>Batch</th><th>For</th><th>Mode</th><th className="num">Amount</th><th>By</th></tr></thead>
                <tbody>{rows.map((p) => (
                  <tr key={p._id}>
                    <td><Link className="mono" to={`/fees/receipt/${p._id}`}>{p.receiptNo}</Link></td>
                    <td>{fmtDate(p.paidOn)}</td>
                    <td>{p.student?.name}<div className="cell-sub">{p.student?.admissionNo}</div></td>
                    <td>{p.student?.batch?.name}</td>
                    <td>{p.installment?.title || '—'}</td>
                    <td style={{ textTransform: 'uppercase' }}>{p.mode}</td>
                    <td className="num">{money(p.amount)}</td>
                    <td className="small">{p.collectedBy?.name || '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <Empty text="No payments in this period." />}
        </div>
      )}</Async>
    </>
  )
}

function Summary() {
  const state = useApi('/fees/summary')
  return (
    <Async state={state}>{(d) => (
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Batch</th><th className="num">Billed</th><th className="num">Collected</th><th className="num">Outstanding</th><th className="num">Overdue</th><th className="num">Collected %</th></tr></thead>
            <tbody>
              {d.byBatch.map((b) => (
                <tr key={b.batch}><td>{b.batch}</td><td className="num">{money(b.billed)}</td><td className="num">{money(b.collected)}</td><td className="num">{money(b.outstanding)}</td><td className="num">{money(b.overdue)}</td><td className="num">{b.billed ? Math.round((b.collected / b.billed) * 100) : 0}%</td></tr>
              ))}
              <tr><th>Total</th><th className="num">{money(d.totals.billed)}</th><th className="num">{money(d.totals.collected)}</th><th className="num">{money(d.totals.outstanding)}</th><th className="num">{money(d.totals.overdue)}</th><th className="num">{d.totals.billed ? Math.round((d.totals.collected / d.totals.billed) * 100) : 0}%</th></tr>
            </tbody>
          </table>
        </div>
      </div>
    )}</Async>
  )
}

export default function Fees() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('dues')
  const [collect, setCollect] = useState(params.get('student') ? { student: params.get('student') } : null)
  const [version, setVersion] = useState(0)
  const summary = useApi(`/fees/summary?v=${version}`)
  const navigate = useNavigate()
  const todayTotal = (summary.data?.today || []).reduce((s, t) => s + t.total, 0)

  return (
    <>
      <PageHead title="Fees" subtitle="Installment plans, collections, receipts and dues — automatic reminders go out from Automation.">
        <button className="btn btn-primary" onClick={() => setCollect({})}><Plus size={16} /> Collect fee</button>
      </PageHead>
      {summary.data && (
        <div className="grid grid-4 mb">
          <StatTile icon={Wallet} label="Collected today" value={money(todayTotal)} foot={(summary.data.today || []).map((t) => `${t._id.toUpperCase()} ${money(t.total)}`).join(' · ') || 'No collections yet'} tone="good" />
          <StatTile icon={IndianRupee} label="Total collected" value={money(summary.data.totals.collected)} foot={`of ${money(summary.data.totals.billed)} billed`} />
          <StatTile icon={Receipt} label="Outstanding" value={money(summary.data.totals.outstanding)} />
          <StatTile icon={AlertTriangle} label="Overdue" value={money(summary.data.totals.overdue)} tone="bad" />
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'dues', label: 'Dues' }, { value: 'payments', label: 'Payments' }, { value: 'summary', label: 'Batch summary' }]} />
      <div key={version}>
        {tab === 'dues' && <Dues onCollect={(student) => setCollect({ student })} />}
        {tab === 'payments' && <Payments />}
        {tab === 'summary' && <Summary />}
      </div>
      {collect && (
        <CollectModal
          studentId={collect.student}
          onClose={() => { setCollect(null); if (params.get('student')) setParams({}) }}
          onSaved={(p) => { setCollect(null); setVersion((v) => v + 1); navigate(`/fees/receipt/${p._id}`) }}
        />
      )}
    </>
  )
}
