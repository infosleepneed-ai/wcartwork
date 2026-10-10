import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { CircleAlert, CircleCheck } from 'lucide-react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import CommandPalette from './CommandPalette'
import NotificationPanel from './NotificationPanel'
import CreateArtworkModal from './CreateArtworkModal'
import MasterModal from './MasterModal'
import Assist from './Assist'
import { useStore } from '../lib/store'

function titleFor(path, search) {
  const p = new URLSearchParams(search)
  if (path.startsWith('/dashboard')) return ['Dashboard', 'Home']
  if (/^\/artworks\/[^/]+\/approval/.test(path)) return ['Artwork Approval', 'Artwork']
  if (/^\/artworks\/[^/]+/.test(path)) return ['Artwork Review', 'Artwork']
  if (path.startsWith('/artworks')) {
    const s = p.get('status')
    const map = { under_review: 'Pending Review', pending_approval: 'Pending Approval', approved: 'Approved', correction: 'Corrections' }
    if (p.get('view') === 'mine') return ['My Tasks', 'Workflow']
    return [map[s] || 'All Artworks', 'Artwork']
  }
  if (path.startsWith('/master/')) { const k = path.split('/')[2]; return [k[0].toUpperCase() + k.slice(1), 'Master'] }
  if (path.startsWith('/admin/users')) return ['Users & Roles', 'Admin']
  if (path.startsWith('/admin/workflows')) return ['Workflows', 'Admin']
  if (path.startsWith('/module/')) {
    const k = path.split('/')[2].replace(/-/g, ' ')
    return [k.replace(/\b\w/g, (c) => c.toUpperCase()), 'Modules']
  }
  return ['Artwork Hub', 'Home']
}

export default function Layout() {
  const loc = useLocation()
  const { toasts } = useStore()
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('wc-sidebar') === '1' } catch { return false } })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [title, crumb] = titleFor(loc.pathname, loc.search)

  useEffect(() => { try { localStorage.setItem('wc-sidebar', collapsed ? '1' : '0') } catch { /* ignore */ } }, [collapsed])
  useEffect(() => { document.title = `${title} · Artwork Hub` }, [title])
  useEffect(() => { setMobileOpen(false); window.scrollTo(0, 0) }, [loc.pathname])

  return (
    <div className="shell">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}
      <div className="main-col">
        <Topbar title={title} crumb={crumb} onMenu={() => setMobileOpen(true)} />
        <Outlet />
      </div>
      <CommandPalette />
      <NotificationPanel />
      <CreateArtworkModal />
      <MasterModal />
      <Assist />
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            {t.kind === 'error' ? <CircleAlert size={17} /> : <CircleCheck size={17} color="#6FD7A6" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
