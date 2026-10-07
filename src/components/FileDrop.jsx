import { useRef, useState } from 'react'
import { UploadCloud, Check, X } from 'lucide-react'
import { extOf, fileSize } from '../lib/constants'

export function FileDrop({ onFiles, multiple = false, accept = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.doc,.xlsx', hint = 'PDF, JPG, PNG, DOCX' }) {
  const [over, setOver] = useState(false)
  const ref = useRef(null)
  return (
    <div className={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files]; if (f.length) onFiles(multiple ? f : [f[0]]) }}>
      <span className="empty-icon tone-blue" style={{ marginBottom: 2 }}><UploadCloud size={22} /></span>
      <b style={{ fontSize: 15 }}>Drop files here</b>
      <span style={{ fontSize: 14, color: 'var(--muted)' }}>
        or <button type="button" className="link-btn" onClick={() => ref.current?.click()}>browse files</button>
      </span>
      <span className="hint">Supported: {hint}</span>
      <input ref={ref} type="file" hidden multiple={multiple} accept={accept}
        onChange={(e) => { const f = [...e.target.files]; if (f.length) onFiles(f); e.target.value = '' }} />
    </div>
  )
}

export function FileCard({ file, state, onRemove }) {
  return (
    <div className="file-card">
      <span className="file-ext">{extOf(file.name)}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span className="ellipsis" style={{ fontWeight: 500 }}>{file.name}</span>
        <span className="hint">
          {state === 'uploading' ? 'Uploading…' : state === 'done' ? 'Uploaded' : state === 'error' ? 'Upload failed' : fileSize(file.size)}
        </span>
      </span>
      {state === 'uploading' && <span className="spinner" />}
      {state === 'done' && <span className="tone-green" style={{ width: 24, height: 24, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={14} /></span>}
      {!state && onRemove && <button type="button" className="icon-btn sm" onClick={onRemove} aria-label={`Remove ${file.name}`}><X size={16} /></button>}
    </div>
  )
}
