import TimetableGrid from '../../components/TimetableGrid.jsx'
import { Async, PageHead, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyTimetable() {
  const { api, my } = useScope()
  const state = useApi(`${api}/timetable`)
  return (
    <>
      <PageHead title={my('timetable')} />
      <Async state={state}>{(slots) => <div className="card card-pad"><TimetableGrid slots={slots} /></div>}</Async>
    </>
  )
}
