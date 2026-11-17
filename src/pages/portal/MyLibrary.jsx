import { useState } from 'react'
import { BookMarked, Library, Search } from 'lucide-react'
import { fmtDate, money } from '../../lib/format.js'
import { useScope } from '../../lib/scope.jsx'
import { Async, Badge, Empty, PageHead, StatTile, useApi } from '../../components/ui.jsx'

function Catalogue({ base }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const state = useApi(`${base}/library/books?q=${encodeURIComponent(term)}`)
  return (
    <div className="card">
      <div className="card-head"><h2 className="row"><Search size={17} /> Find a book</h2></div>
      <div className="card-body stack">
        <form className="row" onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()) }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, author or subject" />
          <button className="btn">Search</button>
        </form>
        <Async state={state}>{(books) => books.length ? (
          <div className="stack" style={{ gap: 8 }}>
            {books.map((b) => (
              <div key={b._id} className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="cell-title">{b.title}</div>
                  <div className="cell-sub">{[b.author, b.subject || b.category, b.shelf && `Shelf ${b.shelf}`].filter(Boolean).join(' · ')}</div>
                </div>
                <Badge tone={b.available ? 'good' : 'warn'}>{b.available ? `${b.available} available` : 'All issued'}</Badge>
              </div>
            ))}
          </div>
        ) : <span className="muted">{term ? 'No book matches your search.' : 'The library catalogue is empty.'}</span>}</Async>
      </div>
    </div>
  )
}

// Books the student has borrowed, due dates and fines, and the catalogue.
export default function MyLibrary() {
  const { api: base, my } = useScope()
  const state = useApi(`${base}/library`)
  return (
    <>
      <PageHead title={my('library')} subtitle="Books issued to you, their due dates and any late fine. Search the catalogue to see what is on the shelves." />
      <Async state={state}>{(d) => (
        <>
          <div className="grid grid-3 mb">
            <StatTile icon={BookMarked} label="Books with you" value={d.current.length} foot={`Up to ${d.rules.maxBooks} at a time · ${d.rules.loanDays} days each`} />
            <StatTile icon={Library} label="Overdue" value={d.current.filter((i) => i.overdue).length} tone={d.current.some((i) => i.overdue) ? 'bad' : 'good'} foot={`Late fine ${money(d.rules.finePerDay)} per day`} />
            <StatTile label="Fine to pay" value={money(d.unpaidFines)} tone={d.unpaidFines ? 'bad' : 'good'} foot={d.unpaidFines ? 'Pay at the library counter' : 'Nothing due'} />
          </div>
          <div className="grid grid-2">
            <div className="stack">
              <div className="card">
                <div className="card-head"><h2>Borrowed now</h2></div>
                {d.current.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Book</th><th>Issued</th><th>Return by</th><th className="num">Fine</th></tr></thead>
                      <tbody>{d.current.map((i) => (
                        <tr key={i._id}>
                          <td><div className="cell-title">{i.book?.title || 'Book'}</div><div className="cell-sub">{i.book?.author}</div></td>
                          <td className="nowrap">{fmtDate(i.issuedOn)}</td>
                          <td className="nowrap">{fmtDate(i.dueOn)}{i.overdue && <div><Badge tone="bad">{i.lateDays} day{i.lateDays === 1 ? '' : 's'} late</Badge></div>}</td>
                          <td className="num">{i.fine ? money(i.fine) : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <Empty icon={BookMarked} text="No library books with you right now." />}
              </div>
              {d.history.length > 0 && (
                <div className="card">
                  <div className="card-head"><h2>Earlier books</h2></div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Book</th><th>Returned</th><th className="num">Fine</th></tr></thead>
                      <tbody>{d.history.map((i) => (
                        <tr key={i._id}>
                          <td><div className="cell-title">{i.book?.title || 'Book'}</div>{i.status === 'lost' && <Badge tone="bad">Lost</Badge>}</td>
                          <td className="nowrap">{fmtDate(i.returnedOn)}</td>
                          <td className="num">{i.fine ? <>{money(i.fine)} {i.finePaid ? <Badge tone="good">Paid</Badge> : <Badge tone="warn">Due</Badge>}</> : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <Catalogue base={base} />
          </div>
        </>
      )}</Async>
    </>
  )
}
