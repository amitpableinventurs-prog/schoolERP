import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Sparkles } from 'lucide-react'
import { api, qs } from '../../lib/api.js'
import { money, waLink } from '../../lib/format.js'
import Markdown from '../../components/Markdown.jsx'
import { AiNotice, Async, BatchSelect, Empty, Modal, PageHead, PctBadge, Segmented, StatusBadge, useAction, useAiStatus, useApi, WhatsAppIcon } from '../../components/ui.jsx'

export default function Insights() {
  const [batch, setBatch] = useState('')
  const [level, setLevel] = useState('all')
  const state = useApi(`/insights/at-risk${qs({ batch })}`)
  const aiEnabled = useAiStatus()
  const [plan, setPlan] = useState(null)
  const [run, busy] = useAction()

  const openPlan = async (entry) => {
    setPlan({ entry, text: null })
    const result = await run(() => api.post(`/ai/risk-plan/${entry.student._id}`))
    setPlan(result ? { entry, text: result.plan } : null)
  }

  return (
    <>
      <PageHead title="Smart Insights" subtitle="Early-warning system: every active student is scored on attendance, marks trend and overdue fees." />
      <div className="alert alert-info mb">
        Risk score (0–100) adds up: attendance below the threshold, average marks below 50%, a 10%+ drop in the latest exam, and overdue fees. Use <strong>AI plan</strong> for a counselling plan and a parent message.
      </div>
      <div className="filters">
        <BatchSelect value={batch} onChange={setBatch} />
        <Segmented value={level} onChange={setLevel} options={[{ value: 'all', label: 'All' }, { value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
      </div>
      <Async state={state}>{(list) => {
        const rows = list.filter((r) => level === 'all' || r.level === level)
        return (
          <div className="card">
            {rows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Student</th><th>Batch</th><th>Risk</th><th className="num">Attendance</th><th className="num">Avg marks</th><th className="num">Overdue</th><th>Reasons</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.student._id}>
                        <td><Link className="cell-title" to={`/students/${r.student._id}`}>{r.student.name}</Link><div className="cell-sub">{r.student.admissionNo}</div></td>
                        <td>{r.student.batch?.name}</td>
                        <td><StatusBadge value={r.level} label={`${r.level} · ${r.score}`} /></td>
                        <td className="num"><PctBadge value={r.attendance} /></td>
                        <td className="num"><PctBadge value={r.avgMarks} warnBelow={50} badBelow={35} /></td>
                        <td className="num">{r.overdue ? money(r.overdue) : '—'}</td>
                        <td className="small text-2" style={{ minWidth: 220 }}>{r.reasons.join(' · ')}</td>
                        <td className="nowrap">
                          <button className="btn btn-sm btn-ai" onClick={() => openPlan(r)} disabled={aiEnabled === false}><Sparkles size={13} /> AI plan</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty text="No students in this risk group." />}
          </div>
        )
      }}</Async>
      <AiNotice enabled={aiEnabled} />
      {plan && (
        <Modal title={`Action plan — ${plan.entry.student.name}`} onClose={() => setPlan(null)} footer={plan.text && (
          <>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(plan.text)}><Copy size={15} /> Copy</button>
            {plan.entry.student.guardianPhone && <a className="btn btn-primary" target="_blank" rel="noreferrer" href={waLink(plan.entry.student.guardianPhone, '')}><WhatsAppIcon size={15} color="currentColor" /> WhatsApp parent</a>}
          </>
        )}>
          {busy || !plan.text ? <div className="loading"><span className="spinner" /> Claude is preparing a plan…</div> : <Markdown text={plan.text} />}
        </Modal>
      )}
    </>
  )
}
