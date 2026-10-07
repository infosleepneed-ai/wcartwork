import { useState } from 'react'
import { Modal } from './ui'
import { useStore } from '../lib/store'
import * as api from '../lib/api'

const CONFIG = {
  product: {
    title: 'New product',
    fields: [
      { key: 'name', label: 'Product name', placeholder: 'e.g. Rosuvastatin Tablets BP', required: true },
      { key: 'strength', label: 'Strength', placeholder: 'e.g. 10 mg' },
      { key: 'dosage_form', label: 'Dosage form', placeholder: 'e.g. Tablet' },
      { key: 'brand', label: 'Brand', placeholder: 'Leave blank if generic' },
      { key: 'plant', label: 'Plant', placeholder: 'e.g. Vadavswami' }
    ],
    save: api.createProduct
  },
  customer: {
    title: 'New customer',
    fields: [
      { key: 'name', label: 'Customer name', placeholder: 'Company name', required: true },
      { key: 'country_code', label: 'Country', type: 'country' }
    ],
    save: api.createCustomer
  },
  country: {
    title: 'New country',
    fields: [
      { key: 'code', label: 'ISO code', placeholder: 'e.g. ZM', required: true, upper: true },
      { key: 'name', label: 'Country name', placeholder: 'e.g. Zambia', required: true }
    ],
    save: api.createCountry
  }
}

export default function MasterModal() {
  const { ui, close, countries, reloadMaster, toast } = useStore()
  const kind = ui.master
  const [vals, setVals] = useState({})
  const [busy, setBusy] = useState(false)
  if (!kind) return null
  const cfg = CONFIG[kind]
  const missing = cfg.fields.some((f) => f.required && !String(vals[f.key] || '').trim())

  const save = async () => {
    setBusy(true)
    try {
      const clean = {}
      cfg.fields.forEach((f) => { const v = String(vals[f.key] || '').trim(); if (v) clean[f.key] = f.upper ? v.toUpperCase() : v })
      await cfg.save(clean)
      await reloadMaster()
      toast(`${cfg.title.replace('New ', '')[0].toUpperCase()}${cfg.title.replace('New ', '').slice(1)} added`)
      setVals({}); close('master')
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={() => { setVals({}); close('master') }} title={cfg.title} size="sm"
      footer={<>
        <button className="btn btn-secondary" onClick={() => close('master')}>Cancel</button>
        <button className="btn btn-primary" disabled={missing || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div className="modal-body">
        {cfg.fields.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={`m-${f.key}`}>{f.label}{f.required && ' *'}</label>
            {f.type === 'country' ? (
              <select id={`m-${f.key}`} className="select" value={vals[f.key] || ''} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })}>
                <option value="">Select country</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            ) : (
              <input id={`m-${f.key}`} className="input" placeholder={f.placeholder} value={vals[f.key] || ''}
                onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
