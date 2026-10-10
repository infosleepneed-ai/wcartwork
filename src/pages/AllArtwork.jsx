import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, Check, Search, Bookmark, Download, Plus, MoreHorizontal, PartyPopper, ChevronLeft, ChevronRight, X, FileText } from 'lucide-react'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import { STATUS_LABEL, STATUS_DOT, ROLE_TEAM, ARTWORK_TYPES, productName, timeAgo, todayISO, currentStep, fmtDate, stepWho } from '../lib/constants'
import { StatusPill, Avatar, Empty, ProductTile, Modal, Skeleton } from '../components/ui'

const PAGE = 25
const GRID = '36px 128px minmax(220px,2fr) 150px 100px 70px minmax(150px,1.2fr) 100px 160px 40px'

function FilterPill({ label, options, selected, onChange, single }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const n = single ? (selected && selected !== 'any' ? 1 : 0) : selected.length
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button type="button" className={`fpill${n ? ' on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        {label}{n > 0 && !single && <span className="count blue">{n}</span>}
        {single && n > 0 && <span>: {options.find((o) => o.value === selected)?.label}</span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="popover" style={{ top: 44, left: 0, width: 240, maxHeight: 320, overflowY: 'auto' }}>
          {options.map((o) => {
            const on = single ? selected === o.value : selected.includes(o.value)
            return (
              <button key={o.value} className="menu-item" aria-pressed={on} onClick={() => {
                if (single) { onChange(o.value); setOpen(false) } else onChange(on ? selected.filter((x) => x !== o.value) : [...selected, o.value])
              }}>
                {!single && <span className={`check${on ? ' on' : ''}`}>{on && <Check size={12} strokeWidth={3} />}</span>}
                {o.dot && <span style={{ width: 8, height: 8, borderRadius: 99, background: o.dot }} />}
                <span style={{ flex: 1 }}>{o.label}</span>
                {single && on && <Check size={15} color="var(--primary)" />}
              </button>
            )
          })}
          {options.length === 0 && <div className="muted" style={{ padding: 10 }}>No options yet</div>}
        </div>
      )}
    </div>
  )
}

function RowMenu({ a }) {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const { toast } = useStore()
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div style={{ position: 'relative' }} ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn sm" aria-label={`More actions for ${a.code}`} onClick={() => setOpen(!open)}><MoreHorizontal size={17} /></button>
      {open && (
        <div className="popover" style={{ right: 0, top: 36, width: 200 }}>
          <button className="menu-item" onClick={() => nav(`/artworks/${a.id}`)}>Open review</button>
          <button className="menu-item" onClick={() => nav(`/artworks/${a.id}/approval`)}>Approval & versions</button>
          <button className="menu-item" onClick={() => { navigator.clipboard?.writeText(a.code); toast(`${a.code} copied`); setOpen(false) }}>Copy artwork ID</button>
        </div>
      )}
    </div>
  )
}

export default function AllArtwork() {
  const { artworks, myQueue, countries, loadingArtworks, open, toast, people } = useStore()
  const { user } = useAuth()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [saved, setSaved] = useState([])
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState([])
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')

  const view = params.get('view') || (params.get('saved') ? null : 'all')
  const f = {
    q: params.get('q') || '',
    status: params.getAll('status'),
    country: params.getAll('country'),
    type: params.getAll('type'),
    team: params.getAll('team'),
    date: params.get('date') || 'any'
  }

  useEffect(() => { api.listSavedViews().then(setSaved).catch(() => {}) }, [])
  useEffect(() => { setPage(0) }, [params])

  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => {
      next.delete(k)
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x))
      else if (v && v !== 'any') next.set(k, v)
    })
    setParams(next, { replace: true })
  }

  const today = todayISO()
  const builtIn = [
    { key: 'all', label: 'All artwork', fn: () => true },
    { key: 'mine', label: 'My pending tasks', fn: (a) => myQueue.some((m) => m.id === a.id) },
    { key: 'urgent', label: 'Urgent artwork', fn: (a) => a.priority === 'urgent' && !['approved', 'rejected'].includes(a.status) },
    { key: 'overdue', label: 'Overdue', fn: (a) => a.due_date && a.due_date < today && !['approved', 'rejected'].includes(a.status) },
    { key: 'due', label: 'Due this week', fn: (a) => a.due_date && a.due_date >= today && (new Date(a.due_date) - new Date(today)) / 86400000 <= 7 && a.status !== 'approved' },
    { key: 'recent', label: 'Recently approved', fn: (a) => a.approved_at && Date.now() - new Date(a.approved_at) < 30 * 86400000 },
    { key: 'mycreated', label: 'Created by me', fn: (a) => a.created_by === user?.id }
  ]
  const viewFn = builtIn.find((v) => v.key === view)?.fn || (() => true)

  const rows = useMemo(() => {
    const t = f.q.trim().toLowerCase()
    const since = f.date === 'any' ? 0 : Date.now() - Number(f.date) * 86400000
    return artworks.filter((a) => {
      if (!viewFn(a)) return false
      if (f.status.length && !f.status.includes(a.status)) return false
      if (f.country.length && !f.country.includes(a.country_code)) return false
      if (f.type.length && !f.type.includes(a.artwork_type)) return false
      if (f.team.length && !f.team.includes(currentStep(a)?.role)) return false
      if (since && new Date(a.updated_at).getTime() < since) return false
      if (t) {
        const hay = `${a.code} ${productName(a.product)} ${a.country?.name} ${a.customer?.name || ''} ${a.artwork_type}`.toLowerCase()
        if (!t.split(/\s+/).every((w) => hay.includes(w))) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworks, params, myQueue])

  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const hasFilters = f.q || f.status.length || f.country.length || f.type.length || f.team.length || f.date !== 'any'

  const exportCsv = () => {
    const list = selected.length ? rows.filter((r) => selected.includes(r.id)) : rows
    const head = ['Artwork ID', 'Product', 'Market', 'Customer', 'Type', 'Version', 'Status', 'Current step', 'Due date', 'Last update']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [head, ...list.map((a) => [a.code, productName(a.product), a.country?.name, a.customer?.name, a.artwork_type, a.current_version?.version_label, STATUS_LABEL[a.status], currentStep(a)?.name, a.due_date, fmtDate(a.updated_at)])]
      .map((r) => r.map(esc).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `artwork-${today}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const saveView = async () => {
    try {
      const filters = Object.fromEntries([...params.entries()].reduce((m, [k, v]) => { (m.get(k) || m.set(k, []).get(k)).push(v); return m }, new Map()))
      const v = await api.createSavedView(viewName.trim(), filters)
      setSaved((s) => [...s, v]); setSaveOpen(false); setViewName('')
      toast('View saved')
    } catch (e) { toast(e.message, 'error') }
  }
  const applySaved = (v) => {
    const next = new URLSearchParams()
    Object.entries(v.filters || {}).forEach(([k, vals]) => [].concat(vals).forEach((x) => next.append(k, x)))
    next.set('saved', v.id)
    setParams(next, { replace: true })
  }
  const removeSaved = async (v) => {
    try { await api.deleteSavedView(v.id); setSaved((s) => s.filter((x) => x.id !== v.id)); if (params.get('saved') === v.id) setParams({}) } catch (e) { toast(e.message, 'error') }
  }

  const statusOpts = Object.keys(STATUS_LABEL).map((s) => ({ value: s, label: STATUS_LABEL[s], dot: STATUS_DOT[s] }))
  const countryOpts = countries.filter((c) => artworks.some((a) => a.country_code === c.code)).map((c) => ({ value: c.code, label: c.name }))
  const typeOpts = ARTWORK_TYPES.map((t) => ({ value: t, label: t }))
  const teamOpts = ['designer', 'regulatory', 'export', 'qa'].map((r) => ({ value: r, label: ROLE_TEAM[r] }))
  const dateOpts = [{ value: 'any', label: 'Any time' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.includes(r.id))

  return (
    <main className="page" style={{ gap: 20 }}>
      <section className="page-head">
        <div>
          <h1>All artwork</h1>
          <p>Every carton, label, leaflet and foil across all markets.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={exportCsv}><Download size={16} />Export{selected.length ? ` ${selected.length}` : ''}</button>
          <button className="btn btn-primary" onClick={() => open('create')}><Plus size={17} strokeWidth={2.2} />New Artwork Request</button>
        </div>
      </section>

      <nav className="tabs" aria-label="Views">
        {builtIn.map((v) => {
          const n = artworks.filter(v.fn).length
          const on = view === v.key && !params.get('saved')
          return (
            <button key={v.key} className={`tab${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setParams(v.key === 'all' ? {} : { view: v.key }, { replace: true })}>
              {v.label}<span className="count">{n}</span>
            </button>
          )
        })}
        {saved.map((v) => {
          const on = params.get('saved') === v.id
          return (
            <span key={v.id} className={`tab${on ? ' on' : ''}`} style={{ paddingRight: 4 }}>
              <button style={{ border: 0, background: 'transparent', color: 'inherit', font: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => applySaved(v)}>
                <Bookmark size={14} />{v.name}
              </button>
              <button className="icon-btn sm" style={{ width: 24, height: 24 }} aria-label={`Delete view ${v.name}`} onClick={() => removeSaved(v)}><X size={13} /></button>
            </span>
          )
        })}
      </nav>

      <section className="filters">
        <div className="input-icon" style={{ flex: '0 1 280px' }}>
          <Search size={16} />
          <label htmlFor="flt-q" className="sr-only">Filter artwork</label>
          <input id="flt-q" className="input" style={{ height: 38 }} placeholder="Filter by product, ID, customer" value={f.q} onChange={(e) => update({ q: e.target.value })} />
        </div>
        <FilterPill label="Status" options={statusOpts} selected={f.status} onChange={(v) => update({ status: v })} />
        <FilterPill label="Country" options={countryOpts} selected={f.country} onChange={(v) => update({ country: v })} />
        <FilterPill label="Artwork type" options={typeOpts} selected={f.type} onChange={(v) => update({ type: v })} />
        <FilterPill label="Assigned to" options={teamOpts} selected={f.team} onChange={(v) => update({ team: v })} />
        <FilterPill label="Date" single options={dateOpts} selected={f.date} onChange={(v) => update({ date: v })} />
        {hasFilters && <button className="btn btn-ghost" style={{ height: 38 }} onClick={() => update({ q: '', status: [], country: [], type: [], team: [], date: 'any' })}>Clear filters</button>}
        <button className="btn btn-ghost" style={{ height: 38, marginLeft: 'auto', color: 'var(--primary)' }} disabled={!hasFilters} onClick={() => setSaveOpen(true)}>
          <Bookmark size={16} />Save view
        </button>
      </section>

      <section className="card">
        <div className="table-wrap">
          <div style={{ minWidth: 1120 }}>
            <div className="thead" style={{ gridTemplateColumns: GRID, borderRadius: '14px 14px 0 0' }}>
              <label style={{ display: 'flex' }}>
                <span className="sr-only">Select all on this page</span>
                <input type="checkbox" checked={allOnPage} onChange={() => setSelected(allOnPage ? selected.filter((id) => !pageRows.some((r) => r.id === id)) : [...new Set([...selected, ...pageRows.map((r) => r.id)])])} style={{ width: 16, height: 16, margin: 0, accentColor: 'var(--primary)' }} />
              </label>
              <span>Artwork ID</span><span>Product</span><span>Market</span><span>Type</span><span>Version</span><span>Assigned to</span><span>Last update</span><span>Status</span><span />
            </div>
            {loadingArtworks && [0, 1, 2, 3, 4].map((i) => <div key={i} className="trow" style={{ gridTemplateColumns: '1fr' }}><Skeleton h={18} /></div>)}
            {pageRows.map((a) => {
              const step = currentStep(a)
              const team = a.status === 'correction' ? 'Design Team' : a.status === 'approved' ? 'Completed' : step ? stepWho(step, people) : '—'
              return (
                <div key={a.id} className="trow clickable" style={{ gridTemplateColumns: GRID }} onClick={() => nav(`/artworks/${a.id}`)}>
                  <label style={{ display: 'flex' }} onClick={(e) => e.stopPropagation()}>
                    <span className="sr-only">Select {a.code}</span>
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => setSelected(selected.includes(a.id) ? selected.filter((x) => x !== a.id) : [...selected, a.id])} style={{ width: 16, height: 16, margin: 0, accentColor: 'var(--primary)' }} />
                  </label>
                  <Link to={`/artworks/${a.id}`} className="mono muted" style={{ fontSize: 13 }} onClick={(e) => e.stopPropagation()}>{a.code}</Link>
                  <span className="cell-product">
                    <ProductTile name={a.product?.name} />
                    <span className="cell-stack"><b>{a.product?.name}</b><small>{[a.product?.strength, a.customer?.name].filter(Boolean).join(' · ')}</small></span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span className="cc">{a.country_code}</span><span className="ellipsis">{a.country?.name}</span></span>
                  <span style={{ color: 'var(--text-2)' }}>{a.artwork_type}</span>
                  <span className="mono" style={{ fontSize: 13 }}>{a.current_version?.version_label || '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><Avatar name={team} size={28} /><span className="ellipsis" style={{ color: 'var(--text-2)' }}>{team}</span></span>
                  <span className="muted" style={{ fontSize: 13 }}>{timeAgo(a.updated_at)}</span>
                  <span><StatusPill status={a.status} /></span>
                  <RowMenu a={a} />
                </div>
              )
            })}
            {!loadingArtworks && rows.length === 0 && (
              artworks.length === 0
                ? <Empty icon={FileText} tone="tone-blue" title="No artwork yet" text="Create the first artwork request to start the workflow."><button className="btn btn-primary" onClick={() => open('create')}><Plus size={16} />New Artwork Request</button></Empty>
                : view === 'mine'
                  ? <Empty icon={PartyPopper} title="No artwork needs your approval 🎉" text="You’re all caught up." />
                  : <Empty icon={Search} tone="tone-blue" title="No artwork matches these filters" text="Try another view or clear the filters."><button className="btn btn-secondary" onClick={() => setParams({})}>Clear filters</button></Empty>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', fontSize: 13, color: 'var(--muted)' }}>
          <span>{rows.length ? `Showing ${page * PAGE + 1}–${Math.min(rows.length, (page + 1) * PAGE)} of ${rows.length} artworks` : '0 artworks'}{selected.length ? ` · ${selected.length} selected` : ''}</span>
          {pages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="icon-btn sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
              <span style={{ padding: '0 8px' }}>Page {page + 1} of {pages}</span>
              <button className="icon-btn sm" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
            </div>
          )}
        </div>
      </section>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save this view" size="sm"
        footer={<><button className="btn btn-secondary" onClick={() => setSaveOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={!viewName.trim()} onClick={saveView}>Save view</button></>}>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="view-name">View name</label>
            <input id="view-name" className="input" autoFocus placeholder="e.g. Philippines pending" value={viewName} onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && viewName.trim()) saveView() }} />
            <span className="hint">Only you can see your saved views.</span>
          </div>
        </div>
      </Modal>
    </main>
  )
}
