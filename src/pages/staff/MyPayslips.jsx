import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { fmtDate, money, monthName } from '../../lib/format.js'
import { Async, Empty, PageHead, StatusBadge, useApi } from '../../components/ui.jsx'

export default function MyPayslips() {
  const state = useApi('/payroll/my')
  return (
    <>
      <PageHead title="My Payslips" subtitle="Your salary slips once the office approves them. Open one to print or save it as PDF." />
      <Async state={state}>{(d) => {
        if (!d.linked) return <Empty text="Your login is not linked to a staff record yet. Ask the admin to link it under Settings → Users." />
        if (!d.payslips.length) return <Empty icon={FileText} text="No payslips yet." />
        return (
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Month</th><th>Slip no.</th><th className="num">Gross</th><th className="num">Deductions</th><th className="num">Net pay</th><th>Status</th><th /></tr></thead>
                <tbody>{d.payslips.map((p) => (
                  <tr key={p._id}>
                    <td><strong>{monthName(p.month)}</strong></td>
                    <td className="mono small">{p.slipNo}</td>
                    <td className="num">{money(p.gross)}</td>
                    <td className="num">{money(p.totalDeductions)}</td>
                    <td className="num"><strong>{money(p.net)}</strong></td>
                    <td><StatusBadge value={p.status} />{p.paidOn && <div className="cell-sub">{fmtDate(p.paidOn)}</div>}</td>
                    <td><Link className="btn btn-sm" to={`/payslips/${p._id}`}><FileText size={13} /> View</Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )
      }}</Async>
    </>
  )
}
