import { useEffect } from 'react'
import { X } from 'lucide-react'
import { STATUS_LABEL, initials, tintFor, dueInfo } from '../lib/constants'

export function StatusPill({ status, large, label }) {
  return (
    <span className={`pill s-${status}${large ? ' lg' : ''}`}>
      <span className="dot" />{label || STATUS_LABEL[status] || status}
    </span>
  )
}

export function Avatar({ name, size = 32 }) {
  const [bg, fg] = tintFor(name || '')
  return (
    <span className="avatar" title={name} style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: bg, color: fg }}>
      {initials(name)}
    </span>
  )
}

export function CountryBadge({ country, code }) {
  const c = code || country?.code
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span className="cc">{c}</span>
      {country?.name && <span className="ellipsis">{country.name}</span>}
    </span>
  )
}

export function ProductTile({ name, size = 36 }) {
  const [bg, fg] = tintFor(name || '')
  return <span className="prod-tile" style={{ width: size, height: size, background: bg, color: fg }}>{(name || '?')[0]}</span>
}

export function DueTag({ artwork }) {
  const d = dueInfo(artwork)
  if (!d) return null
  return <span className={`tag ${d.tone}`}>{d.label}</span>
}

export function Empty({ icon: Icon, tone = 'tone-green', title, text, children }) {
  return (
    <div className="empty">
      {Icon && <span className={`empty-icon ${tone}`}><Icon size={22} /></span>}
      <b>{title}</b>
      {text && <span>{text}</span>}
      {children && <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>{children}</div>}
    </div>
  )
}

export function Spinner({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', padding: 24, justifyContent: 'center' }}>
      <span className="spinner" />{label}
    </div>
  )
}

export function Modal({ open, onClose, title, size = '', children, footer, labelledBy = 'modal-title' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
        <div className={`modal ${size}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
          {title && (
            <div className="modal-head">
              <h2 id={labelledBy}>{title}</h2>
              <button className="icon-btn sm" onClick={onClose} aria-label="Close"><X size={18} /></button>
            </div>
          )}
          {children}
          {footer && <div className="modal-foot">{footer}</div>}
        </div>
      </div>
    </>
  )
}

export function Sparkline({ data = [], color = 'var(--accent)', width = 96, height = 36 }) {
  if (data.length < 2) return null
  const max = Math.max(...data), min = Math.min(...data)
  const pts = data.map((v, i) => `${(i * (100 / (data.length - 1))).toFixed(1)},${(32 - ((v - min) / ((max - min) || 1)) * 28).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox="0 0 100 36" fill="none" aria-hidden="true" style={{ flex: 'none' }}>
      <polyline points={pts} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Skeleton({ h = 16, w = '100%', r = 8 }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />
}
