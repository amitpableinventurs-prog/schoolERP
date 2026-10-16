import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PayslipDoc, PrintBar } from '../../components/Documents.jsx'
import { Async, useApi } from '../../components/ui.jsx'

export default function PayslipPage() {
  const { id } = useParams()
  const state = useApi(`/payroll/payslips/${id}`)
  return (
    <>
      <PrintBar back={<Link to={`/payroll${state.data ? `?month=${state.data.payslip.month}` : ''}`} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Payroll</Link>} />
      <Async state={state}>{(d) => <PayslipDoc data={d} />}</Async>
    </>
  )
}

// A staff member's own payslip.
export function MyPayslip() {
  const { id } = useParams()
  const state = useApi(`/payroll/my/${id}`)
  return (
    <>
      <PrintBar back={<Link to="/payslips" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> My payslips</Link>} />
      <Async state={state}>{(d) => <PayslipDoc data={d} />}</Async>
    </>
  )
}
