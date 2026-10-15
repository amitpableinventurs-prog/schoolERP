import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PrintBar, ReceiptDoc } from '../../components/Documents.jsx'
import { Async, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyReceipt() {
  const { id } = useParams()
  const { api, to } = useScope()
  const state = useApi(`${api}/fees/receipt/${id}`)
  return (
    <>
      <PrintBar back={<Link to={to('fees')} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Fees</Link>} />
      <Async state={state}>{(d) => <ReceiptDoc data={d} />}</Async>
    </>
  )
}
