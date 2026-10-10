import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, User, Package, MessageSquare, CircleCheck } from 'lucide-react'
import { supabase, isConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const MS_ENABLED = import.meta.env.VITE_ENABLE_MICROSOFT === 'true'

export default function Login() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  if (!loading && session) return <Navigate to="/dashboard" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        nav('/dashboard')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { data: { full_name: name }, emailRedirectTo: window.location.origin }
        })
        if (error) throw error
        if (data.session) nav('/dashboard')
        else setMsg({ ok: true, text: 'Account created. Check your email to confirm it, then sign in.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
        if (error) throw error
        setMsg({ ok: true, text: 'If that email has an account, a reset link is on its way.' })
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : err.message })
    } finally { setBusy(false) }
  }

  const microsoft = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email', redirectTo: `${window.location.origin}/dashboard` } })
    if (error) setMsg({ ok: false, text: error.message })
  }

  const heading = { signin: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode]
  const sub = {
    signin: 'Sign in to continue to Artwork Hub.',
    signup: 'Use your work email. An admin assigns your role after you join.',
    reset: 'Enter your work email and we’ll send a reset link.'
  }[mode]

  return (
    <div className="login">
      <section className="login-brand">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="brand-mark" style={{ width: 40, height: 40, background: 'var(--accent)' }}>AH</span>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <b style={{ fontSize: 16 }}>Artwork Hub</b>
            <span style={{ fontSize: 12, color: '#B9BDE6' }}>Artwork review &amp; approval</span>
          </span>
        </div>
        <div>
          <h1>Every carton, label and leaflet — reviewed, approved and traceable.</h1>
          <p>One calm workspace for artwork requests, regulatory review and approvals across every market.</p>
        </div>
        <div className="glimpse" aria-hidden="true">
          {[
            { icon: Package, tone: 'tone-blue', t: 'Request', s: 'Product, market, packaging and files in one form', pill: 's-under_review', p: 'Under Review' },
            { icon: MessageSquare, tone: 'tone-orange', t: 'Review on the artwork', s: 'Pin comments exactly where the change is', pill: 's-correction', p: 'Correction', indent: true },
            { icon: CircleCheck, tone: 'tone-green', t: 'Approve with e-signature', s: 'Every decision recorded in the audit trail', pill: 's-approved', p: 'Approved' }
          ].map((c) => (
            <div key={c.t} className="glimpse-card" style={c.indent ? { marginLeft: 32 } : undefined}>
              <span className={`kpi-icon ${c.tone}`} style={{ width: 40, height: 40, borderRadius: 10 }}><c.icon size={19} /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <b style={{ fontSize: 14 }}>{c.t}</b><span style={{ fontSize: 12, color: '#5B6577' }}>{c.s}</span>
              </span>
              <span className={`pill ${c.pill}`}><span className="dot" />{c.p}</span>
            </div>
          ))}
        </div>
      </section>

      <main className="login-form">
        <div className="login-inner">
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="brand-mark" style={{ width: 44, height: 44, fontSize: 15 }}>AH</span>
            <b style={{ fontSize: 20, letterSpacing: '-0.01em' }}>Artwork Hub</b>
          </span>
          <div>
            <h2 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>{heading}</h2>
            <p className="muted" style={{ fontSize: 15, marginTop: 8 }}>{sub}</p>
          </div>

          {!isConfigured && (
            <div className="notice warn"><ShieldCheck size={17} /><span>Supabase isn’t connected yet. Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> to your environment variables, then redeploy.</span></div>
          )}

          {MS_ENABLED && mode === 'signin' && (
            <>
              <button type="button" className="btn btn-secondary btn-lg btn-block" onClick={microsoft}>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" /><rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" /><rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" /><rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" /></svg>
                Continue with Microsoft 365
              </button>
              <div className="or">or use your company email</div>
            </>
          )}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="name">Full name</label>
                <div className="input-icon"><User size={17} /><input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" style={{ height: 48 }} /></div>
              </div>
            )}
            <div className="field">
              <label htmlFor="email">Work email</label>
              <div className="input-icon"><Mail size={17} /><input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" style={{ height: 48 }} /></div>
            </div>
            {mode !== 'reset' && (
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <label htmlFor="pw" className="label">Password</label>
                  {mode === 'signin' && <button type="button" className="link-btn" style={{ fontSize: 13 }} onClick={() => { setMode('reset'); setMsg(null) }}>Forgot password?</button>}
                </div>
                <div className="input-icon">
                  <Lock size={17} />
                  <input id="pw" type={show ? 'text' : 'password'} className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} style={{ height: 48, paddingRight: 48 }} />
                  <button type="button" className="icon-btn sm" style={{ position: 'absolute', right: 6 }} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {mode === 'signup' && <span className="hint">At least 8 characters.</span>}
              </div>
            )}
            {msg && <div className={`notice ${msg.ok ? 'ok' : 'warn'}`}><span>{msg.text}</span></div>}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy || !isConfigured}>
              {busy ? 'Please wait…' : { signin: 'Sign in', signup: 'Create account', reset: 'Send reset link' }[mode]}
              {!busy && <ArrowRight size={18} />}
            </button>
          </form>

          <p className="muted" style={{ fontSize: 14, textAlign: 'center' }}>
            {mode === 'signin' ? <>New to Artwork Hub? <button className="link-btn" onClick={() => { setMode('signup'); setMsg(null) }}>Create an account</button></>
              : <>Already have an account? <button className="link-btn" onClick={() => { setMode('signin'); setMsg(null) }}>Sign in</button></>}
          </p>

          <div className="notice info" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
            <ShieldCheck size={18} color="var(--primary)" />
            <span>Every review, comment and approval is recorded in the audit trail.</span>
          </div>
        </div>
      </main>
    </div>
  )
}
