import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Bot, CheckCircle2, GraduationCap } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { PORTALS, rememberPortal } from '../lib/portals.js'
import { Field } from '../components/ui.jsx'

// The sign-in page of one portal (/superadmin/login, /admin/login, …).
export default function Login({ portal: key }) {
  const portal = PORTALS[key]
  const { login } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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
        <div className="row small" style={{ opacity: 0.85 }}><Bot size={16} /> Powered by Claude AI</div>
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
            <input className="input" type={portal.field.type} inputMode={portal.field.inputMode} placeholder={portal.field.placeholder} value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <Link to="/login" className="small row" style={{ justifyContent: 'center', gap: 4 }}><ArrowLeft size={14} /> Not you? Choose another portal</Link>
        </form>
      </section>
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
