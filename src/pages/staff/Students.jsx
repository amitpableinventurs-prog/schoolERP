import { useDeferredValue, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Plus } from 'lucide-react'
import { qs } from '../../lib/api.js'
import { TYPE_LABEL } from '../../lib/format.js'
import StudentForm from '../../components/StudentForm.jsx'
import { Async, BatchSelect, Empty, PageHead, SearchInput, Segmented, StatusBadge, useApi } from '../../components/ui.jsx'

function exportCsv(rows) {
  const head = ['Admission No', 'Name', 'Batch', 'Type', 'Roll', 'Gender', 'Phone', 'Guardian', 'Guardian Phone', 'Status']
  const lines = rows.map((s) => [s.admissionNo, s.name, s.batch?.name, s.batch?.type, s.rollNo, s.gender, s.phone, s.guardianName, s.guardianPhone, s.status])
  const csv = [head, ...lines].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'students.csv' })
  a.click()
  URL.revokeObjectURL(url)
}

export default function Students() {
  const [params] = useSearchParams()
  const [type, setType] = useState('')
  const [batch, setBatch] = useState(params.get('batch') || '')
  const [status, setStatus] = useState('active')
  const [q, setQ] = useState('')
  const query = useDeferredValue(q)
  const [adding, setAdding] = useState(false)
  const navigate = useNavigate()
  const state = useApi(`/students${qs({ type, batch, status, q: query })}`)

  return (
    <>
      <PageHead title="Students" subtitle="Everyone enrolled across school classes, college courses and coaching batches.">
        <button className="btn" onClick={() => state.data && exportCsv(state.data)}><Download size={15} /> Export CSV</button>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> New admission</button>
      </PageHead>
      <div className="filters">
        <Segmented value={type} onChange={(v) => { setType(v); setBatch('') }} options={[{ value: '', label: 'All' }, { value: 'school', label: 'School' }, { value: 'college', label: 'College' }, { value: 'coaching', label: 'Coaching' }]} />
        <BatchSelect value={batch} onChange={setBatch} type={type || undefined} />
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="passed">Passed out</option><option value="dropped">Dropped</option>
        </select>
        <SearchInput value={q} onChange={setQ} placeholder="Name, admission no., phone…" />
      </div>
      <Async state={state}>{(rows) => (
        <div className="card">
          <div className="card-head"><span className="sub">{rows.length} students</span></div>
          {rows.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Admission no.</th><th>Class / batch</th><th>Roll</th><th>Guardian</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s._id} className="clickable" onClick={() => navigate(`/students/${s._id}`)}>
                      <td><Link to={`/students/${s._id}`} className="cell-title" onClick={(e) => e.stopPropagation()}>{s.name}</Link><div className="cell-sub">{s.phone}</div></td>
                      <td className="mono">{s.admissionNo}</td>
                      <td>{s.batch?.name}<div className="cell-sub">{TYPE_LABEL[s.batch?.type]}</div></td>
                      <td className="mono">{s.rollNo}</td>
                      <td>{s.guardianName}<div className="cell-sub">{s.guardianPhone}</div></td>
                      <td><StatusBadge value={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty text="No students match these filters." />}
        </div>
      )}</Async>
      {adding && <StudentForm onClose={() => setAdding(false)} onSaved={(s) => { setAdding(false); navigate(`/students/${s._id}`) }} />}
    </>
  )
}
