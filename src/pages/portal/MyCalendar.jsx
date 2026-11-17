import { useState } from 'react'
import { useScope } from '../../lib/scope.jsx'
import MonthCalendar, { thisMonth } from '../../components/MonthCalendar.jsx'
import { Async, PageHead, useApi } from '../../components/ui.jsx'

// Holidays, events, PTMs and exam papers of the student's class.
export default function MyCalendar() {
  const { api } = useScope()
  const [month, setMonth] = useState(thisMonth)
  const state = useApi(`${api}/calendar?month=${month}`)
  return (
    <>
      <PageHead title="Academic calendar" subtitle="Holidays, events, parent-teacher meetings and exam dates. It updates as soon as the school adds something." />
      <Async state={state}>{(d) => <MonthCalendar month={month} items={d.items} onMonthChange={setMonth} />}</Async>
    </>
  )
}
