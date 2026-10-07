export const STATUS_LABEL = {
  draft: 'Draft',
  under_review: 'Under Review',
  correction: 'Correction',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected'
}
export const STATUS_DOT = {
  draft: 'var(--s-draft-dot)', under_review: 'var(--s-review-dot)', correction: 'var(--s-corr-dot)',
  pending_approval: 'var(--s-pend-dot)', approved: 'var(--s-ok-dot)', rejected: 'var(--s-rej-dot)'
}
export const PIPELINE = ['draft', 'under_review', 'correction', 'pending_approval', 'approved']

export const ROLE_LABEL = {
  regulatory: 'Regulatory', designer: 'Design', management: 'Management',
  export: 'Export', qa: 'QA', admin: 'Admin'
}
export const ROLE_TEAM = {
  regulatory: 'Regulatory Team', designer: 'Design Team', management: 'Management',
  export: 'Export Team', qa: 'QA Team', admin: 'Admin'
}
export const ROLES = Object.keys(ROLE_LABEL)
export const ARTWORK_TYPES = ['Carton', 'Label', 'Leaflet', 'Blister foil', 'Insert', 'Tube', 'Shipper']
export const LANGUAGES = ['English', 'French', 'Portuguese', 'Spanish', 'Arabic', 'Vietnamese', 'Burmese', 'Khmer', 'Swahili']
export const PRIORITIES = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
]
export const METADATA_FIELDS = [
  { key: 'storage', label: 'Storage condition', placeholder: 'e.g. Store below 30°C' },
  { key: 'pack_size', label: 'Pack size', placeholder: 'e.g. 3 × 10 Tablets' },
  { key: 'dimensions', label: 'Dimensions', placeholder: 'e.g. 110 × 25 × 60 mm' },
  { key: 'colours', label: 'Colours', placeholder: 'e.g. CMYK + 1 Pantone' },
  { key: 'registration_no', label: 'Registration no.', placeholder: '' },
  { key: 'barcode', label: 'Barcode / Pharmacode', placeholder: '' }
]

const TINTS = [
  ['var(--primary-soft)', 'var(--primary)'],
  ['var(--s-corr-bg)', 'var(--s-corr-fg)'],
  ['rgba(107,47,168,.12)', '#7E3FC0'],
  ['var(--s-ok-bg)', 'var(--s-ok-fg)'],
  ['rgba(49,44,133,.1)', 'var(--indigo)']
]
export function tintFor(text = '') {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function productName(p) {
  if (!p) return '—'
  return [p.name, p.strength].filter(Boolean).join(' ')
}

export function timeAgo(date) {
  if (!date) return '—'
  const d = new Date(date)
  const s = Math.round((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'Just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return fmtDate(d)
}

export function fmtDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
export function fmtDateTime(date) {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function todayISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function dueInfo(a) {
  if (!a?.due_date || a.status === 'approved') return null
  const today = todayISO()
  if (a.due_date < today) return { label: 'Overdue', tone: 'red' }
  if (a.due_date === today) return { label: 'Due today', tone: 'red' }
  const diff = Math.round((new Date(a.due_date) - new Date(today)) / 86400000)
  if (diff === 1) return { label: 'Due tomorrow', tone: 'orange' }
  if (diff <= 7) return { label: `Due in ${diff} days`, tone: 'grey' }
  return { label: `Due ${fmtDate(a.due_date)}`, tone: 'grey' }
}

export function currentStep(a) {
  return (a?.steps || []).find((s) => s.state === 'current') || null
}

export function nextVersionLabel(versions = []) {
  if (!versions.length) return 'V1.0'
  let maj = 1, min = 0
  for (const v of versions) {
    const m = /^V(\d+)\.(\d+)$/i.exec(v.version_label || '')
    if (m) {
      const a = +m[1], b = +m[2]
      if (a > maj || (a === maj && b >= min)) { maj = a; min = b }
    }
  }
  return `V${maj}.${min + 1}`
}

export function extOf(name = '') {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toUpperCase().slice(0, 4) : 'FILE'
}

export function fileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
