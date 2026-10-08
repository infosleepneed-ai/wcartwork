import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Copy, Globe, FileText, Palette, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { Modal, Empty, Spinner } from '../components/ui'

const MODULES = [
  { value: 'M1', label: 'Module 1 — Administrative' },
  { value: 'M2', label: 'Module 2 — Summaries' },
  { value: 'M3', label: 'Module 3 — Quality' },
  { value: 'M4', label: 'Module 4 — Non-clinical' },
  { value: 'M5', label: 'Module 5 — Clinical / BE' }
]
const EMPTY = { category: 'dossier', module: 'M1', title: '', details: '', mandatory: true }

async function q(promise) {
  const { data, error } = await promise
  if (error) throw new Error(error.message)
  return data
}

export default function CountryRequirements() {
  const { countries, artworks, toast, open } = useStore()
  const { profile } = useAuth()
  const canEdit = ['admin', 'regulatory'].includes(profile?.role)
  const [rows, setRows] = useState(null)
  const [code, setCode] = useState(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyFrom, setCopyFrom] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { setRows(await q(supabase.from('country_requirements').select('*').order('created_at'))) }
    catch (e) { toast(e.message, 'error'); setRows([]) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!code && countries.length) setCode(countries[0].code) }, [countries, code])

  const counts = useMemo(() => {
    const m = {}
    ;(rows || []).forEach((r) => { m[r.country_code] = (m[r.country_code] || 0) + 1 })
    return m
  }, [rows])
  const list = countries.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase()))
  const country = countries.find((c) => c.code === code)
  const mine = (rows || []).filter((r) => r.country_code === code)
  const artworkRules = mine.filter((r) => r.category === 'artwork')
  const dossierDocs = mine.filter((r) => r.category === 'dossier')
  const openArtworks = artworks.filter((a) => a.country_code === code && !['approved', 'rejected'].includes(a.status)).length

  const save = async () => {
    setBusy(true)
    try {
      const payload = {
        country_code: code, category: form.category, module: form.category === 'dossier' ? form.module : null,
        title: form.title.trim(), details: form.details.trim() || null, mandatory: form.mandatory, updated_at: new Date().toISOString()
      }
      if (form.id) await q(supabase.from('country_requirements').update(payload).eq('id', form.id))
      else await q(supabase.from('country_requirements').insert(payload))
      toast(form.id ? 'Requirement updated' : 'Requirement added')
      setForm(null); load()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const remove = async (r) => {
    if (!window.confirm(`Delete “${r.title}” for ${country?.name}?`)) return
    try { await q(supabase.from('country_requirements').delete().eq('id', r.id)); toast('Requirement deleted'); load() }
    catch (e) { toast(e.message, 'error') }
  }
  const copy = async () => {
    setBusy(true)
    try {
      const src = (rows || []).filter((r) => r.country_code === copyFrom)
      const have = new Set(mine.map((r) => `${r.category}|${r.module}|${r.title.toLowerCase()}`))
      const add = src.filter((r) => !have.has(`${r.category}|${r.module}|${r.title.toLowerCase()}`))
        .map((r) => ({ country_code: code, category: r.category, module: r.module, title: r.title, details: r.details, mandatory: r.mandatory }))
      if (add.length) await q(supabase.from('country_requirements').insert(add))
      toast(add.length ? `${add.length} requirement${add.length > 1 ? 's' : ''} copied` : 'Nothing new to copy')
      setCopyOpen(false); setCopyFrom(''); load()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const Row = ({ r }) => (
    <div className="trow" style={{ gridTemplateColumns: 'minmax(0,1fr) 110px 76px', minHeight: 56, padding: '10px 20px' }}>
      <span className="cell-stack">
        <b style={{ whiteSpace: 'normal' }}>{r.title}</b>
        {r.details && <small style={{ whiteSpace: 'pre-wrap' }}>{r.details}</small>}
      </span>
      <span>{r.mandatory ? <span className="tag red">Mandatory</span> : <span className="tag grey">Optional</span>}</span>
      <span style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        {canEdit && <>
          <button className="icon-btn sm" aria-label={`Edit ${r.title}`} onClick={() => setForm({ ...r, details: r.details || '', module: r.module || 'M1' })}><Pencil size={15} /></button>
          <button className="icon-btn sm" aria-label={`Delete ${r.title}`} onClick={() => remove(r)}><Trash2 size={15} /></button>
        </>}
      </span>
    </div>
  )

  return (
    <main className="page" style={{ gap: 20 }}>
      <section className="page-head">
        <div>
          <h1>Country requirements</h1>
          <p>What each market needs on the artwork and in the dossier.</p>
        </div>
        {canEdit && country && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setCopyOpen(true)}><Copy size={16} />Copy from country</button>
            <button className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}><Plus size={17} />Add requirement</button>
          </div>
        )}
      </section>

      {!canEdit && <div className="notice info"><ShieldCheck size={17} /><span>Only Regulatory and Admin can edit requirements. You can view them all.</span></div>}

      <section className="split" style={{ gap: 20 }}>
        <aside className="card" style={{ flex: '1 1 260px', maxWidth: 340, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-start' }}>
          <div className="input-icon">
            <Search size={16} /><label htmlFor="cq" className="sr-only">Search countries</label>
            <input id="cq" className="input" style={{ height: 38 }} placeholder="Search countries" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 560, overflowY: 'auto' }}>
            {list.map((c) => (
              <button key={c.code} className={`nav-item${c.code === code ? ' active' : ''}`} onClick={() => setCode(c.code)}>
                <span className="cc">{c.code}</span>
                <span className="nav-text">{c.name}</span>
                <span className="count">{counts[c.code] || 0}</span>
              </button>
            ))}
            {list.length === 0 && <span className="muted" style={{ padding: 10, fontSize: 14 }}>No country matches.</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => open('master', 'country')}><Plus size={15} />Add country</button>
        </aside>

        <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {rows === null ? <Spinner label="Loading requirements…" /> : !country ? (
            <div className="card"><Empty icon={Globe} tone="tone-blue" title="Pick a country" text="Choose a market on the left to see its requirements." /></div>
          ) : (
            <>
              <div className="info-grid">
                <div className="info"><span>Market</span><b>{country.name}</b></div>
                <div className="info"><span>Artwork rules</span><b>{artworkRules.length}</b></div>
                <div className="info"><span>Dossier documents</span><b>{dossierDocs.length}</b></div>
                <div className="info"><span>Open artwork</span><b>{openArtworks}</b></div>
              </div>

              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="card-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div className="section-title"><h2 style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}><Palette size={18} color="var(--primary)" />Artwork rules</h2><span>Text and layout every {country.name} pack must carry</span></div>
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...EMPTY, category: 'artwork' })}><Plus size={15} />Add rule</button>}
                </div>
                {artworkRules.length ? artworkRules.map((r) => <Row key={r.id} r={r} />)
                  : <Empty title="No artwork rules yet" text="Add things like language, storage statement, registration number or barcode format." />}
              </div>

              <div className="card" style={{ overflow: 'hidden' }}>
                <div className="card-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div className="section-title"><h2 style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={18} color="var(--primary)" />Dossier documents</h2><span>Grouped by CTD module</span></div>
                  {canEdit && <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...EMPTY, category: 'dossier' })}><Plus size={15} />Add document</button>}
                </div>
                {dossierDocs.length === 0 && <Empty title="No dossier documents yet" text="Add the documents this market needs, e.g. Process Validation Report, Stability Zone IVb, BE Report." />}
                {MODULES.map((m) => {
                  const items = dossierDocs.filter((r) => r.module === m.value)
                  if (!items.length) return null
                  return (
                    <div key={m.value}>
                      <div className="thead" style={{ gridTemplateColumns: '1fr auto', position: 'static' }}><span>{m.label}</span><span>{items.length}</span></div>
                      {items.map((r) => <Row key={r.id} r={r} />)}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </section>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit requirement' : `New requirement · ${country?.name || ''}`} size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !form?.title?.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </>}>
        {form && (
          <div className="modal-body">
            <div className="field">
              <span className="label">Type</span>
              <div className="segmented" role="group" aria-label="Type" style={{ alignSelf: 'flex-start' }}>
                <button type="button" className={form.category === 'artwork' ? 'on' : ''} onClick={() => setForm({ ...form, category: 'artwork' })}>Artwork rule</button>
                <button type="button" className={form.category === 'dossier' ? 'on' : ''} onClick={() => setForm({ ...form, category: 'dossier' })}>Dossier document</button>
              </div>
            </div>
            {form.category === 'dossier' && (
              <div className="field">
                <label htmlFor="rq-mod">CTD module</label>
                <select id="rq-mod" className="select" value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })}>
                  {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor="rq-title">{form.category === 'artwork' ? 'Rule' : 'Document name'} *</label>
              <input id="rq-title" className="input" autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={form.category === 'artwork' ? 'e.g. Storage statement must read “Store below 30°C”' : 'e.g. Stability data Zone IVb'} />
            </div>
            <div className="field">
              <label htmlFor="rq-det">Details <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
              <textarea id="rq-det" className="textarea" rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Guideline reference, format, notes for the team" />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <input type="checkbox" checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
              Mandatory for this market
            </label>
          </div>
        )}
      </Modal>

      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title={`Copy into ${country?.name || ''}`} size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setCopyOpen(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={!copyFrom || busy} onClick={copy}>{busy ? 'Copying…' : 'Copy requirements'}</button>
        </>}>
        <div className="modal-body">
          <div className="field">
            <label htmlFor="cp-from">Copy from</label>
            <select id="cp-from" className="select" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Select a country</option>
              {countries.filter((c) => c.code !== code && counts[c.code]).map((c) => <option key={c.code} value={c.code}>{c.name} ({counts[c.code]})</option>)}
            </select>
            <span className="hint">Existing items with the same name are skipped, so nothing is duplicated.</span>
          </div>
        </div>
      </Modal>
    </main>
  )
}
