// Printable report card and fee receipt (shared by staff and student portal).
import { Printer } from 'lucide-react'
import { fmtDate, money, monthName, rupeesInWords, TYPE_LABEL } from '../lib/format.js'

export function PrintBar({ back }) {
  return (
    <div className="row between mb no-print">
      {back}
      <button className="btn btn-primary" onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</button>
    </div>
  )
}

function Letterhead({ institute, title, right }) {
  return (
    <div className="doc-head">
      <div>
        <h1>{institute.instituteName}</h1>
        <div className="muted">{institute.address}</div>
        <div className="muted">{[institute.phone, institute.email].filter(Boolean).join(' · ')}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <h2>{title}</h2>
        {right}
      </div>
    </div>
  )
}

export function ReportCardDoc({ data }) {
  const { exam, student, mark, outOf, attendance, institute } = data
  const maxBy = Object.fromEntries(exam.subjects.map((s) => [s.name, s.maxMarks]))
  return (
    <div className="doc">
      <Letterhead institute={institute} title="Report Card" right={<div className="muted">{exam.name} · {fmtDate(exam.date)}</div>} />
      <table>
        <tbody>
          <tr><th>Student</th><td>{student.name}</td><th>Admission no.</th><td>{student.admissionNo}</td></tr>
          <tr><th>Class / batch</th><td>{exam.batch.name} ({TYPE_LABEL[exam.batch.type]})</td><th>Roll no.</th><td>{student.rollNo}</td></tr>
          <tr><th>Guardian</th><td>{student.guardianName}</td><th>Attendance (90 days)</th><td>{attendance ? `${attendance.pct}% (${attendance.present}/${attendance.total})` : '—'}</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Subject</th><th style={{ textAlign: 'right' }}>Max</th><th style={{ textAlign: 'right' }}>Obtained</th><th style={{ textAlign: 'right' }}>%</th></tr></thead>
        <tbody>
          {mark.scores.map((s) => (
            <tr key={s.subject}><td>{s.subject}</td><td style={{ textAlign: 'right' }}>{maxBy[s.subject]}</td><td style={{ textAlign: 'right' }}>{s.marks}</td><td style={{ textAlign: 'right' }}>{Math.round((s.marks / maxBy[s.subject]) * 100)}%</td></tr>
          ))}
          <tr><th>Total</th><th style={{ textAlign: 'right' }}>{mark.max}</th><th style={{ textAlign: 'right' }}>{mark.total}</th><th style={{ textAlign: 'right' }}>{mark.percent}%</th></tr>
        </tbody>
      </table>
      <table>
        <tbody><tr><th>Grade</th><td>{mark.grade}</td><th>Rank</th><td>{mark.rank} of {outOf}</td><th>Result</th><td>{mark.percent >= (institute.passPercent || 35) ? 'PASS' : 'NEEDS IMPROVEMENT'}</td></tr></tbody>
      </table>
      <div style={{ marginTop: 14 }}>
        <strong>Teacher&apos;s remark</strong>
        <p style={{ marginTop: 4, minHeight: 40 }}>{mark.remark || '—'}</p>
      </div>
      <div className="row between" style={{ marginTop: 48 }}>
        <div>______________________<br />Class Teacher</div>
        <div>______________________<br />Parent / Guardian</div>
        <div>______________________<br />Principal / Director</div>
      </div>
    </div>
  )
}

export function ReceiptDoc({ data }) {
  const { payment, balance, institute } = data
  const s = payment.student
  return (
    <div className="doc">
      <Letterhead institute={institute} title="Fee Receipt" right={<><div className="mono">{payment.receiptNo}</div><div className="muted">{fmtDate(payment.paidOn)}</div></>} />
      <table>
        <tbody>
          <tr><th>Received from</th><td>{s.name} ({s.admissionNo})</td></tr>
          <tr><th>Class / batch</th><td>{s.batch?.name}</td></tr>
          <tr><th>Towards</th><td>{payment.installment?.title || 'Fee payment'}</td></tr>
          <tr><th>Payment mode</th><td style={{ textTransform: 'uppercase' }}>{payment.mode}{payment.reference ? ` · Ref ${payment.reference}` : ''}</td></tr>
          <tr><th>Amount received</th><td><strong style={{ fontSize: 18 }}>{money(payment.amount)}</strong></td></tr>
          <tr><th>Balance after this payment</th><td>{money(balance)}</td></tr>
          {payment.note && <tr><th>Note</th><td>{payment.note}</td></tr>}
        </tbody>
      </table>
      <div className="row between" style={{ marginTop: 40 }}>
        <div className="muted small">Collected by {payment.collectedBy?.name || 'Office'} · Computer generated receipt</div>
        <div>______________________<br />Authorised signatory</div>
      </div>
    </div>
  )
}

export function PayslipDoc({ data }) {
  const { payslip: p, staff, bank, institute } = data
  const earnings = [...(p.earnings || []), ...(p.additions || [])]
  const deductions = [...(p.deductions || []), ...(p.extraDeductions || []), ...(p.advanceRecovery || []).map((r) => ({ name: 'Advance / loan recovery', amount: r.amount }))]
  const rows = Math.max(earnings.length, deductions.length)
  const right = { textAlign: 'right' }
  return (
    <div className="doc">
      <Letterhead institute={institute} title="Salary Slip" right={<><div className="muted">{monthName(p.month)}</div>{p.slipNo && <div className="mono">{p.slipNo}</div>}</>} />
      <table>
        <tbody>
          <tr><th>Employee</th><td>{p.staffName}</td><th>Designation</th><td>{p.designation || '—'}</td></tr>
          <tr><th>Department</th><td>{p.department || '—'}</td><th>Date of joining</th><td>{fmtDate(staff?.joiningDate)}</td></tr>
          <tr><th>Working days</th><td>{p.workingDays}</td><th>Paid days {p.workingDays - p.paidDays > 0 ? '(LOP)' : ''}</th><td>{p.paidDays}{p.workingDays - p.paidDays > 0 ? ` (${p.workingDays - p.paidDays} LOP)` : ''}</td></tr>
          <tr><th>PAN</th><td>{bank?.pan || '—'}</td><th>UAN</th><td>{bank?.uan || '—'}</td></tr>
          <tr><th>Bank</th><td>{bank?.bankName || '—'}</td><th>Account no.</th><td className="mono">{bank?.accountNo || '—'}</td></tr>
        </tbody>
      </table>
      <table>
        <thead><tr><th>Earnings</th><th style={right}>Amount</th><th>Deductions</th><th style={right}>Amount</th></tr></thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              <td>{earnings[i]?.name || ''}</td><td style={right}>{earnings[i] ? money(earnings[i].amount) : ''}</td>
              <td>{deductions[i]?.name || ''}</td><td style={right}>{deductions[i] ? money(deductions[i].amount) : ''}</td>
            </tr>
          ))}
          <tr><th>Gross earnings</th><th style={right}>{money(p.gross)}</th><th>Total deductions</th><th style={right}>{money(p.totalDeductions)}</th></tr>
        </tbody>
      </table>
      <table>
        <tbody>
          <tr><th style={{ width: '30%' }}>Net pay</th><td><strong style={{ fontSize: 18 }}>{money(p.net)}</strong><div className="muted">{rupeesInWords(p.net)}</div></td></tr>
          {p.status === 'paid' && <tr><th>Paid on</th><td>{fmtDate(p.paidOn)} · <span style={{ textTransform: 'uppercase' }}>{p.mode}</span>{p.reference ? ` · Ref ${p.reference}` : ''}</td></tr>}
          {p.note && <tr><th>Note</th><td>{p.note}</td></tr>}
        </tbody>
      </table>
      <div className="row between" style={{ marginTop: 40 }}>
        <div className="muted small">Computer generated salary slip{p.status !== 'paid' ? ` · ${p.status.toUpperCase()}` : ''}</div>
        <div>______________________<br />Authorised signatory</div>
      </div>
    </div>
  )
}
