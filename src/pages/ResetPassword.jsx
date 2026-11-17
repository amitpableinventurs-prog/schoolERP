import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, KeyRound } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { Field, PasswordInput } from '../components/ui.jsx'

// Opened from the password-reset email: /reset-password?token=…
export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const { user, logout } = useAuth()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password.length < 6) return setError('The new password must be at least 6 characters.')
    if (form.password !== form.confirm) return setError('The two passwords do not match.')
    setBusy(true)
    try {
      const r = await api.post('/auth/reset', { token, password: form.password })
      // Someone else may be signed in on this phone; start clean.
      if (user) await logout().catch(() => {})
      setDone(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap" style={{ gridTemplateColumns: '1fr' }}>
      <section className="auth-form" style={{ margin: '0 auto' }}>
        <div className="card card-pad auth-card stack">
          <div className="auth-card-icon">{done ? <CheckCircle2 size={22} /> : <KeyRound size={22} />}</div>
          {done ? (
            <>
              <h1>Password changed</h1>
              <p className="text-2">You can now sign in with your new password.</p>
              <Link className="btn btn-primary auth-submit" to={done.login || '/login'}>Go to sign in</Link>
            </>
          ) : !token ? (
            <>
              <h1>Link not complete</h1>
              <div className="alert alert-error">This reset link is missing its code. Open the link from the email again, or ask for a new one with “Forgot password?” on the sign-in page.</div>
              <Link className="btn" to="/login">Go to sign in</Link>
            </>
          ) : (
            <form className="stack" onSubmit={submit}>
              <div>
                <h1>Choose a new password</h1>
                <p className="text-2" style={{ marginTop: 4 }}>The link from the email works once, for 30 minutes.</p>
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              <Field label="New password" hint="At least 6 characters"><PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required autoFocus /></Field>
              <Field label="Confirm new password"><PasswordInput value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} minLength={6} required /></Field>
              <button className="btn btn-primary auth-submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
              <Link to="/login" className="small" style={{ textAlign: 'center' }}>Back to sign in</Link>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
