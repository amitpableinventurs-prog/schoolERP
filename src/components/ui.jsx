/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Inbox, Search, X } from 'lucide-react'
import { api } from '../lib/api.js'

/* ── Data loading ── */

// GET a URL and keep the result. `version` changes after every completed load,
// so forms seeded from the data can use it as a React key to re-initialise.
export function useApi(url, { skip = false } = {}) {
  const [tick, setTick] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const key = url && !skip ? `${tick}|${url}` : null

  useEffect(() => {
    if (!key) return undefined
    let cancelled = false
    api.get(url).then(
      (data) => { if (!cancelled) setResult({ key, data, error: null }) },
      (error) => { if (!cancelled) setResult({ key, data: null, error: error.message }) }
    )
    // Ignore responses for a URL that has since changed.
    return () => { cancelled = true }
  }, [key, url])

  const loading = Boolean(key) && result.key !== key
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return {
    data: result.data,
    error: loading ? null : result.error,
    loading,
    version: result.key,
    reload,
    setData: (fn) => setResult((r) => ({ ...r, data: typeof fn === 'function' ? fn(r.data) : fn })),
  }
}

// Cached list of batches used by almost every filter dropdown.
let batchCache = null
export function useBatches() {
  const [batches, setBatches] = useState(batchCache || [])
  useEffect(() => {
    if (batchCache) return
    api.get('/batches/summary').then((list) => {
      batchCache = list
      setBatches(list)
    }).catch(() => {})
  }, [])
  return batches
}
export const clearBatchCache = () => { batchCache = null }

/* ── Toasts ── */

const ToastContext = createContext(() => {})
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const push = useCallback((message, type = 'info') => {
    const id = Math.random()
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type === 'error' ? 'toast-error' : ''}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  )
}
export const useToast = () => useContext(ToastContext)

// Wraps an async action with a busy flag and error toast.
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn, successMessage) => {
    setBusy(true)
    try {
      const result = await fn()
      if (successMessage) toast(successMessage)
      return result
    } catch (error) {
      toast(error.message, 'error')
      return undefined
    } finally {
      setBusy(false)
    }
  }, [toast])
  return [run, busy]
}

/* ── Building blocks ── */

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, size }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, hint, full, children }) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <em className="hint">{hint}</em>}
    </label>
  )
}

export function Loading({ text = 'Loading…' }) {
  return <div className="loading"><span className="spinner" /> {text}</div>
}

export function Empty({ text = 'Nothing here yet.', icon: Icon = Inbox, children }) {
  return (
    <div className="empty">
      <Icon size={28} />
      <div>{text}</div>
      {children && <div className="mt">{children}</div>}
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="alert alert-error row between">
      <span className="row"><AlertTriangle size={16} /> {error}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  )
}

// Standard loading / error / content switch for a useApi() result.
export function Async({ state, children }) {
  if (state.loading && !state.data) return <Loading />
  if (state.error) return <ErrorBox error={state.error} onRetry={state.reload} />
  if (!state.data) return null
  return children(state.data)
}

export function Badge({ tone, children, title }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`} title={title}>{children}</span>
}

const STATUS_TONE = {
  paid: 'good', due: 'info', overdue: 'bad', active: 'good', inactive: '', passed: 'info', dropped: 'bad',
  new: 'info', contacted: '', demo: 'ai', visited: 'warn', converted: 'good', lost: 'bad',
  open: 'warn', answered: 'good', draft: '', published: 'good', closed: '', pending: 'warn', sent: 'good', skipped: '',
  high: 'bad', medium: 'warn', low: 'info', school: 'info', college: 'ai', coaching: 'warn',
  approved: 'info', income: 'good', expense: 'bad', advance: 'warn', loan: 'ai',
}
export function StatusBadge({ value, label }) {
  if (!value) return null
  const tone = STATUS_TONE[value]
  const icon = value === 'paid' || value === 'sent' || value === 'converted' ? <CheckCircle2 size={12} /> : value === 'overdue' || value === 'high' ? <AlertTriangle size={12} /> : null
  return <Badge tone={tone}>{icon}{label || value.charAt(0).toUpperCase() + value.slice(1)}</Badge>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={`tab ${value === t.value ? 'active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="search">
      <Search size={15} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function BatchSelect({ value, onChange, allLabel = 'All batches', type, required, className = 'select' }) {
  const batches = useBatches().filter((b) => !type || b.type === type)
  const groups = ['school', 'college', 'coaching']
  return (
    <select className={className} value={value || ''} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{allLabel}</option>
      {groups.map((g) => {
        const list = batches.filter((b) => b.type === g)
        if (!list.length) return null
        return (
          <optgroup key={g} label={g.charAt(0).toUpperCase() + g.slice(1)}>
            {list.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </optgroup>
        )
      })}
    </select>
  )
}

// Checkboxes for wings; `allowed` limits which ones this user may tick.
export function WingPicker({ value = [], onChange, allowed = ['school', 'college', 'coaching'], disabled }) {
  const labels = { school: 'School', college: 'College', coaching: 'Coaching' }
  const toggle = (w) => onChange(value.includes(w) ? value.filter((x) => x !== w) : [...value, w])
  return (
    <div className="row" style={{ gap: 14 }}>
      {['school', 'college', 'coaching'].filter((w) => allowed.includes(w) || value.includes(w)).map((w) => (
        <label className="check" key={w}>
          <input type="checkbox" checked={value.includes(w)} disabled={disabled || !allowed.includes(w)} onChange={() => toggle(w)} /> {labels[w]}
        </label>
      ))}
    </div>
  )
}

export function WingBadges({ wings }) {
  if (!wings?.length) return <Badge tone="ai">Whole institute</Badge>
  return <>{wings.map((w) => <StatusBadge key={w} value={w} />)}</>
}

export function StatTile({ icon: Icon, label, value, foot, tone }) {
  const toneStyle = tone === 'bad' ? { background: 'var(--bad-soft)', color: 'var(--bad-text)' } : tone === 'good' ? { background: 'var(--good-soft)', color: 'var(--good-text)' } : tone === 'ai' ? { background: 'var(--violet-soft)', color: 'var(--violet-text)' } : undefined
  return (
    <div className="card stat">
      <div className="stat-label">{Icon && <span className="stat-icon" style={toneStyle}><Icon size={16} /></span>}{label}</div>
      <div className="stat-value">{value}</div>
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  )
}

export function Meter({ value, color }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0))
  return <div className="meter" aria-label={`${v}%`}><div style={{ width: `${v}%`, background: color }} /></div>
}

// Percentage with a color cue + text, never color alone.
export function PctBadge({ value, warnBelow = 75, badBelow = 60 }) {
  if (value == null) return <span className="muted">—</span>
  const tone = value < badBelow ? 'bad' : value < warnBelow ? 'warn' : 'good'
  return <Badge tone={tone}>{value}%</Badge>
}

export function Confirm({ text, onConfirm, onClose, busy, danger = true, confirmLabel = 'Delete' }) {
  return (
    <Modal title="Please confirm" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className={`btn ${danger ? 'btn-primary' : 'btn-primary'}`} style={danger ? { background: 'var(--bad)', borderColor: 'var(--bad)' } : undefined} onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
    </>}>
      <p>{text}</p>
    </Modal>
  )
}

export function AiNotice({ enabled }) {
  if (enabled !== false) return null
  return <div className="alert alert-ai">AI is not configured. Set <code>AI_PROVIDER</code> and its API key (<code>GEMINI_API_KEY</code>, <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code>) in the <code>.env</code> file and restart the server to use AI features.</div>
}

export function useAiStatus() {
  const [enabled, setEnabled] = useState(null)
  useEffect(() => { api.get('/ai/status').then((r) => setEnabled(r.enabled)).catch(() => setEnabled(false)) }, [])
  return enabled
}

// WhatsApp brand glyph (lucide has no brand icons). Green by default; pass
// color="currentColor" inside filled buttons.
export function WhatsAppIcon({ size = 16, color = '#25D366' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}
