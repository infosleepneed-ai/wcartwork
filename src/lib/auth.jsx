import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (user) => {
    if (!user) { setProfile(null); return }
    // The profile row is created by a database trigger; retry briefly right after sign-up.
    for (let i = 0; i < 4; i++) {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
      if (data) { setProfile(data); return }
      await new Promise((r) => setTimeout(r, 600))
    }
    setProfile({ id: user.id, email: user.email, full_name: user.email?.split('@')[0] || 'User', role: 'designer' })
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadProfile(data.session?.user)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') setProfile(null)
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') loadProfile(s?.user)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const value = {
    session, profile, loading,
    user: session?.user || null,
    isAdmin: profile?.role === 'admin',
    refreshProfile: () => loadProfile(session?.user),
    signOut: () => supabase.auth.signOut()
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
