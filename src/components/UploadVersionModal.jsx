import { useEffect, useState } from 'react'
import { Modal } from './ui'
import { FileDrop, FileCard } from './FileDrop'
import { useStore } from '../lib/store'
import * as api from '../lib/api'
import { METADATA_FIELDS, nextVersionLabel } from '../lib/constants'

export default function UploadVersionModal({ open, onClose, artwork, versions, onDone }) {
  const { toast } = useStore()
  const [file, setFile] = useState(null)
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [meta, setMeta] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setFile(null); setNote(''); setLabel(nextVersionLabel(versions))
    const last = versions?.[0]?.metadata || {}
    setMeta({ pack_size: artwork?.pack_size || '', ...last })
  }, [open, versions, artwork])

  const save = async () => {
    setBusy(true)
    try {
      const clean = Object.fromEntries(Object.entries(meta).filter(([, v]) => String(v || '').trim()))
      await api.addVersion(artwork.id, file, { label: label.trim(), note, metadata: clean })
      toast(`${label} uploaded`)
      onDone?.()
      onClose()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload new version"
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" disabled={!file || !label.trim() || busy} onClick={save}>{busy ? 'Uploading…' : `Upload ${label}`}</button>
      </>}>
      <div className="modal-body">
        {file ? <FileCard file={file} state={busy ? 'uploading' : null} onRemove={() => setFile(null)} />
          : <FileDrop onFiles={([f]) => setFile(f)} accept=".pdf,.png,.jpg,.jpeg,.webp" hint="PDF, JPG, PNG" />}
        <div className="grid-2">
          <div className="field">
            <label htmlFor="v-label">Version</label>
            <input id="v-label" className="input mono" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="v-note">What changed</label>
            <input id="v-note" className="input" placeholder="e.g. Regulatory corrections" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <span className="label">Artwork details</span>
          <span className="hint">These are compared between versions so reviewers see exactly what changed.</span>
        </div>
        <div className="grid-2">
          {METADATA_FIELDS.map((m) => (
            <div className="field" key={m.key}>
              <label htmlFor={`meta-${m.key}`}>{m.label}</label>
              <input id={`meta-${m.key}`} className="input" placeholder={m.placeholder} value={meta[m.key] || ''}
                onChange={(e) => setMeta({ ...meta, [m.key]: e.target.value })} />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
