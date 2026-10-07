import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plus, Search, Package, Building2, Flag } from 'lucide-react'
import { useStore } from '../lib/store'
import { productName, fmtDate } from '../lib/constants'
import { Empty, ProductTile } from '../components/ui'

const CFG = {
  products: { title: 'Products', sub: 'Product master used to autofill artwork requests.', add: 'product', icon: Package, cols: ['Product', 'Dosage form', 'Brand', 'Plant', 'Artworks'] },
  customers: { title: 'Customers', sub: 'Customers and distributors linked to artwork.', add: 'customer', icon: Building2, cols: ['Customer', 'Country', 'Added', '', 'Artworks'] },
  countries: { title: 'Countries', sub: 'Markets available when creating artwork.', add: 'country', icon: Flag, cols: ['Country', 'Code', '', '', 'Artworks'] }
}

export default function MasterData() {
  const { kind } = useParams()
  const cfg = CFG[kind] || CFG.products
  const { products, customers, countries, artworks, open } = useStore()
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const t = q.toLowerCase()
    if (kind === 'customers') return customers.filter((c) => c.name.toLowerCase().includes(t)).map((c) => ({
      id: c.id, name: c.name, cells: [countries.find((x) => x.code === c.country_code)?.name || '—', fmtDate(c.created_at), ''], n: artworks.filter((a) => a.customer_id === c.id).length
    }))
    if (kind === 'countries') return countries.filter((c) => c.name.toLowerCase().includes(t)).map((c) => ({
      id: c.code, name: c.name, cells: [c.code, '', ''], n: artworks.filter((a) => a.country_code === c.code).length
    }))
    return products.filter((p) => productName(p).toLowerCase().includes(t)).map((p) => ({
      id: p.id, name: productName(p), cells: [p.dosage_form || '—', p.brand || '—', p.plant || '—'], n: artworks.filter((a) => a.product_id === p.id).length
    }))
  }, [kind, q, products, customers, countries, artworks])

  const grid = 'minmax(220px,2fr) 1fr 1fr 1fr 100px'
  return (
    <main className="page" style={{ gap: 20 }}>
      <section className="page-head">
        <div><h1>{cfg.title}</h1><p>{cfg.sub}</p></div>
        <button className="btn btn-primary" onClick={() => open('master', cfg.add)}><Plus size={17} />Add {cfg.add}</button>
      </section>
      <div className="input-icon" style={{ maxWidth: 320 }}>
        <Search size={16} /><label className="sr-only" htmlFor="mq">Search</label>
        <input id="mq" className="input" style={{ height: 40 }} placeholder={`Search ${cfg.title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="table-wrap"><div style={{ minWidth: 720 }}>
          <div className="thead" style={{ gridTemplateColumns: grid, position: 'static' }}>{cfg.cols.map((c, i) => <span key={i}>{c}</span>)}</div>
          {rows.map((r) => (
            <div key={r.id} className="trow" style={{ gridTemplateColumns: grid }}>
              <span className="cell-product"><ProductTile name={r.name} size={32} /><b style={{ fontWeight: 500 }} className="ellipsis">{r.name}</b></span>
              {r.cells.map((c, i) => <span key={i} className="muted ellipsis">{c}</span>)}
              <span>{r.n}</span>
            </div>
          ))}
          {rows.length === 0 && <Empty icon={cfg.icon} tone="tone-blue" title={`No ${cfg.title.toLowerCase()} yet`} text={`Add your first ${cfg.add} to use it in artwork requests.`} />}
        </div></div>
      </section>
    </main>
  )
}
