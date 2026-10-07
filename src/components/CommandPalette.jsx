import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Images, Plus, Clock, Folder, ChartColumn, Package, Building2, MessageSquareWarning } from 'lucide-react'
import { useStore } from '../lib/store'
import { productName, STATUS_LABEL } from '../lib/constants'

export default function CommandPalette() {
  const { ui, close, open, artworks, products, customers } = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.palette ? close('palette') : open('palette')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ui.palette, open, close])

  useEffect(() => {
    if (ui.palette) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 20) }
  }, [ui.palette])

  const items = useMemo(() => {
    const t = q.trim().toLowerCase()
    const out = []
    const actions = [
      { section: 'Actions', icon: Plus, label: 'Create Artwork', run: () => open('create') },
      { section: 'Actions', icon: Clock, label: 'Open Pending Approvals', run: () => nav('/artworks?status=pending_approval') },
      { section: 'Actions', icon: MessageSquareWarning, label: 'Open Corrections', run: () => nav('/artworks?status=correction') },
      { section: 'Actions', icon: Folder, label: 'Open Dossier', run: () => nav('/module/dossiers') },
      { section: 'Actions', icon: Package, label: 'Search Product', run: () => nav('/master/products') },
      { section: 'Actions', icon: Building2, label: 'Search Customer', run: () => nav('/master/customers') },
      { section: 'Actions', icon: ChartColumn, label: 'Go to Reports', run: () => nav('/module/reports') }
    ]
    if (t) {
      artworks.filter((a) => {
        const hay = `${a.code} ${productName(a.product)} ${a.country?.name} ${a.country_code} ${a.artwork_type} ${a.customer?.name || ''}`.toLowerCase()
        return t.split(/\s+/).every((w) => hay.includes(w))
      }).slice(0, 8).forEach((a) => out.push({
        section: 'Artwork', icon: Images, art: true,
        label: `${productName(a.product)} — ${a.artwork_type}`,
        sub: `${a.code} · ${a.country?.name} · ${a.current_version?.version_label || 'No file'} · ${STATUS_LABEL[a.status]}`,
        run: () => nav(`/artworks/${a.id}`)
      }))
      products.filter((p) => productName(p).toLowerCase().includes(t)).slice(0, 4).forEach((p) => out.push({
        section: 'Products', icon: Package, label: productName(p), sub: [p.dosage_form, p.plant && `${p.plant} plant`].filter(Boolean).join(' · '),
        run: () => nav(`/artworks?q=${encodeURIComponent(p.name)}`)
      }))
      customers.filter((c) => c.name.toLowerCase().includes(t)).slice(0, 3).forEach((c) => out.push({
        section: 'Customers', icon: Building2, label: c.name, run: () => nav(`/artworks?q=${encodeURIComponent(c.name)}`)
      }))
      out.push(...actions.filter((a) => a.label.toLowerCase().includes(t)))
    } else {
      artworks.slice(0, 4).forEach((a) => out.push({
        section: 'Recent artwork', icon: Images, label: `${productName(a.product)} — ${a.artwork_type}`,
        sub: `${a.code} · ${a.country?.name}`, run: () => nav(`/artworks/${a.id}`)
      }))
      out.push(...actions)
    }
    return out
  }, [q, artworks, products, customers, nav, open])

  useEffect(() => { setIdx(0) }, [q])
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  if (!ui.palette) return null
  const run = (it) => { close('palette'); it.run() }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)) }
    if (e.key === 'Enter' && items[idx]) { e.preventDefault(); run(items[idx]) }
    if (e.key === 'Escape') close('palette')
  }

  let lastSection = null
  return (
    <>
      <div className="overlay" onClick={() => close('palette')} />
      <div className="modal-wrap" style={{ paddingTop: 96 }} onMouseDown={(e) => { if (e.target === e.currentTarget) close('palette') }}>
        <div className="modal palette" role="dialog" aria-label="Command palette">
          <div className="palette-input">
            <Search size={20} color="var(--faint)" />
            <label htmlFor="cmdk" className="sr-only">Search or run a command</label>
            <input id="cmdk" ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
              placeholder="Search product, artwork ID, country, or type a command…" autoComplete="off" />
            <span className="kbd">Esc</span>
          </div>
          <div className="palette-list" ref={listRef}>
            {items.length === 0 && <div className="empty" style={{ padding: 32 }}><b>No matches</b><span>Try a product name, an artwork ID like ART-2026-0001, or a country.</span></div>}
            {items.map((it, i) => {
              const head = it.section !== lastSection ? <div className="palette-section" key={`s-${i}`}>{it.section}</div> : null
              lastSection = it.section
              const Icon = it.icon
              return (
                <div key={i}>
                  {head}
                  <button className={`menu-item${i === idx ? ' active' : ''}`} data-active={i === idx}
                    onMouseEnter={() => setIdx(i)} onClick={() => run(it)}>
                    <span className={`menu-icon ${it.art ? 'blue' : ''}`}><Icon size={16} /></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span className="ellipsis" style={{ fontWeight: 500 }}>{it.label}</span>
                      {it.sub && <span className="menu-sub ellipsis">{it.sub}</span>}
                    </span>
                    {i === idx && <span className="menu-sub">Open ↵</span>}
                  </button>
                </div>
              )
            })}
          </div>
          <div className="palette-foot"><span>↑↓ to navigate</span><span>↵ to open</span><span>Esc to close</span></div>
        </div>
      </div>
    </>
  )
}
