import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PrintBar, ReportCardDoc } from '../../components/Documents.jsx'
import { Async, useApi } from '../../components/ui.jsx'

export default function ReportCardPage() {
  const { id, student } = useParams()
  const state = useApi(`/exams/${id}/report-card/${student}`)
  return (
    <>
      <PrintBar back={<Link to={`/exams/${id}`} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Marks sheet</Link>} />
      <Async state={state}>{(d) => <ReportCardDoc data={d} />}</Async>
    </>
  )
}
