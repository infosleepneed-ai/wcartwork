import { useNavigate } from 'react-router-dom'
import { X, BellOff } from 'lucide-react'
import { useStore } from '../lib/store'
import { timeAgo } from '../lib/constants'
import { Empty } from './ui'

export default function NotificationPanel() {
  const { ui, close, notifications, markAllRead, markRead, unread } = useStore()
  const nav = useNavigate()
  if (!ui.notif) return null
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const today = notifications.filter((n) => new Date(n.created_at) >= startOfDay)
  const earlier = notifications.filter((n) => new Date(n.created_at) < startOfDay)

  const Item = ({ n }) => (
    <button className="menu-item" style={{ alignItems: 'flex-start', padding: '12px 8px' }}
      onClick={() => { markRead(n.id); close('notif'); if (n.artwork_id) nav(`/artworks/${n.artwork_id}`) }}>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: n.read ? 400 : 600 }}>{n.title}</span>
        {n.body && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{n.body}</span>}
        <span style={{ fontSize: 12, color: 'var(--faint)' }}>{timeAgo(n.created_at)}</span>
      </span>
      {!n.read && <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--primary)', marginTop: 6, flex: 'none' }} />}
    </button>
  )

  return (
    <>
      <div className="overlay" onClick={() => close('notif')} />
      <aside className="slide-over" aria-label="Notifications">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Notifications</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {unread > 0 && <button className="link-btn" onClick={markAllRead}>Mark all as read</button>}
            <button className="icon-btn sm" onClick={() => close('notif')} aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 20px' }}>
          {notifications.length === 0 && <Empty icon={BellOff} tone="tone-blue" title="No notifications yet" text="Approvals, comments and corrections on your artwork will show up here." />}
          {today.length > 0 && <div className="palette-section">Today</div>}
          {today.map((n) => <Item key={n.id} n={n} />)}
          {earlier.length > 0 && <div className="palette-section" style={{ marginTop: 8 }}>Earlier</div>}
          {earlier.map((n) => <Item key={n.id} n={n} />)}
        </div>
      </aside>
    </>
  )
}
