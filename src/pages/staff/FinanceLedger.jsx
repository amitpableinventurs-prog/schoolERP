import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { useAuth, WING_LABEL } from '../../lib/auth.jsx'
import { fmtDate, money, today } from '../../lib/format.js'
import { Async, Confirm, Empty, Field, Modal, PageHead, SearchInput, Segmented, StatusBadge, useAction, useApi } from '../../components/ui.jsx'

const monthStart = () => `${today().slice(0, 7)}-01`

function EntryForm({ item, type, categories, onClose, onSaved }) {
  const { user } = useAuth()
  const wings = user.wings || ['school', 'college', 'coaching']
  const [form, setForm] = useState(item
    ? { ...item, wing: item.wing || '' }
    : { type, category: '', amount: '', date: today(), mode: 'cash', party: '', reference: '', note: '', wing: user.wings?.length === 1 ? user.wings[0] : '' })
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const options = categories?.[form.type] || []
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, amount: Number(form.amount), wing: form.wing || null }
    const ok = await run(() => (item ? api.put(`/finance/entries/${item._id}`, body) : api.post('/finance/entries', body)), 'Saved.')
    if (ok) onSaved()
  }
  const isIncome = form.type === 'income'
  return (
    <Modal title={item ? `Edit ${item.voucherNo || 'entry'}` : isIncome ? 'Record income' : 'Record expense'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="entry-form" disabled={busy}>Save</button></>}>
      <form id="entry-form" className="form-grid" onSubmit={submit}>
        {item && <Field label="Type"><select className="select" value={form.type} onChange={set('type')}><option value="expense">Expense</option><option value="income">Income</option></select></Field>}
        <Field label="Category *">
          <input className="input" list="finance-categories" value={form.category} onChange={set('category')} placeholder="Choose or type" required />
          <datalist id="finance-categories">{options.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Amount (₹) *"><input className="input" type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} required /></Field>
        <Field label="Date"><input className="input" type="date" value={form.date} onChange={set('date')} required /></Field>
        <Field label="Mode">
          <select className="select" value={form.mode} onChange={set('mode')}>
            {['cash', 'upi', 'card', 'bank', 'cheque'].map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
          </select>
        </Field>
        <Field label={isIncome ? 'Received from' : 'Paid to'}><input className="input" value={form.party || ''} onChange={set('party')} /></Field>
        <Field label="Bill / cheque / ref no."><input className="input" value={form.reference || ''} onChange={set('reference')} /></Field>
        <Field label="Wing" hint={user.wings ? undefined : 'Blank = whole institute'}>
          <select className="select" value={form.wing} onChange={set('wing')} required={!!user.wings && user.wings.length > 1}>
            {!user.wings && <option value="">Whole institute</option>}
            {user.wings?.length > 1 && <option value="">Choose…</option>}
            {wings.map((w) => <option key={w} value={w}>{WING_LABEL[w]}</option>)}
          </select>
        </Field>
        <Field label="Note" full><input className="input" value={form.note || ''} onChange={set('note')} /></Field>
      </form>
    </Modal>
  )
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

function downloadCsv(rows, from, to) {
  const head = ['Date', 'Voucher', 'Type', 'Category', 'Amount', 'Mode', 'Party', 'Reference', 'Wing', 'Note', 'Entered by']
  const body = rows.map((e) => [e.date, e.voucherNo, e.type, e.category, e.amount, e.mode, e.party, e.reference, e.wing || 'institute', e.note, e.createdByName])
  const csv = [head, ...body].map((r) => r.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `ledger-${from}-to-${to}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

export default function FinanceLedger() {
  const [params, setParams] = useSearchParams()
  const [type, setType] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [q, setQ] = useState('')
  const categories = useApi('/finance/categories')
  const state = useApi(`/finance/entries${qs({ type, category, from, to, q })}`)
  const adding = params.get('add')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()
  const closeAdd = () => setParams({})
  const saved = () => { setEditing(null); closeAdd(); state.reload(); categories.reload() }
  const allCats = [...new Set([...(categories.data?.expense || []), ...(categories.data?.income || [])])].sort()

  return (
    <>
      <PageHead title="Income & Expenses" subtitle="Day-to-day spending (rent, electricity, repairs…) and other income (donations, sales…). Fees and salaries are tracked in their own modules.">
        <button className="btn" onClick={() => setParams({ add: 'income' })}><Plus size={15} /> Income</button>
        <button className="btn btn-primary" onClick={() => setParams({ add: 'expense' })}><Minus size={15} /> Expense</button>
      </PageHead>
      <div className="filters">
        <Segmented value={type} onChange={setType} options={[{ value: '', label: 'All' }, { value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }]} />
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        <SearchInput value={q} onChange={setQ} placeholder="Party, bill no., note…" />
      </div>
      <Async state={state}>{(rows) => {
        if (!rows.length) return <Empty text="No entries in this period." />
        const income = rows.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0)
        const expense = rows.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
        return (
          <>
            <div className="grid grid-3 mb">
              <div className="card card-pad"><div className="small muted">Income</div><h2 style={{ color: 'var(--good-text)' }}>{money(income)}</h2></div>
              <div className="card card-pad"><div className="small muted">Expenses</div><h2 style={{ color: 'var(--bad-text)' }}>{money(expense)}</h2></div>
              <div className="card card-pad"><div className="small muted">Difference</div><h2>{income - expense < 0 ? '−' : ''}{money(Math.abs(income - expense))}</h2></div>
            </div>
            <div className="card">
              <div className="card-head"><h2>{rows.length} entries</h2><button className="btn btn-sm" onClick={() => downloadCsv(rows, from, to)}><Download size={13} /> Export CSV</button></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Date</th><th>Voucher</th><th>Category</th><th>Party</th><th>Mode</th><th>Wing</th><th className="num">Amount</th><th /></tr></thead>
                  <tbody>{rows.map((e) => (
                    <tr key={e._id}>
                      <td className="nowrap">{fmtDate(e.date)}</td>
                      <td className="mono small">{e.voucherNo}</td>
                      <td><div className="row" style={{ gap: 6 }}><StatusBadge value={e.type} /> {e.category}</div>{e.note && <div className="cell-sub">{e.note}</div>}</td>
                      <td>{e.party || '—'}{e.reference && <div className="cell-sub">Ref {e.reference}</div>}</td>
                      <td>{e.mode?.toUpperCase()}</td>
                      <td>{e.wing ? WING_LABEL[e.wing] : <span className="muted">Institute</span>}</td>
                      <td className="num" style={{ color: e.type === 'income' ? 'var(--good-text)' : 'var(--bad-text)' }}><strong>{e.type === 'income' ? '+' : '−'}{money(e.amount)}</strong></td>
                      <td className="nowrap">
                        <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(e)} aria-label="Edit"><Pencil size={14} /></button>
                        <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(e)} aria-label="Delete"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>
        )
      }}</Async>
      {(adding === 'income' || adding === 'expense') && <EntryForm type={adding} categories={categories.data} onClose={closeAdd} onSaved={saved} />}
      {editing && <EntryForm item={editing} categories={categories.data} onClose={() => setEditing(null)} onSaved={saved} />}
      {deleting && <Confirm text={`Delete ${deleting.voucherNo} — ${deleting.category} ${money(deleting.amount)}?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => {
        if (await run(() => api.del(`/finance/entries/${deleting._id}`), 'Deleted.')) { setDeleting(null); state.reload() }
      }} />}
    </>
  )
}
