import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, GraduationCap, KeyRound, MailCheck } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { PORTALS, rememberPortal } from '../lib/portals.js'
import { Field, Modal, PasswordInput } from '../components/ui.jsx'

// "Forgot password?": emails a reset link when an email is on record, otherwise
// sends the request to the school office (Password Requests).
function ForgotPassword({ portal, initialId, onClose }) {
  const [loginId, setLoginId] = useState(initialId)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setResult(await api.post('/auth/forgot', { loginId, as: portal.key }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Forgot password" onClose={onClose} footer={result
      ? <button className="btn btn-primary" onClick={onClose}>Back to sign in</button>
      : <><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="forgot-form" disabled={busy || !loginId.trim()}>{busy ? 'Sending…' : 'Reset password'}</button></>}>
      {result ? (
        <div className="stack">
          <div className="alert alert-info row" style={{ alignItems: 'flex-start' }}><MailCheck size={18} style={{ flexShrink: 0 }} /> {result.message}</div>
          {portal.key === 'student' || portal.key === 'parent'
            ? <p className="small muted">You can also call or visit the school office; they can reset it for you straight away.</p>
            : <p className="small muted">Your admin can also reset it from Settings → Users &amp; roles.</p>}
        </div>
      ) : (
        <form id="forgot-form" className="stack" onSubmit={submit}>
          <p className="text-2">Enter your {portal.field.label.toLowerCase()} and we will help you set a new password.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <Field label={portal.field.label}>
            <input className="input" type={portal.field.type} inputMode={portal.field.inputMode} placeholder={portal.field.placeholder} value={loginId} onChange={(e) => setLoginId(e.target.value)} autoCapitalize="none" required autoFocus />
          </Field>
        </form>
      )}
    </Modal>
  )
}

// The sign-in page of one portal (/superadmin/login, /admin/login, …).
export default function Login({ portal: key }) {
  const portal = PORTALS[key]
  const { login } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      rememberPortal(key)
      // Once signed in, App moves on to ?next= (or home).
      await login(loginId, password, key)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap" data-portal={key}>
      <section className="auth-hero">
        <div className="row" style={{ gap: 10 }}>
          <div className="auth-logo"><portal.icon size={20} /></div>
          <div>
            <strong>{portal.name}</strong>
            <div className="small" style={{ opacity: 0.8 }}>Smart Campus ERP</div>
          </div>
        </div>
        <div>
          <span className="auth-chip">{portal.who}</span>
          <h1>{portal.headline}</h1>
          <ul>
            {portal.features.map((f) => <li key={f}><CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 1 }} /> {f}</li>)}
          </ul>
        </div>
        <div className="row small" style={{ opacity: 0.85 }}><Bot size={16} /> AI-powered campus</div>
      </section>
      <section className="auth-form">
        <form className="card card-pad auth-card stack" onSubmit={submit}>
          <div className="auth-card-icon"><portal.icon size={22} /></div>
          <div>
            <h1>{portal.name}</h1>
            <p className="text-2" style={{ marginTop: 4 }}>Sign in to continue</p>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <Field label={portal.field.label} hint={portal.field.hint}>
            <input className="input" type={portal.field.type} inputMode={portal.field.inputMode} placeholder={portal.field.placeholder} value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required autoFocus />
          </Field>
          <Field label="Password">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <button type="button" className="link-btn small" style={{ alignSelf: 'flex-end', marginTop: -6 }} onClick={() => setForgot(true)}><KeyRound size={13} /> Forgot password?</button>
          <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <Link to="/login" className="small row" style={{ justifyContent: 'center', gap: 4 }}><ArrowLeft size={14} /> Not you? Choose another portal</Link>
        </form>
      </section>
      {forgot && <ForgotPassword portal={portal} initialId={loginId} onClose={() => setForgot(false)} />}
    </div>
  )
}

// /login — pick which portal to sign in to.
export function PortalChooser() {
  return (
    <div className="chooser">
      <div className="chooser-head">
        <div className="brand-logo"><GraduationCap size={22} /></div>
        <h1>Smart Campus ERP</h1>
        <p className="text-2">Choose how you want to sign in</p>
      </div>
      <div className="chooser-grid">
        {Object.values(PORTALS).map((p) => (
          <Link key={p.key} to={p.login} className="chooser-card" data-portal={p.key}>
            <span className="auth-card-icon"><p.icon size={22} /></span>
            <strong>{p.name}</strong>
            <span className="small text-2">{p.who}</span>
            <span className="chooser-url">{p.login} <ArrowRight size={14} /></span>
          </Link>
        ))}
      </div>
    </div>
  )
}
