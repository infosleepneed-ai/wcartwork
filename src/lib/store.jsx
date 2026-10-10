import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import * as api from './api'
import { useAuth } from './auth'
import { currentStep, canSignStep } from './constants'

const StoreCtx = createContext(null)

export function StoreProvider({ children }) {
  const { user, profile } = useAuth()
  const [artworks, setArtworks] = useState([])
  const [loadingArtworks, setLoadingArtworks] = useState(true)
  const [notifications, setNotifications] = useState([])
  const [products, setProducts] = useState([])
  const [countries, setCountries] = useState([])
  const [customers, setCustomers] = useState([])
  const [people, setPeople] = useState([])
  const [toasts, setToasts] = useState([])
  const [ui, setUi] = useState({ create: false, palette: false, notif: false, master: null })
  const reloadTimer = useRef(null)

  const toast = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500)
  }, [])

  const reload = useCallback(async () => {
    try {
      setArtworks(await api.listArtworks())
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoadingArtworks(false)
    }
  }, [toast])

  const reloadMaster = useCallback(async () => {
    try {
      const [p, c, cu, pe] = await Promise.all([api.listProducts(), api.listCountries(), api.listCustomers(), api.listProfiles()])
      setProducts(p); setCountries(c); setCustomers(cu); setPeople(pe)
    } catch (e) { toast(e.message, 'error') }
  }, [toast])

  const reloadNotifications = useCallback(async () => {
    try { setNotifications(await api.listNotifications()) } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!user) return
    reload(); reloadMaster(); reloadNotifications()
    const scheduleReload = () => {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(reload, 400)
    }
    const ch = supabase.channel('wc-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'artworks' }, scheduleReload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (p) => {
        setNotifications((n) => [p.new, ...n])
        toast(p.new.title)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch); clearTimeout(reloadTimer.current) }
  }, [user, reload, reloadMaster, reloadNotifications, toast])

  const role = profile?.role
  const myQueue = useMemo(() => artworks.filter((a) => {
    if (['approved', 'rejected'].includes(a.status)) return false
    const s = currentStep(a)
    if (!s) return false
    if (a.status === 'correction') return role === 'designer' || role === 'admin' || a.created_by === user?.id
    return canSignStep(s, profile)
  }), [artworks, role, user, profile])

  const counts = useMemo(() => {
    const c = { draft: 0, under_review: 0, correction: 0, pending_approval: 0, approved: 0, rejected: 0 }
    artworks.forEach((a) => { c[a.status] = (c[a.status] || 0) + 1 })
    return c
  }, [artworks])

  const unread = notifications.filter((n) => !n.read).length

  const value = {
    artworks, loadingArtworks, reload, myQueue, counts,
    notifications, unread, reloadNotifications,
    markAllRead: async () => {
      await api.markAllNotifications(user.id)
      setNotifications((n) => n.map((x) => ({ ...x, read: true })))
    },
    markRead: async (id) => {
      setNotifications((n) => n.map((x) => (x.id === id ? { ...x, read: true } : x)))
      try { await api.markNotification(id) } catch { /* ignore */ }
    },
    products, countries, customers, people, reloadMaster,
    toast, toasts,
    ui,
    open: (k, v = true) => setUi((u) => ({ ...u, [k]: v })),
    close: (k) => setUi((u) => ({ ...u, [k]: k === 'master' ? null : false }))
  }
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export const useStore = () => useContext(StoreCtx)
