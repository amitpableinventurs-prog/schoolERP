import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PrintBar, ReceiptDoc } from '../../components/Documents.jsx'
import { Async, useApi } from '../../components/ui.jsx'

export default function ReceiptPage() {
  const { id } = useParams()
  const state = useApi(`/fees/receipt/${id}`)
  return (
    <>
      <PrintBar back={<Link to="/fees" className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Fees</Link>} />
      <Async state={state}>{(d) => <ReceiptDoc data={d} />}</Async>
    </>
  )
}
