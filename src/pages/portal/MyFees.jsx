import { Link } from 'react-router-dom'
import { fmtDate, money } from '../../lib/format.js'
import { Async, Empty, PageHead, StatTile, StatusBadge, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyFees() {
  const { api, to, my } = useScope()
  const state = useApi(`${api}/fees`)
  return (
    <>
      <PageHead title={my('fees')} subtitle="Pay at the office counter or by UPI; receipts appear here." />
      <Async state={state}>{({ installments, payments }) => {
        const balance = installments.reduce((s, i) => s + i.balance, 0)
        const paid = payments.reduce((s, p) => s + p.amount, 0)
        const overdue = installments.filter((i) => i.status === 'overdue').reduce((s, i) => s + i.balance, 0)
        return (
          <>
            <div className="grid grid-3 mb">
              <StatTile label="Paid so far" value={money(paid)} tone="good" />
              <StatTile label="Balance" value={money(balance)} />
              <StatTile label="Overdue" value={money(overdue)} tone={overdue ? 'bad' : undefined} />
            </div>
            <div className="grid grid-2">
              <div className="card">
                <div className="card-head"><h2>Installments</h2></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Installment</th><th>Due</th><th className="num">Amount</th><th className="num">Balance</th><th>Status</th></tr></thead>
                    <tbody>{installments.map((i) => (
                      <tr key={i._id}><td>{i.title}</td><td>{fmtDate(i.dueDate)}</td><td className="num">{money(i.amount - (i.discount || 0))}</td><td className="num">{money(i.balance)}</td><td><StatusBadge value={i.status} /></td></tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
              <div className="card">
                <div className="card-head"><h2>Receipts</h2></div>
                {payments.length ? (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="num">Amount</th></tr></thead>
                      <tbody>{payments.map((p) => (
                        <tr key={p._id}><td><Link className="mono" to={to(`fees/receipt/${p._id}`)}>{p.receiptNo}</Link></td><td>{fmtDate(p.paidOn)}</td><td style={{ textTransform: 'uppercase' }}>{p.mode}</td><td className="num">{money(p.amount)}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <Empty text="No payments yet." />}
              </div>
            </div>
          </>
        )
      }}</Async>
    </>
  )
}
