import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutGrid, Images, SquarePlus, Eye, Clock, CircleCheck, MessageSquareWarning, Folder, Globe, FileText,
  Package, Building2, Flag, SquareCheck, Bell, ChartColumn, ClipboardList, Users, SlidersHorizontal,
  PanelLeftClose, PanelLeftOpen, LogOut, Moon, Sun, Workflow
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import { ROLE_LABEL } from '../lib/constants'
import { Avatar } from './ui'
import { useState } from 'react'

export default function Sidebar({ collapsed, setCollapsed, mobileOpen, closeMobile }) {
  const { profile, signOut } = useAuth()
  const { counts, myQueue, unread, open } = useStore()
  const loc = useLocation()
  const nav = useNavigate()
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')

  const here = loc.pathname + loc.search
  const isActive = (to) => {
    if (to === '/artworks') return loc.pathname === '/artworks' && !loc.search
    if (to.includes('?')) return here === to
    return loc.pathname === to || loc.pathname.startsWith(to + '/')
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('wc-theme', next) } catch { /* ignore */ }
    setTheme(next)
  }

  const groups = [
    { label: 'Home', items: [{ to: '/dashboard', icon: LayoutGrid, text: 'Dashboard' }] },
    {
      label: 'Artwork', items: [
        { to: '/artworks', icon: Images, text: 'All Artworks' },
        { action: () => open('create'), icon: SquarePlus, text: 'Create Request' },
        { to: '/artworks?status=under_review', icon: Eye, text: 'Pending Review', count: counts.under_review },
        { to: '/artworks?status=pending_approval', icon: Clock, text: 'Pending Approval', count: counts.pending_approval, tone: 'blue' },
        { to: '/artworks?status=approved', icon: CircleCheck, text: 'Approved' },
        { to: '/artworks?status=correction', icon: MessageSquareWarning, text: 'Corrections', count: counts.correction, tone: 'orange' }
      ]
    },
    {
      label: 'Dossier', items: [
        { to: '/module/dossiers', icon: Folder, text: 'All Dossiers' },
        { to: '/module/country-requirements', icon: Globe, text: 'Country Requirements' },
        { to: '/module/documents', icon: FileText, text: 'Documents' }
      ]
    },
    {
      label: 'Master', items: [
        { to: '/master/products', icon: Package, text: 'Products' },
        { to: '/master/customers', icon: Building2, text: 'Customers' },
        { to: '/master/countries', icon: Flag, text: 'Countries' }
      ]
    },
    {
      label: 'Workflow', items: [
        { to: '/artworks?view=mine', icon: SquareCheck, text: 'My Tasks', count: myQueue.length },
        { action: () => open('notif'), icon: Bell, text: 'Notifications', count: unread }
      ]
    },
    {
      label: 'Reports', items: [
        { to: '/module/analytics', icon: ChartColumn, text: 'Analytics' },
        { to: '/module/reports', icon: ClipboardList, text: 'Reports' }
      ]
    },
    {
      label: 'Admin', items: [
        { to: '/admin/workflows', icon: Workflow, text: 'Workflows' },
        { to: '/admin/users', icon: Users, text: 'Users & Roles' },
        { to: '/module/settings', icon: SlidersHorizontal, text: 'Settings' }
      ]
    }
  ]

  return (
    <nav className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`} aria-label="Main">
      <div className="brand">
        <Link to="/dashboard" className="brand-link" onClick={closeMobile}>
          <span className="brand-mark">AH</span>
          <span className="brand-text"><b>Artwork Hub</b><small>Review · Approve · Track</small></span>
        </Link>
        <button className="icon-btn sm collapse-btn" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar"><PanelLeftClose size={18} /></button>
      </div>
      {collapsed && (
        <button className="icon-btn sm" style={{ margin: '0 auto' }} onClick={() => setCollapsed(false)} aria-label="Expand sidebar"><PanelLeftOpen size={18} /></button>
      )}

      <div className="nav">
        {groups.map((g) => (
          <div className="nav-group" key={g.label}>
            <span className="nav-label">{g.label}</span>
            {g.items.map((it) => {
              const Icon = it.icon
              const inner = (
                <>
                  <Icon size={18} strokeWidth={1.8} />
                  <span className="nav-text">{it.text}</span>
                  {it.count > 0 && <span className={`count ${it.tone || ''}`}>{it.count}</span>}
                </>
              )
              return it.to ? (
                <Link key={it.text} to={it.to} title={it.text} onClick={closeMobile}
                  className={`nav-item${isActive(it.to) ? ' active' : ''}`}>{inner}</Link>
              ) : (
                <button key={it.text} type="button" title={it.text} className="nav-item"
                  onClick={() => { closeMobile(); it.action() }}>{inner}</button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="user-card">
        <Avatar name={profile?.full_name} size={36} />
        <div className="user-meta">
          <b>{profile?.full_name}</b>
          <small>{ROLE_LABEL[profile?.role] || ''}</small>
        </div>
        {!collapsed && (
          <>
            <button className="icon-btn sm" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className="icon-btn sm" onClick={async () => { await signOut(); nav('/login') }} aria-label="Sign out"><LogOut size={17} /></button>
          </>
        )}
      </div>
    </nav>
  )
}
