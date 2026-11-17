import { useMemo, useState } from 'react'
import { BookMarked, BookPlus, BookUp, IndianRupee, Library, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { fmtDate, money, today } from '../../lib/format.js'
import { Async, Badge, Confirm, Empty, Field, Modal, PageHead, SearchInput, Segmented, StatTile, Tabs, useAction, useApi } from '../../components/ui.jsx'

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function BookForm({ book, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ title: '', author: '', isbn: '', accessionNo: '', publisher: '', category: '', subject: '', language: '', edition: '', shelf: '', copies: 1, price: '', notes: '', ...(book || {}) }))
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e) => {
    e.preventDefault()
    const body = { ...form, copies: Number(form.copies) || 0, price: form.price === '' ? '' : Number(form.price) }
    for (const k of ['_id', 'issued', 'available', 'createdAt', 'updatedAt', '__v']) delete body[k]
    if (await run(() => (book ? api.put(`/library/books/${book._id}`, body) : api.post('/library/books', body)), 'Book saved.')) onSaved()
  }
  return (
    <Modal title={book ? 'Edit book' : 'Add a book'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="book-form" disabled={busy}>Save</button></>}>
      <form id="book-form" className="form-grid" onSubmit={submit}>
        <Field label="Title *" full><input className="input" value={form.title} onChange={set('title')} required /></Field>
        <Field label="Author"><input className="input" value={form.author || ''} onChange={set('author')} /></Field>
        <Field label="Publisher"><input className="input" value={form.publisher || ''} onChange={set('publisher')} /></Field>
        <Field label="Category" hint="Textbook, Reference, Fiction…"><input className="input" value={form.category || ''} onChange={set('category')} list="book-categories" /></Field>
        <Field label="Subject"><input className="input" value={form.subject || ''} onChange={set('subject')} /></Field>
        <Field label="ISBN"><input className="input" value={form.isbn || ''} onChange={set('isbn')} /></Field>
        <Field label="Accession no."><input className="input" value={form.accessionNo || ''} onChange={set('accessionNo')} /></Field>
        <Field label="Copies *"><input className="input" type="number" min={0} value={form.copies} onChange={set('copies')} required /></Field>
        <Field label="Shelf / rack"><input className="input" value={form.shelf || ''} onChange={set('shelf')} /></Field>
        <Field label="Language"><input className="input" value={form.language || ''} onChange={set('language')} /></Field>
        <Field label="Edition"><input className="input" value={form.edition || ''} onChange={set('edition')} /></Field>
        <Field label="Price (₹)" hint="Charged if the book is lost"><input className="input" type="number" min={0} value={form.price ?? ''} onChange={set('price')} /></Field>
        <Field label="Notes" full><input className="input" value={form.notes || ''} onChange={set('notes')} /></Field>
        <datalist id="book-categories">{['Textbook', 'Reference', 'Fiction', 'Non-fiction', 'Competitive exams', 'Magazine', 'Children'].map((c) => <option key={c} value={c} />)}</datalist>
      </form>
    </Modal>
  )
}

function IssueForm({ rules, book: preset, onClose, onSaved }) {
  const books = useApi('/library/books')
  const students = useApi('/students?status=active')
  const staff = useApi('/staff?status=active')
  const [form, setForm] = useState({ book: preset?._id || '', memberType: 'student', student: '', staff: '', issuedOn: today(), dueOn: addDays(today(), rules?.loanDays || 14), notes: '' })
  const [q, setQ] = useState('')
  const [run, busy] = useAction()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const available = (books.data || []).filter((b) => b.available > 0 || b._id === form.book)
  const needle = q.trim().toLowerCase()
  const people = useMemo(() => {
    const list = form.memberType === 'student' ? students.data || [] : staff.data || []
    return needle ? list.filter((p) => `${p.name} ${p.admissionNo || ''} ${p.batch?.name || ''}`.toLowerCase().includes(needle)) : list
  }, [form.memberType, students.data, staff.data, needle])
  const submit = async (e) => {
    e.preventDefault()
    if (await run(() => api.post('/library/issues', form), 'Book issued.')) onSaved()
  }
  return (
    <Modal title="Issue a book" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="issue-form" disabled={busy}>Issue book</button></>}>
      <form id="issue-form" className="form-grid" onSubmit={submit}>
        <Field label="Book *" full>
          <select className="select" value={form.book} onChange={set('book')} required>
            <option value="">Choose a book…</option>
            {available.map((b) => <option key={b._id} value={b._id}>{b.title}{b.author ? ` — ${b.author}` : ''} ({b.available} left)</option>)}
          </select>
        </Field>
        <Field label="Issue to" full>
          <Segmented value={form.memberType} onChange={(v) => setForm({ ...form, memberType: v, student: '', staff: '' })} options={[{ value: 'student', label: 'Student' }, { value: 'staff', label: 'Staff' }]} />
        </Field>
        <Field label="Search" full><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={form.memberType === 'student' ? 'Name, admission no. or class' : 'Staff name'} /></Field>
        <Field label={form.memberType === 'student' ? 'Student *' : 'Staff member *'} full>
          <select className="select" value={form[form.memberType]} onChange={set(form.memberType)} required>
            <option value="">Choose…</option>
            {people.slice(0, 300).map((p) => <option key={p._id} value={p._id}>{p.name}{p.admissionNo ? ` · ${p.admissionNo}` : ''}{p.batch?.name ? ` · ${p.batch.name}` : p.designation ? ` · ${p.designation}` : ''}</option>)}
          </select>
        </Field>
        <Field label="Issued on"><input className="input" type="date" value={form.issuedOn} onChange={(e) => setForm({ ...form, issuedOn: e.target.value, dueOn: addDays(e.target.value, rules?.loanDays || 14) })} /></Field>
        <Field label="Return by"><input className="input" type="date" value={form.dueOn} min={form.issuedOn} onChange={set('dueOn')} /></Field>
        <p className="small muted full">Late fine: {money(rules?.finePerDay || 0)} per day · a student can keep {rules?.maxBooks || 3} books at a time.</p>
      </form>
    </Modal>
  )
}

function ReturnModal({ issue, onClose, onSaved }) {
  const [form, setForm] = useState({ finePaid: true, waive: false })
  const [run, busy] = useAction()
  const submit = async () => { if (await run(() => api.post(`/library/issues/${issue._id}/return`, form), 'Book taken back.')) onSaved() }
  return (
    <Modal title="Take the book back" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy}>Book returned</button></>}>
      <div className="stack">
        <p><strong>{issue.book?.title}</strong> from {issue.student?.name || issue.staff?.name}</p>
        <p className="small text-2">Issued {fmtDate(issue.issuedOn)} · due {fmtDate(issue.dueOn)}{issue.lateDays ? ` · ${issue.lateDays} days late` : ''}</p>
        {issue.fine > 0 ? (
          <>
            <div className="alert alert-error">Late fine: <strong>{money(issue.fine)}</strong></div>
            <label className="check"><input type="checkbox" checked={form.waive} onChange={(e) => setForm({ ...form, waive: e.target.checked })} /> Waive the fine</label>
            {!form.waive && <label className="check"><input type="checkbox" checked={form.finePaid} onChange={(e) => setForm({ ...form, finePaid: e.target.checked })} /> Fine collected now</label>}
          </>
        ) : <div className="alert alert-info small">Returned on time — no fine.</div>}
      </div>
    </Modal>
  )
}

function Issues({ rules, onChanged }) {
  const [status, setStatus] = useState('issued')
  const [q, setQ] = useState('')
  const state = useApi(`/library/issues${qs({ status, q })}`)
  const [returning, setReturning] = useState(null)
  const [lost, setLost] = useState(null)
  const [run, busy] = useAction()
  const after = () => { state.reload(); onChanged() }
  const act = async (url, msg) => { if (await run(() => api.post(url), msg)) after() }
  return (
    <>
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Book, student or staff…" />
        <Segmented value={status} onChange={setStatus} options={[{ value: 'issued', label: 'Out now' }, { value: 'overdue', label: 'Overdue' }, { value: 'unpaid', label: 'Fines due' }, { value: 'returned', label: 'Returned' }, { value: 'lost', label: 'Lost' }]} />
      </div>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Book</th><th>Member</th><th>Issued</th><th>Due / returned</th><th className="num">Fine</th><th /></tr></thead>
              <tbody>{rows.map((i) => (
                <tr key={i._id}>
                  <td><div className="cell-title">{i.book?.title || '—'}</div><div className="cell-sub">{[i.book?.author, i.book?.accessionNo && `#${i.book.accessionNo}`].filter(Boolean).join(' · ')}</div></td>
                  <td>{i.student ? <><div>{i.student.name}</div><div className="cell-sub">{i.student.admissionNo} · {i.student.batch?.name}</div></> : <><div>{i.staff?.name}</div><div className="cell-sub">Staff · {i.staff?.designation}</div></>}</td>
                  <td className="nowrap">{fmtDate(i.issuedOn)}</td>
                  <td className="nowrap">{i.status === 'issued' ? <>{fmtDate(i.dueOn)}{i.overdue && <div><Badge tone="bad">{i.lateDays} days late</Badge></div>}</> : <>{fmtDate(i.returnedOn)} {i.status === 'lost' && <Badge tone="bad">Lost</Badge>}</>}</td>
                  <td className="num">{i.fine ? <>{money(i.fine)}{i.status !== 'issued' && <div>{i.finePaid ? <Badge tone="good">Paid</Badge> : <Badge tone="warn">Due</Badge>}</div>}</> : '—'}</td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      {i.status === 'issued' && <button className="btn btn-sm btn-primary" onClick={() => setReturning(i)}><RotateCcw size={13} /> Return</button>}
                      {i.status === 'issued' && <button className="btn btn-sm" onClick={() => act(`/library/issues/${i._id}/renew`, 'Due date extended.')} disabled={busy}>Renew</button>}
                      {i.status === 'issued' && <button className="btn btn-sm btn-ghost" onClick={() => setLost(i)}>Lost</button>}
                      {i.status !== 'issued' && i.fine > 0 && !i.finePaid && <button className="btn btn-sm" onClick={() => act(`/library/issues/${i._id}/fine-paid`, 'Fine marked as paid.')} disabled={busy}><IndianRupee size={13} /> Paid</button>}
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty icon={BookMarked} text={status === 'issued' ? 'No books are out right now.' : 'Nothing here.'} />}</Async>
      {returning && <ReturnModal issue={returning} onClose={() => setReturning(null)} onSaved={() => { setReturning(null); after() }} />}
      {lost && <Confirm danger confirmLabel="Mark lost" text={`Mark "${lost.book?.title}" as lost? The book's price (${money(lost.book?.price || 0)}) is charged as a fine and one copy leaves the catalogue.`} busy={busy} onClose={() => setLost(null)} onConfirm={async () => { if (await run(() => api.post(`/library/issues/${lost._id}/lost`, {}), 'Marked as lost.')) { setLost(null); after() } }} />}
      <p className="small muted mt">Late fine: {money(rules?.finePerDay || 0)} per day. Loan period and fine can be changed by the super admin in Settings.</p>
    </>
  )
}

function Books({ rules, onChanged }) {
  const [q, setQ] = useState('')
  const state = useApi(`/library/books${qs({ q })}`)
  const [editing, setEditing] = useState(null)
  const [issuing, setIssuing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [run, busy] = useAction()
  const after = () => { state.reload(); onChanged() }
  return (
    <>
      <div className="filters">
        <SearchInput value={q} onChange={setQ} placeholder="Title, author, ISBN, subject…" />
        <button className="btn btn-primary" onClick={() => setEditing({})}><BookPlus size={15} /> Add book</button>
      </div>
      <Async state={state}>{(rows) => rows.length ? (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th>Category</th><th>Shelf</th><th className="num">Copies</th><th className="num">Available</th><th /></tr></thead>
              <tbody>{rows.map((b) => (
                <tr key={b._id}>
                  <td><div className="cell-title">{b.title}</div><div className="cell-sub">{[b.author, b.isbn && `ISBN ${b.isbn}`, b.accessionNo && `#${b.accessionNo}`].filter(Boolean).join(' · ')}</div></td>
                  <td className="small">{[b.category, b.subject].filter(Boolean).join(' · ') || '—'}</td>
                  <td>{b.shelf || '—'}</td>
                  <td className="num">{b.copies}</td>
                  <td className="num"><Badge tone={b.available ? 'good' : 'warn'}>{b.available}</Badge></td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <button className="btn btn-sm" onClick={() => setIssuing(b)} disabled={!b.available}><BookUp size={13} /> Issue</button>
                      <button className="btn btn-sm btn-ghost btn-icon" onClick={() => setEditing(b)} aria-label="Edit"><Pencil size={14} /></button>
                      <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => setDeleting(b)} aria-label="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      ) : <Empty icon={Library} text={q ? 'No book matches.' : 'The catalogue is empty. Add your first book.'} />}</Async>
      {editing && <BookForm book={editing._id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); after() }} />}
      {issuing && <IssueForm rules={rules} book={issuing} onClose={() => setIssuing(null)} onSaved={() => { setIssuing(null); after() }} />}
      {deleting && <Confirm text={`Delete "${deleting.title}" from the catalogue?`} busy={busy} onClose={() => setDeleting(null)} onConfirm={async () => { if (await run(() => api.del(`/library/books/${deleting._id}`), 'Book deleted.')) { setDeleting(null); after() } }} />}
    </>
  )
}

// Library: catalogue, issue / return, overdue books and fines.
export default function LibraryPage() {
  const summary = useApi('/library/summary')
  const [tab, setTab] = useState('issues')
  const [issuing, setIssuing] = useState(false)
  const [key, setKey] = useState(0)
  const s = summary.data
  const changed = () => summary.reload()
  return (
    <>
      <PageHead title="Library" subtitle="Book catalogue, issue and return, overdue books and late fines. Students and parents see their books in the app.">
        <button className="btn btn-primary" onClick={() => setIssuing(true)}><Plus size={16} /> Issue a book</button>
      </PageHead>
      <div className="grid grid-4 mb">
        <StatTile icon={Library} label="Titles" value={s?.titles ?? '—'} foot={s ? `${s.copies} copies` : ''} />
        <StatTile icon={BookUp} label="Books out" value={s?.issued ?? '—'} />
        <StatTile icon={BookMarked} label="Overdue" value={s?.overdue ?? '—'} tone={s?.overdue ? 'bad' : 'good'} foot={s?.runningFines ? `${money(s.runningFines)} fine running` : ''} />
        <StatTile icon={IndianRupee} label="Fines to collect" value={s ? money(s.unpaidFines) : '—'} tone={s?.unpaidFines ? 'bad' : undefined} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'issues', label: 'Issued books' }, { value: 'books', label: 'Catalogue' }]} />
      {tab === 'issues' ? <Issues key={key} rules={s?.settings} onChanged={changed} /> : <Books rules={s?.settings} onChanged={changed} />}
      {issuing && <IssueForm rules={s?.settings} onClose={() => setIssuing(false)} onSaved={() => { setIssuing(false); changed(); setKey((k) => k + 1) }} />}
    </>
  )
}
