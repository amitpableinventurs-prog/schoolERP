import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownCircle, ArrowUpCircle, BookText, Scale, Wallet } from 'lucide-react'
import { qs } from '../../lib/api.js'
import { compactMoney, money, monthName, today } from '../../lib/format.js'
import { BarChart, HBarList } from '../../components/charts.jsx'
import { Async, Field, PageHead, Segmented, StatTile, useApi } from '../../components/ui.jsx'

const pad = (n) => String(n).padStart(2, '0')
const lastDay = (y, m) => `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`

// Indian financial year runs April → March.
function rangeFor(preset) {
  const t = today()
  const [y, m] = t.split('-').map(Number)
  const fy = m >= 4 ? y : y - 1
  if (preset === 'month') return { from: `${t.slice(0, 7)}-01`, to: t }
  if (preset === 'last') {
    const ly = m === 1 ? y - 1 : y
    const lm = m === 1 ? 12 : m - 1
    return { from: `${ly}-${pad(lm)}-01`, to: lastDay(ly, lm) }
  }
  if (preset === 'fy') return { from: `${fy}-04-01`, to: t }
  if (preset === 'lastfy') return { from: `${fy - 1}-04-01`, to: `${fy}-03-31` }
  return null
}

const shortMonth = (m) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short' })
}

export default function FinanceOverview() {
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState(rangeFor('month'))
  const range = rangeFor(preset) || custom
  const state = useApi(`/finance/summary${qs(range)}`)
  return (
    <>
      <PageHead title="Finance Overview" subtitle="Money in (fees, transport, other income) against money out (salaries, advances, expenses).">
        <Link className="btn" to="/finance/ledger"><BookText size={14} /> Income & Expenses</Link>
        <Link className="btn" to="/payroll"><Wallet size={14} /> Payroll</Link>
      </PageHead>
      <div className="filters">
        <Segmented value={preset} onChange={setPreset} options={[{ value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: 'fy', label: 'This FY' }, { value: 'lastfy', label: 'Last FY' }, { value: 'custom', label: 'Custom' }]} />
        {preset === 'custom' && <>
          <Field label="From"><input className="input" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
        </>}
      </div>
      <Async state={state}>{(d) => {
        const incomeItems = [
          { label: 'Fee collection', value: d.income.fees },
          { label: 'Transport fees', value: d.income.transport },
          ...d.income.categories.map((c) => ({ label: c.category, value: c.total })),
        ].filter((i) => i.value > 0)
        const expenseItems = [
          { label: 'Salaries paid', value: d.expense.salaries },
          { label: 'Salary advances / loans', value: d.expense.advances },
          ...d.expense.categories.map((c) => ({ label: c.category, value: c.total })),
        ].filter((i) => i.value > 0).sort((a, b) => b.value - a.value)
        return (
          <>
            <div className="grid grid-4 mb">
              <StatTile icon={ArrowDownCircle} label="Income" value={money(d.income.total)} foot={`Fees ${compactMoney(d.income.fees)} · Other ${compactMoney(d.income.other + d.income.transport)}`} tone="good" />
              <StatTile icon={ArrowUpCircle} label="Expenses" value={money(d.expense.total)} foot={`Salaries ${compactMoney(d.expense.salaries)} · Other ${compactMoney(d.expense.other + d.expense.advances)}`} tone="bad" />
              <StatTile icon={Scale} label={d.net >= 0 ? 'Surplus' : 'Deficit'} value={`${d.net < 0 ? '−' : ''}${money(Math.abs(d.net))}`} foot={`${d.from} → ${d.to}`} tone={d.net >= 0 ? 'good' : 'bad'} />
              <StatTile icon={Wallet} label="Still to settle" value={money(d.receivable.fees + d.receivable.transport)} foot={`to collect · ${money(d.payable.salaries)} salary to pay (${d.payable.payslips} approved)`} />
            </div>
            <div className="grid grid-2 mb">
              <div className="card">
                <div className="card-head"><h2>Income by month</h2></div>
                <div className="card-pad"><BarChart title="Income by month" data={d.trend.map((t) => ({ label: shortMonth(t.month), value: t.income }))} format={money} axisFormat={compactMoney} /></div>
              </div>
              <div className="card">
                <div className="card-head"><h2>Expenses by month</h2></div>
                <div className="card-pad"><BarChart title="Expenses by month" data={d.trend.map((t) => ({ label: shortMonth(t.month), value: t.expense }))} format={money} axisFormat={compactMoney} /></div>
              </div>
            </div>
            <div className="grid grid-2 mb">
              <div className="card">
                <div className="card-head"><h2>Where money came from</h2><span className="sub">{money(d.income.total)}</span></div>
                <div className="card-pad">{incomeItems.length ? <HBarList items={incomeItems} format={money} /> : <p className="muted small">No income in this period.</p>}</div>
              </div>
              <div className="card">
                <div className="card-head"><h2>Where money went</h2><span className="sub">{money(d.expense.total)}</span></div>
                <div className="card-pad">{expenseItems.length ? <HBarList items={expenseItems} format={money} /> : <p className="muted small">No expenses in this period.</p>}</div>
              </div>
            </div>
            <div className="card">
              <div className="card-head"><h2>Month by month</h2></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Month</th><th className="num">Income</th><th className="num">Expenses</th><th className="num">Net</th></tr></thead>
                  <tbody>{[...d.trend].reverse().map((t) => (
                    <tr key={t.month}>
                      <td>{monthName(t.month)}</td>
                      <td className="num">{money(t.income)}</td>
                      <td className="num">{money(t.expense)}</td>
                      <td className="num" style={{ color: t.net < 0 ? 'var(--bad-text)' : 'var(--good-text)' }}><strong>{t.net < 0 ? '−' : ''}{money(Math.abs(t.net))}</strong></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          </>
        )
      }}</Async>
    </>
  )
}
