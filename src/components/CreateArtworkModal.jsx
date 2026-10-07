import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Check, Plus, Package } from 'lucide-react'
import { Modal } from './ui'
import { FileDrop, FileCard } from './FileDrop'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import { ARTWORK_TYPES, LANGUAGES, PRIORITIES, productName, timeAgo } from '../lib/constants'

const STEPS = ['Product', 'Market', 'Packaging', 'Files', 'Review']
const EMPTY = { product_id: '', country_code: '', customer_id: '', language: 'English', artwork_type: 'Carton', pack_size: '', storage: '', priority: 'normal', due_date: '', notes: '' }

export default function CreateArtworkModal() {
  const { ui, close, open, products, countries, customers, toast, reload } = useStore()
  const { user } = useAuth()
  const nav = useNavigate()
  const key = `wc-draft-${user?.id}`
  const [step, setStep] = useState(0)
  const [f, setF] = useState(EMPTY)
  const [savedAt, setSavedAt] = useState(null)
  const [, tick] = useState(0)
  const [q, setQ] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [artFile, setArtFile] = useState(null)
  const [refs, setRefs] = useState([])
  const [fileState, setFileState] = useState({})
  const [busy, setBusy] = useState(false)
  const loaded = useRef(false)

  useEffect(() => {
    if (!ui.create) { loaded.current = false; return }
    try {
      const d = JSON.parse(localStorage.getItem(key) || 'null')
      if (d?.f) { setF({ ...EMPTY, ...d.f }); setSavedAt(d.at); setStep(d.step || 0) }
      else { setF(EMPTY); setStep(0); setSavedAt(null) }
    } catch { setF(EMPTY) }
    setArtFile(null); setRefs([]); setFileState({}); setQ('')
    loaded.current = true
  }, [ui.create, key])

  // Autosave the form (files are kept in memory only)
  useEffect(() => {
    if (!ui.create || !loaded.current) return
    const t = setTimeout(() => {
      const at = Date.now()
      try { localStorage.setItem(key, JSON.stringify({ f, step, at })) } catch { /* ignore */ }
      setSavedAt(at)
    }, 600)
    return () => clearTimeout(t)
  }, [f, step, ui.create, key])

  useEffect(() => {
    if (!ui.create) return
    const i = setInterval(() => tick((x) => x + 1), 10000)
    return () => clearInterval(i)
  }, [ui.create])

  const product = products.find((p) => p.id === f.product_id)
  const country = countries.find((c) => c.code === f.country_code)
  const customer = customers.find((c) => c.id === f.customer_id)
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return products.slice(0, 6)
    return products.filter((p) => `${productName(p)} ${p.brand || ''}`.toLowerCase().includes(t)).slice(0, 6)
  }, [q, products])

  useEffect(() => {
    if (product && !q) setQ(productName(product))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product])

  const valid = [
    Boolean(f.product_id),
    Boolean(f.country_code && f.language),
    Boolean(f.artwork_type),
    true,
    true
  ]
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async () => {
    setBusy(true)
    try {
      const art = await api.createArtwork({
        product_id: f.product_id, country_code: f.country_code, customer_id: f.customer_id || null,
        language: f.language, artwork_type: f.artwork_type, pack_size: f.pack_size || null,
        priority: f.priority, due_date: f.due_date || null, notes: f.notes || null
      })
      if (artFile) {
        setFileState((s) => ({ ...s, [artFile.name]: 'uploading' }))
        await api.addVersion(art.id, artFile, {
          label: 'V1.0', note: 'Initial artwork',
          metadata: Object.fromEntries(Object.entries({ storage: f.storage, pack_size: f.pack_size }).filter(([, v]) => v))
        })
        setFileState((s) => ({ ...s, [artFile.name]: 'done' }))
      }
      for (const r of refs) {
        setFileState((s) => ({ ...s, [r.name]: 'uploading' }))
        await api.addAttachment(art.id, r)
        setFileState((s) => ({ ...s, [r.name]: 'done' }))
      }
      try { localStorage.removeItem(key) } catch { /* ignore */ }
      toast(`${art.code} created`)
      await reload()
      close('create')
      nav(`/artworks/${art.id}`)
    } catch (e) {
      toast(e.message, 'error')
    } finally { setBusy(false) }
  }

  const discard = () => {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
    setF(EMPTY); setStep(0); setSavedAt(null); close('create')
  }

  return (
    <Modal open={ui.create} onClose={() => close('create')} title="New artwork request" size="lg"
      footer={<>
        <span className="hint" style={{ marginRight: 'auto' }}>{savedAt ? `Draft saved ${timeAgo(savedAt).toLowerCase()}` : 'Draft saves automatically'}</span>
        {step === 0 ? <button className="btn btn-ghost" onClick={discard}>Discard</button>
          : <button className="btn btn-secondary" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
        {step < STEPS.length - 1
          ? <button className="btn btn-primary" disabled={!valid[step]} onClick={() => setStep(step + 1)}>Continue</button>
          : <button className="btn btn-primary" disabled={busy || !valid.slice(0, 3).every(Boolean)} onClick={submit}>{busy ? 'Creating…' : 'Create request'}</button>}
      </>}>
      <div style={{ paddingTop: 18 }}>
        <div className="stepper" aria-label="Progress">
          {STEPS.map((s, i) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {i > 0 && <span className="step-gap" />}
              <button type="button" className={`step-chip${i === step ? ' on' : ''}${i < step ? ' done' : ''}`}
                style={{ border: 0, background: 'transparent', padding: 0 }}
                onClick={() => { if (i < step || valid.slice(0, i).every(Boolean)) setStep(i) }}>
                <span className="step-num">{i < step ? <Check size={13} /> : i + 1}</span>{s}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="modal-body" style={{ minHeight: 300 }}>
        {step === 0 && (
          <>
            <div className="field" style={{ position: 'relative' }}>
              <label htmlFor="prod-q">Product</label>
              <div className="input-icon">
                <Search size={17} />
                <input id="prod-q" className="input" placeholder="Search product… e.g. Rosu" value={q}
                  onChange={(e) => { setQ(e.target.value); setShowSuggest(true) }} onFocus={() => setShowSuggest(true)} onBlur={() => setTimeout(() => setShowSuggest(false), 150)} autoComplete="off" />
              </div>
              {showSuggest && (
                <div className="popover suggest">
                  {matches.length === 0 && <div style={{ padding: 12 }} className="muted">No product matches “{q}”.</div>}
                  {matches.map((p) => (
                    <button key={p.id} className="menu-item" onClick={() => { setF({ ...f, product_id: p.id }); setQ(productName(p)); setShowSuggest(false) }}>
                      <span className="menu-icon blue"><Package size={16} /></span>
                      <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500 }}>{productName(p)}</span>
                        <span className="menu-sub">Brand: {p.brand || '—'} · {p.dosage_form || '—'} · {p.plant ? `${p.plant} plant` : 'Plant —'}</span>
                      </span>
                    </button>
                  ))}
                  <button className="menu-item" onClick={() => { setShowSuggest(false); open('master', 'product') }}>
                    <span className="menu-icon"><Plus size={16} /></span><span>Add a new product</span>
                  </button>
                </div>
              )}
            </div>
            {product && (
              <div className="card card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14, background: 'var(--surface-2)' }}>
                {[['Product', productName(product)], ['Brand', product.brand || '—'], ['Dosage', product.dosage_form || '—'], ['Strength', product.strength || '—'], ['Plant', product.plant || '—']].map(([k, v]) => (
                  <div key={k} className="info" style={{ border: 0, padding: 0, background: 'transparent' }}><span>{k}</span><b>{v}</b></div>
                ))}
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="c-country">Market</label>
              <select id="c-country" className="select" value={f.country_code} onChange={set('country_code')}>
                <option value="">Select country</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-lang">Language</label>
              <select id="c-lang" className="select" value={f.language} onChange={set('language')}>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="c-cust">Customer <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select id="c-cust" className="select" value={f.customer_id} onChange={set('customer_id')}>
                  <option value="">No customer</option>
                  {customers.filter((c) => !f.country_code || !c.country_code || c.country_code === f.country_code)
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" className="btn btn-secondary" onClick={() => open('master', 'customer')}><Plus size={16} />New</button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="c-type">Artwork type</label>
              <select id="c-type" className="select" value={f.artwork_type} onChange={set('artwork_type')}>
                {ARTWORK_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-pack">Pack size</label>
              <input id="c-pack" className="input" placeholder="e.g. 3 × 10 Tablets" value={f.pack_size} onChange={set('pack_size')} />
            </div>
            <div className="field">
              <label htmlFor="c-store">Storage condition</label>
              <input id="c-store" className="input" placeholder="e.g. Store below 30°C" value={f.storage} onChange={set('storage')} />
            </div>
            <div className="field">
              <label htmlFor="c-due">Due date</label>
              <input id="c-due" type="date" className="input" value={f.due_date} onChange={set('due_date')} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="label">Priority</span>
              <div className="segmented" role="group" aria-label="Priority" style={{ alignSelf: 'flex-start' }}>
                {PRIORITIES.map((p) => (
                  <button type="button" key={p.value} className={f.priority === p.value ? 'on' : ''} onClick={() => setF({ ...f, priority: p.value })}>{p.label}</button>
                ))}
              </div>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="c-notes">Requirements and notes</label>
              <textarea id="c-notes" className="textarea" placeholder="Country text requirements, special instructions for the designer…" value={f.notes} onChange={set('notes')} />
            </div>
          </div>
        )}

        {step === 3 && (
          <>
            <div className="field">
              <span className="label">Artwork file (becomes V1.0)</span>
              {artFile ? <FileCard file={artFile} state={fileState[artFile.name]} onRemove={() => setArtFile(null)} />
                : <FileDrop onFiles={([x]) => setArtFile(x)} accept=".pdf,.png,.jpg,.jpeg,.webp" hint="PDF, JPG, PNG" />}
              <span className="hint">No file yet? Create the request now — the designer can upload V1.0 later.</span>
            </div>
            <div className="field">
              <span className="label">Reference documents</span>
              <FileDrop multiple onFiles={(fs) => setRefs((r) => [...r, ...fs])} hint="PDF, JPG, PNG, DOCX — master card, previous artwork, registration" />
              {refs.map((r, i) => <FileCard key={r.name + i} file={r} state={fileState[r.name]} onRemove={() => setRefs(refs.filter((_, j) => j !== i))} />)}
            </div>
          </>
        )}

        {step === 4 && (
          <div className="info-grid">
            {[
              ['Product', productName(product)], ['Market', country?.name], ['Customer', customer?.name || '—'],
              ['Language', f.language], ['Artwork type', f.artwork_type], ['Pack size', f.pack_size || '—'],
              ['Storage', f.storage || '—'], ['Priority', PRIORITIES.find((p) => p.value === f.priority)?.label],
              ['Due date', f.due_date || '—'], ['Artwork file', artFile?.name || 'Upload later'], ['References', `${refs.length} file${refs.length === 1 ? '' : 's'}`]
            ].map(([k, v]) => <div className="info" key={k}><span>{k}</span><b title={v}>{v}</b></div>)}
            <div className="notice info" style={{ gridColumn: '1 / -1' }}>
              <Check size={17} />
              <span>The request follows the standard workflow: Design Review → Regulatory Review → Export Review → Customer Approval → Final Approval.</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
