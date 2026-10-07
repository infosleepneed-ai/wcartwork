import { useEffect, useRef, useState } from 'react'
import { Search, Plus, Bell, CircleHelp, ChevronRight, Menu, Images, Folder, Package, Building2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { Avatar } from './ui'

export default function Topbar({ title, crumb, onMenu }) {
  const { open, unread } = useStore()
  const { profile } = useAuth()
  const nav = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const ref = useRef(null)
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

  useEffect(() => {
    if (!createOpen) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setCreateOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [createOpen])

  const quick = [
    { icon: Images, tone: 'blue', label: 'New Artwork Request', sub: 'Carton, label, leaflet', run: () => open('create') },
    { icon: Folder, tone: 'indigo', label: 'New Dossier', run: () => nav('/module/dossiers') },
    { icon: Package, label: 'New Product', run: () => open('master', 'product') },
    { icon: Building2, label: 'New Customer', run: () => open('master', 'customer') }
  ]

  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="icon-btn menu-toggle" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button>
        <div style={{ minWidth: 0 }}>
          <div className="crumbs">{crumb}<ChevronRight size={12} /><b>{title}</b></div>
          <div className="page-name">{title}</div>
        </div>
      </div>

      <button className="search-trigger" onClick={() => open('palette')} aria-label="Search product, artwork, dossier, country">
        <Search size={18} />
        <span>Search product, artwork, dossier, country…</span>
        <span className="kbd">{isMac ? '⌘ K' : 'Ctrl K'}</span>
      </button>

      <div className="top-actions">
        <div style={{ position: 'relative' }} ref={ref}>
          <button className="btn btn-primary" onClick={() => setCreateOpen((v) => !v)} aria-expanded={createOpen}>
            <Plus size={17} strokeWidth={2.2} />Create
          </button>
          {createOpen && (
            <div className="popover" style={{ right: 0, top: 48, width: 260 }}>
              {quick.map((q) => (
                <button key={q.label} className="menu-item" onClick={() => { setCreateOpen(false); q.run() }}>
                  <span className={`menu-icon ${q.tone || ''}`}><q.icon size={16} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 500 }}>{q.label}</span>
                    {q.sub && <span className="menu-sub">{q.sub}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="icon-btn" onClick={() => open('notif')} aria-label={`Notifications, ${unread} unread`}>
          <Bell size={19} />
          {unread > 0 && <span className="notif-dot" />}
        </button>
        <button className="icon-btn" onClick={() => open('palette')} aria-label="Help and shortcuts" title="Shortcuts: Ctrl K to search">
          <CircleHelp size={19} />
        </button>
        <span style={{ marginLeft: 4 }}><Avatar name={profile?.full_name} size={38} /></span>
      </div>
    </header>
  )
}
