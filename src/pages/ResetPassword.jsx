import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) setMsg(error.message)
    else nav('/dashboard')
  }
  return (
    <div className="login-form" style={{ minHeight: '100vh' }}>
      <form className="login-inner card" style={{ padding: 32 }} onSubmit={save}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="brand-mark">AH</span><b style={{ fontSize: 17 }}>Artwork Hub</b></span>
        <h2 style={{ fontSize: 24 }}>Set a new password</h2>
        <div className="field">
          <label htmlFor="npw">New password</label>
          <input id="npw" type="password" className="input" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
          <span className="hint">At least 8 characters.</span>
        </div>
        {msg && <div className="notice warn">{msg}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  )
}
