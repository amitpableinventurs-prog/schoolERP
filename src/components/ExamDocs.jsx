// Printable exam documents: report card, admit card and combined term report.
import { fmtDate, timeRange, TYPE_LABEL } from '../lib/format.js'
import { Letterhead } from './Documents.jsx'

const R = { textAlign: 'right' }
const RESULT_LABEL = { pass: 'PASS', fail: 'NEEDS IMPROVEMENT', absent: 'ABSENT' }

function Signatures({ left = 'Class Teacher', middle = 'Parent / Guardian', right = 'Principal / Director' }) {
  return (
    <div className="row between" style={{ marginTop: 48 }}>
      <div>______________________<br />{left}</div>
      {middle && <div>______________________<br />{middle}</div>}
      <div>______________________<br />{right}</div>
    </div>
  )
}

function GradeKey({ scale }) {
  const bands = [...scale.bands].sort((a, b) => b.min - a.min)
  return (
    <div className="small muted" style={{ marginTop: 10 }}>
      <strong>Grading ({scale.name}):</strong>{' '}
      {bands.map((b, i) => `${b.grade} ${b.min}%${i ? `–${bands[i - 1].min}%` : '+'}`).join(' · ')} · Pass {scale.passPercent}%
    </div>
  )
}

export function ReportCardDoc({ data }) {
  const { exam, student, mark, outOf, attendance, institute, scale } = data
  const bySubject = Object.fromEntries(exam.subjects.map((s) => [s.name, s]))
  const passPercent = scale?.passPercent ?? institute.passPercent ?? 35
  const passMark = (s) => s.passMarks ?? Math.ceil((s.maxMarks * passPercent) / 100)
  const result = mark.result || (mark.percent >= passPercent ? 'pass' : 'fail')
  const band = scale?.bands?.find((b) => b.grade === mark.grade)
  return (
    <div className="doc">
      <Letterhead institute={institute} title="Report Card" right={<div className="muted">{exam.name}{exam.term ? ` · ${exam.term}` : ''} · {fmtDate(exam.date)}</div>} />
      <table>
        <tbody>
          <tr><th>Student</th><td>{student.name}</td><th>Admission no.</th><td>{student.admissionNo}</td></tr>
          <tr><th>Class / batch</th><td>{exam.batch.name} ({TYPE_LABEL[exam.batch.type]})</td><th>Roll no.</th><td>{student.rollNo}</td></tr>
          <tr><th>Guardian</th><td>{student.guardianName}</td><th>Attendance (90 days)</th><td>{attendance ? `${attendance.pct}% (${attendance.present}/${attendance.total})` : '—'}</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Subject</th><th style={R}>Max</th><th style={R}>Pass</th><th style={R}>Obtained</th><th style={R}>%</th></tr></thead>
        <tbody>
          {mark.scores.filter((s) => bySubject[s.subject]).map((s) => {
            const sub = bySubject[s.subject]
            return (
              <tr key={s.subject}>
                <td>{s.subject}{mark.failedIn?.includes(s.subject) ? ' *' : ''}</td>
                <td style={R}>{sub.maxMarks}</td>
                <td style={R}>{passMark(sub)}</td>
                <td style={R}>{s.absent ? 'AB' : s.marks}</td>
                <td style={R}>{s.absent ? '—' : `${Math.round((s.marks / sub.maxMarks) * 100)}%`}</td>
              </tr>
            )
          })}
          <tr><th>Total</th><th style={R}>{mark.max}</th><th /><th style={R}>{mark.total}</th><th style={R}>{mark.percent}%</th></tr>
        </tbody>
      </table>
      <table>
        <tbody><tr>
          <th>Grade</th><td>{mark.grade}{band?.remark ? ` (${band.remark})` : ''}</td>
          {mark.gpa != null && <><th>Grade point</th><td>{mark.gpa}</td></>}
          <th>Rank</th><td>{mark.rank ?? '—'} of {outOf}</td>
          <th>Result</th><td>{RESULT_LABEL[result]}</td>
        </tr></tbody>
      </table>
      {mark.failedIn?.length > 0 && <p className="small" style={{ marginTop: 6 }}>* Below pass marks in: {mark.failedIn.join(', ')}</p>}
      <div style={{ marginTop: 14 }}>
        <strong>Teacher&apos;s remark</strong>
        <p style={{ marginTop: 4, minHeight: 40 }}>{mark.remark || '—'}</p>
      </div>
      {scale?.bands?.length > 0 && <GradeKey scale={scale} />}
      <Signatures />
    </div>
  )
}

const DEFAULT_ADMIT_RULES = [
  'Bring this admit card to every paper; you will not be allowed in without it.',
  'Reach the exam room 15 minutes before the start time.',
  'Mobile phones, smart watches and notes are not allowed in the exam room.',
  'Use only blue or black pen. Write nothing on the question paper except your roll number.',
].join('\n')

export function AdmitCardDoc({ exam, student, institute }) {
  const papers = [...exam.subjects].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
  return (
    <div className="doc admit-card">
      <Letterhead institute={institute} title="Admit Card" right={<div className="muted">{exam.name}{exam.term ? ` · ${exam.term}` : ''}<br />Session {institute.academicYear}</div>} />
      <div className="admit-top">
        <table style={{ marginTop: 0 }}>
          <tbody>
            <tr><th>Candidate</th><td><strong>{student.name}</strong></td><th>Roll no.</th><td><strong>{student.rollNo ?? '—'}</strong></td></tr>
            <tr><th>Admission no.</th><td>{student.admissionNo}</td><th>Class / batch</th><td>{exam.batch.name}</td></tr>
            <tr><th>Guardian</th><td>{student.guardianName || '—'}</td><th>Date of birth</th><td>{student.dob ? fmtDate(student.dob) : '—'}</td></tr>
          </tbody>
        </table>
        <div className="admit-photo">Affix<br />photograph</div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th>Room</th><th>Invigilator&apos;s sign</th></tr></thead>
        <tbody>{papers.map((p) => (
          <tr key={p._id || p.name}><td className="nowrap">{fmtDate(p.date)}</td><td className="nowrap">{timeRange(p)}</td><td>{p.name}</td><td>{p.room || '—'}</td><td style={{ width: 120 }} /></tr>
        ))}</tbody>
      </table>
      <div style={{ marginTop: 12 }}>
        <strong>Instructions</strong>
        <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
          {(exam.instructions || DEFAULT_ADMIT_RULES).split('\n').filter((l) => l.trim()).map((l, i) => <li key={i}>{l.replace(/^[-•*]\s*/, '')}</li>)}
        </ul>
      </div>
      <Signatures left="Candidate" middle="Class Teacher" right="Controller of Examinations" />
    </div>
  )
}

export function TermReportDoc({ data, row }) {
  const { batch, exams, subjects, scale, institute, outOf } = data
  const weightTotal = exams.reduce((t, e) => t + e.weight, 0) || 1
  const terms = [...new Set(exams.map((e) => e.term).filter(Boolean))].join(', ')
  return (
    <div className="doc">
      <Letterhead institute={institute} title="Progress Report" right={<div className="muted">Session {institute.academicYear}{terms ? <><br />{terms}</> : null}</div>} />
      <table>
        <tbody>
          <tr><th>Student</th><td>{row.student.name}</td><th>Admission no.</th><td>{row.student.admissionNo}</td></tr>
          <tr><th>Class / batch</th><td>{batch.name} ({TYPE_LABEL[batch.type]})</td><th>Roll no.</th><td>{row.student.rollNo}</td></tr>
          <tr><th>Guardian</th><td>{row.student.guardianName}</td><th>Attendance (year)</th><td>{row.attendance ? `${row.attendance.pct}% (${row.attendance.present}/${row.attendance.total})` : '—'}</td></tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            {exams.map((e) => <th key={e._id} style={R}>{e.name}<div className="muted" style={{ fontWeight: 400 }}>weight {Math.round((e.weight / weightTotal) * 100)}%</div></th>)}
            <th style={R}>Weighted %</th><th>Grade</th>
          </tr>
        </thead>
        <tbody>
          {row.subjects.map((s) => (
            <tr key={s.name}>
              <td>{s.name}{row.failedIn.includes(s.name) ? ' *' : ''}</td>
              {s.cells.map((c, i) => <td key={i} style={R}>{c ? `${c.marks}/${c.max}` : '—'}</td>)}
              <td style={R}>{s.percent != null ? `${s.percent}%` : '—'}</td>
              <td>{s.grade || '—'}</td>
            </tr>
          ))}
          <tr>
            <th>Exam %</th>
            {row.exams.map((m, i) => <th key={i} style={R}>{m?.percent != null ? `${m.percent}%` : '—'}</th>)}
            <th style={R}>{row.percent != null ? `${row.percent}%` : '—'}</th><th>{row.grade || '—'}</th>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody><tr>
          <th>Overall</th><td>{row.percent != null ? `${row.percent}%` : '—'}</td>
          <th>Grade</th><td>{row.grade || '—'}{row.remark ? ` (${row.remark})` : ''}</td>
          {row.gpa != null && <><th>GPA</th><td>{row.gpa}</td></>}
          <th>Rank</th><td>{row.rank ?? '—'} of {outOf}</td>
          <th>Result</th><td>{row.result ? RESULT_LABEL[row.result] : '—'}</td>
        </tr></tbody>
      </table>
      {row.failedIn.length > 0 && <p className="small" style={{ marginTop: 6 }}>* Below {scale.passPercent}% in: {row.failedIn.join(', ')}</p>}
      <p className="small muted" style={{ marginTop: 6 }}>{subjects.length} subjects. Each subject&apos;s percentage is the weighted average of the exams above; overall is the average of the subjects.</p>
      {scale?.bands?.length > 0 && <GradeKey scale={scale} />}
      <Signatures />
    </div>
  )
}
