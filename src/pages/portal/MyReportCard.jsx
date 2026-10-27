import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PrintBar } from '../../components/Documents.jsx'
import { ReportCardDoc } from '../../components/ExamDocs.jsx'
import { Async, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyReportCard() {
  const { exam } = useParams()
  const { api, to } = useScope()
  const state = useApi(`${api}/results/${exam}`)
  return (
    <>
      <PrintBar back={<Link to={to('results')} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Results</Link>} />
      <Async state={state}>{(d) => <ReportCardDoc data={d} />}</Async>
    </>
  )
}
