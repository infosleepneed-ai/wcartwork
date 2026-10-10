import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Check, Plus, Package } from 'lucide-react'
import { Modal } from './ui'
import { FileDrop, FileCard } from './FileDrop'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import * as api from '../lib/api'
import { ARTWORK_TYPES, LANGUAGES, PRIORITIES, productName, timeAgo } from '../lib/constants'

const STEPS = ['Product', 'Market', 'Artwork', 'Batch & notes', 'Files', 'Review']
const EMPTY = {
  product_id: '', brand_name: '', mfg_site: '', license_code: '',
  country_code: '', customer_id: '', registration_no: '', marketing_person: '', language: 'English',
  types: [], workflow_id: '', version_no: '1.0', packaging_type: '', packing_style: '', change_type: '', effective_date: '', priority: 'normal', due_date: '',
  mfg_date: '', exp_date: '', batch_no: '', notes: '', regulatory_comments: ''
}
const LOOKUP_KINDS = ['packaging_type', 'packing_style', 'change_type', 'mfg_site', 'license_code', 'marketing_person', 'brand_name']

function Req() { return <span style={{ color: 'var(--s-rej-fg)' }}> *</span> }

// Text input with suggestions; anything new typed is saved to the list on submit
function Combo({ id, label, required, value, onChange, options, placeholder }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <Req />}</label>
      <input id={id} className="input" list={`${id}-list`} value={value} placeholder={placeholder || 'Select or type…'}
        onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      <datalist id={`${id}-list`}>{options.map((o) => <option key={o} value={o} />)}</datalist>
    </div>
  )
}

export default function CreateArtworkModal() {
  const { ui, close, open, products, countries, customers, toast, reload } = useStore()
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const key = `wc-draft2-${user?.id}`
  const [step, setStep] = useState(0)
  const [f, setF] = useState(EMPTY)
  const [savedAt, setSavedAt] = useState(null)
  const [, tick] = useState(0)
  const [q, setQ] = useState('')
  const [showSuggest, setShowSuggest] = useState(false)
  const [typeFiles, setTypeFiles] = useState({})
  const [refs, setRefs] = useState([])
  const [fileState, setFileState] = useState({})
  const [busy, setBusy] = useState(false)
  const [lookups, setLookups] = useState({})
  const [people, setPeople] = useState([])
  const [workflows, setWorkflows] = useState([])
  const loaded = useRef(false)

  useEffect(() => {
    if (!ui.create) { loaded.current = false; return }
    try {
      const d = JSON.parse(localStorage.getItem(key) || 'null')
      if (d?.f) { setF({ ...EMPTY, ...d.f }); setSavedAt(d.at); setStep(d.step || 0) }
      else { setF(EMPTY); setStep(0); setSavedAt(null) }
    } catch { setF(EMPTY) }
    setTypeFiles({}); setRefs([]); setFileState({}); setQ('')
    loaded.current = true
    supabase.from('lookups').select('kind, value').order('value').then(({ data }) => {
      const m = {}; (data || []).forEach((r) => { (m[r.kind] = m[r.kind] || []).push(r.value) }); setLookups(m)
    })
    api.listProfiles().then((p) => setPeople(p.map((x) => x.full_name).filter(Boolean))).catch(() => {})
    api.listWorkflows().then((ws) => setWorkflows(ws)).catch(() => setWorkflows([]))
  }, [ui.create, key])

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

  const usable = workflows.filter((w) => w.active && (profile?.role === 'admin' || !w.allowed_roles?.length || w.allowed_roles.includes(profile?.role)))
  const workflow = usable.find((w) => w.id === f.workflow_id) || usable.find((w) => w.is_default) || usable[0]
  const product = products.find((p) => p.id === f.product_id)
  const country = countries.find((c) => c.code === f.country_code)
  const customer = customers.find((c) => c.id === f.customer_id)
  useEffect(() => {
    if (product && !q) setQ(productName(product))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product])

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return products.slice(0, 6)
    return products.filter((p) => `${productName(p)} ${p.brand || ''}`.toLowerCase().includes(t)).slice(0, 6)
  }, [q, products])

  const L = (k, extra = []) => [...new Set([...(lookups[k] || []), ...extra])]
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const val = (k) => (v) => setF({ ...f, [k]: v })

  const valid = [
    Boolean(f.product_id && f.brand_name.trim() && f.mfg_site.trim()),
    Boolean(f.country_code && f.customer_id && f.marketing_person.trim()),
    Boolean(f.types.length && f.version_no.trim() && f.change_type.trim()),
    true, true, true
  ]
  const missingMsg = [
    'Select product, brand name and manufacturing site',
    'Select country, buyer and marketing person',
    'Pick at least one artwork type, version and type of change',
    '', '', ''
  ]

  const pickProduct = (p) => {
    setF({ ...f, product_id: p.id, brand_name: f.brand_name || p.brand || '', mfg_site: f.mfg_site || p.plant || '' })
    setQ(productName(p)); setShowSuggest(false)
  }
  const toggleType = (t) => setF({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] })

  const submit = async () => {
    setBusy(true)
    try {
      const requestNo = `REQ-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}`
      const label = `V${f.version_no.trim().replace(/^v/i, '')}`
      const common = {
        request_no: requestNo, product_id: f.product_id, brand_name: f.brand_name.trim() || null, mfg_site: f.mfg_site.trim() || null,
        license_code: f.license_code.trim() || null, country_code: f.country_code, customer_id: f.customer_id || null,
        registration_no: f.registration_no.trim() || null, marketing_person: f.marketing_person.trim() || null, language: f.language,
        packaging_type: f.packaging_type.trim() || null, packing_style: f.packing_style.trim() || null, pack_size: f.packing_style.trim() || null,
        change_type: f.change_type.trim() || null, effective_date: f.effective_date || null, priority: f.priority, due_date: f.due_date || null,
        workflow_id: workflow?.id || null,
        mfg_date: f.mfg_date || null, exp_date: f.exp_date || null, batch_no: f.batch_no.trim() || null,
        notes: f.notes.trim() || null, regulatory_comments: f.regulatory_comments.trim() || null
      }
      const created = []
      for (const t of f.types) {
        const art = await api.createArtwork({ ...common, artwork_type: t })
        created.push(art)
        const file = typeFiles[t]
        if (file) {
          setFileState((s) => ({ ...s, [t]: 'uploading' }))
          await api.addVersion(art.id, file, {
            label, note: f.change_type || 'Initial artwork',
            metadata: Object.fromEntries(Object.entries({ pack_size: f.packing_style, registration_no: f.registration_no }).filter(([, v]) => v))
          })
          setFileState((s) => ({ ...s, [t]: 'done' }))
        }
      }
      // Other documents: upload once, link to every artwork in this request
      for (const r of refs) {
        setFileState((s) => ({ ...s, [`ref:${r.name}`]: 'uploading' }))
        const path = await api.uploadFile(created[0].id, r)
        const rows = created.map((a) => ({ artwork_id: a.id, file_path: path, file_name: r.name, mime_type: r.type || null, size_bytes: r.size, uploaded_by: user.id }))
        const { error } = await supabase.from('attachments').insert(rows)
        if (error) throw new Error(error.message)
        setFileState((s) => ({ ...s, [`ref:${r.name}`]: 'done' }))
      }
      // Remember any new dropdown values for next time
      const newLookups = LOOKUP_KINDS.map((k) => ({ kind: k, value: String(f[k] || '').trim() })).filter((x) => x.value)
      if (newLookups.length) await supabase.from('lookups').upsert(newLookups, { onConflict: 'kind,value', ignoreDuplicates: true })

      try { localStorage.removeItem(key) } catch { /* ignore */ }
      toast(created.length === 1 ? `${created[0].code} created` : `${requestNo}: ${created.length} artworks created`)
      await reload()
      close('create')
      nav(created.length === 1 ? `/artworks/${created[0].id}` : '/artworks?view=mycreated')
    } catch (e) {
      toast(e.message, 'error')
    } finally { setBusy(false) }
  }

  const discard = () => {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
    setF(EMPTY); setStep(0); setSavedAt(null); close('create')
  }

  const pm = f.types.length > 1 ? `${f.types.length} artworks will be created — one per type, each with its own review and approval.` : ''

  return (
    <Modal open={ui.create} onClose={() => close('create')} title="New artwork request" size="lg"
      footer={<>
        <span className="hint" style={{ marginRight: 'auto' }}>
          {!valid[step] ? missingMsg[step] : savedAt ? `Draft saved ${timeAgo(savedAt).toLowerCase()}` : 'Draft saves automatically'}
        </span>
        {step === 0 ? <button className="btn btn-ghost" onClick={discard}>Discard</button>
          : <button className="btn btn-secondary" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
        {step < STEPS.length - 1
          ? <button className="btn btn-primary" disabled={!valid[step]} onClick={() => setStep(step + 1)}>Continue</button>
          : <button className="btn btn-primary" disabled={busy || !valid.slice(0, 3).every(Boolean)} onClick={submit}>
            {busy ? 'Creating…' : f.types.length > 1 ? `Create ${f.types.length} artworks` : 'Create request'}
          </button>}
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

      <div className="modal-body" style={{ minHeight: 320 }}>
        {step === 0 && (
          <>
            <div className="field" style={{ position: 'relative' }}>
              <label htmlFor="prod-q">Product name<Req /></label>
              <div className="input-icon">
                <Search size={17} />
                <input id="prod-q" className="input" placeholder="Search product… e.g. Rosu" value={q}
                  onChange={(e) => { setQ(e.target.value); setShowSuggest(true) }} onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)} autoComplete="off" />
              </div>
              {showSuggest && (
                <div className="popover suggest">
                  {matches.length === 0 && <div style={{ padding: 12 }} className="muted">No product matches “{q}”.</div>}
                  {matches.map((p) => (
                    <button key={p.id} className="menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => pickProduct(p)}>
                      <span className="menu-icon blue"><Package size={16} /></span>
                      <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500 }}>{productName(p)}</span>
                        <span className="menu-sub">Brand: {p.brand || '—'} · {p.dosage_form || '—'} · {p.plant ? `${p.plant} plant` : 'Plant —'}</span>
                      </span>
                    </button>
                  ))}
                  <button className="menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => { setShowSuggest(false); open('master', 'product') }}>
                    <span className="menu-icon"><Plus size={16} /></span><span>Add a new product</span>
                  </button>
                </div>
              )}
            </div>
            <div className="grid-2">
              <Combo id="c-brand" label="Brand name" required value={f.brand_name} onChange={val('brand_name')}
                options={L('brand_name', products.map((p) => p.brand).filter(Boolean))} placeholder="Brand, or Generic" />
              <Combo id="c-site" label="Mfg sites" required value={f.mfg_site} onChange={val('mfg_site')}
                options={L('mfg_site', products.map((p) => p.plant).filter(Boolean))} />
              <Combo id="c-lic" label="Manufacturing / License code" value={f.license_code} onChange={val('license_code')} options={L('license_code')} />
            </div>
          </>
        )}

        {step === 1 && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="c-country">Country<Req /></label>
              <select id="c-country" className="select" value={f.country_code} onChange={(e) => setF({ ...f, country_code: e.target.value, customer_id: '' })}>
                <option value="">--Select--</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="c-cust">Buyer name<Req /></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select id="c-cust" className="select" value={f.customer_id} onChange={set('customer_id')}>
                  <option value="">--Select--</option>
                  {customers.filter((c) => !f.country_code || !c.country_code || c.country_code === f.country_code)
                    .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" className="btn btn-secondary" onClick={() => open('master', 'customer')} aria-label="Add buyer"><Plus size={16} /></button>
              </div>
            </div>
            <Combo id="c-mkt" label="Marketing person" required value={f.marketing_person} onChange={val('marketing_person')} options={L('marketing_person', people)} />
            <div className="field">
              <label htmlFor="c-reg">Registration no.</label>
              <input id="c-reg" className="input" value={f.registration_no} onChange={set('registration_no')} placeholder="Product registration number in this market" />
            </div>
            <div className="field">
              <label htmlFor="c-lang">Language</label>
              <select id="c-lang" className="select" value={f.language} onChange={set('language')}>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <span className="label">Artwork type<Req /> <span className="muted" style={{ fontWeight: 400 }}>— select all that apply</span></span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ARTWORK_TYPES.map((t) => {
                  const on = f.types.includes(t)
                  return (
                    <button key={t} type="button" className={`fpill${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggleType(t)}>
                      <span className={`check${on ? ' on' : ''}`}>{on && <Check size={12} strokeWidth={3} />}</span>{t}
                    </button>
                  )
                })}
              </div>
              {pm && <span className="hint">{pm}</span>}
            </div>
            {usable.length > 0 && (
              <div className="field">
                <label htmlFor="c-wf">Approval workflow</label>
                <select id="c-wf" className="select" value={workflow?.id || ''} onChange={set('workflow_id')}>
                  {usable.map((w) => <option key={w.id} value={w.id}>{w.name}{w.is_default ? ' (default)' : ''}</option>)}
                </select>
                {workflow && <span className="hint">Artwork Created → {workflow.steps.map((st) => st.name).join(' → ')}</span>}
              </div>
            )}
            <div className="grid-2">
              <div className="field">
                <label htmlFor="c-ver">Version no.<Req /></label>
                <input id="c-ver" className="input mono" value={f.version_no} onChange={set('version_no')} placeholder="1.0" />
              </div>
              <Combo id="c-change" label="Type of change" required value={f.change_type} onChange={val('change_type')} options={L('change_type')} />
              <Combo id="c-pkg" label="Packaging type" value={f.packaging_type} onChange={val('packaging_type')} options={L('packaging_type')} />
              <Combo id="c-style" label="Packing style" value={f.packing_style} onChange={val('packing_style')} options={L('packing_style')} placeholder="e.g. 3 x 10" />
              <div className="field">
                <label htmlFor="c-eff">Artwork tentative effective date</label>
                <input id="c-eff" type="date" className="input" value={f.effective_date} onChange={set('effective_date')} />
              </div>
              <div className="field">
                <label htmlFor="c-due">Approval due date</label>
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
            </div>
          </>
        )}

        {step === 3 && (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="c-mfg">Mfg. date</label>
              <input id="c-mfg" type="date" className="input" value={f.mfg_date} onChange={set('mfg_date')} />
            </div>
            <div className="field">
              <label htmlFor="c-exp">Exp. date</label>
              <input id="c-exp" type="date" className="input" value={f.exp_date} onChange={set('exp_date')} />
              {f.mfg_date && f.exp_date && f.exp_date <= f.mfg_date && <span className="error-text">Exp. date must be after Mfg. date</span>}
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="c-batch">Batch no.</label>
              <textarea id="c-batch" className="textarea" rows={2} value={f.batch_no} onChange={set('batch_no')} placeholder="One or more batch numbers" />
            </div>
            <div className="field">
              <label htmlFor="c-notes">Remarks</label>
              <textarea id="c-notes" className="textarea" rows={4} value={f.notes} onChange={set('notes')} placeholder="Instructions for the designer" />
            </div>
            <div className="field">
              <label htmlFor="c-regc">Regulatory comments</label>
              <textarea id="c-regc" className="textarea" rows={4} value={f.regulatory_comments} onChange={set('regulatory_comments')} placeholder="Country text requirements, guideline references" />
            </div>
          </div>
        )}

        {step === 4 && (
          <>
            <div className="field">
              <span className="label">Artwork files <span className="muted" style={{ fontWeight: 400 }}>— optional, becomes V{f.version_no.replace(/^v/i, '')} of each artwork</span></span>
              {f.types.map((t) => (
                <div key={t} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{t}</span>
                  {typeFiles[t]
                    ? <FileCard file={typeFiles[t]} state={fileState[t]} onRemove={() => { const n = { ...typeFiles }; delete n[t]; setTypeFiles(n) }} />
                    : <FileDrop onFiles={([x]) => setTypeFiles({ ...typeFiles, [t]: x })} accept=".pdf,.png,.jpg,.jpeg,.webp" hint="PDF, JPG, PNG" />}
                </div>
              ))}
              <span className="hint">No file yet? Create the request now — the designer can upload later.</span>
            </div>
            <div className="field">
              <span className="label">Other documents</span>
              <FileDrop multiple accept="*" onFiles={(fs) => setRefs((r) => [...r, ...fs])} hint="Multiple files · all file formats" />
              {refs.map((r, i) => <FileCard key={r.name + i} file={r} state={fileState[`ref:${r.name}`]} onRemove={() => setRefs(refs.filter((_, j) => j !== i))} />)}
            </div>
          </>
        )}

        {step === 5 && (
          <div className="info-grid">
            {[
              ['Product', productName(product)], ['Brand name', f.brand_name], ['Mfg site', f.mfg_site], ['License code', f.license_code || '—'],
              ['Country', country?.name], ['Buyer', customer?.name], ['Marketing person', f.marketing_person], ['Registration no.', f.registration_no || '—'],
              ['Artwork types', f.types.join(', ')], ['Workflow', workflow?.name || 'Standard'], ['Version', `V${f.version_no.replace(/^v/i, '')}`], ['Type of change', f.change_type],
              ['Packaging', [f.packaging_type, f.packing_style].filter(Boolean).join(' · ') || '—'], ['Effective date', f.effective_date || '—'],
              ['Mfg / Exp', [f.mfg_date, f.exp_date].filter(Boolean).join(' → ') || '—'], ['Batch no.', f.batch_no || '—'],
              ['Files', `${Object.keys(typeFiles).length} artwork · ${refs.length} other`]
            ].map(([k, v]) => <div className="info" key={k}><span>{k}</span><b title={v}>{v || '—'}</b></div>)}
            {pm && <div className="notice info" style={{ gridColumn: '1 / -1' }}><Check size={17} /><span>{pm}</span></div>}
          </div>
        )}
      </div>
    </Modal>
  )
}
