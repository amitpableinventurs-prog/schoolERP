import { CalendarDays } from 'lucide-react'
import TimetableGrid from '../../components/TimetableGrid.jsx'
import { Async, Empty, PageHead, useApi } from '../../components/ui.jsx'
import { useScope } from '../../lib/scope.jsx'

export default function MyTimetable() {
  const { api, my } = useScope()
  const state = useApi(`${api}/timetable`)
  return (
    <>
      <PageHead title={my('timetable')} subtitle="Weekly class schedule with teachers and rooms. Today is shown first on a phone." />
      <Async state={state}>{(slots) => (slots.length
        ? <div className="card card-pad"><TimetableGrid slots={slots} todayFirst /></div>
        : <Empty icon={CalendarDays} text="The timetable for this class has not been published yet." />)}</Async>
    </>
  )
}
