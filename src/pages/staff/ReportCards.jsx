import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { PrintBar } from '../../components/Documents.jsx'
import { ReportCardDoc } from '../../components/ExamDocs.jsx'
import { Async, Empty, useApi } from '../../components/ui.jsx'

// Every report card of one exam, one per printed page.
export default function ReportCards() {
  const { id } = useParams()
  const state = useApi(`/exams/${id}/report-cards`)
  return (
    <>
      <PrintBar back={<Link to={`/exams/${id}`} className="btn btn-ghost btn-sm"><ArrowLeft size={15} /> Marks sheet</Link>} />
      <Async state={state}>{(cards) => cards.length ? (
        <div className="doc-stack">{cards.map((d) => <ReportCardDoc key={d.student._id} data={d} />)}</div>
      ) : <Empty text="No marks entered yet." />}</Async>
    </>
  )
}
