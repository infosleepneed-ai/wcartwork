import { useEffect, useRef, useState } from 'react'
import { FileWarning, Download } from 'lucide-react'
import { signedUrl, downloadFile } from '../lib/api'

let pdfjsPromise = null
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    })
  }
  return pdfjsPromise
}

const docCache = new Map()

function isPdf(v) {
  return (v?.mime_type || '').includes('pdf') || /\.pdf$/i.test(v?.file_name || v?.file_path || '')
}
function isImage(v) {
  return (v?.mime_type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(v?.file_name || '')
}

/**
 * Renders one page of an artwork version at a given CSS width.
 * Children are drawn on top (comment pins) in a box that matches the page exactly.
 */
export default function ArtworkSurface({ version, page = 1, width = 720, onPages, onClickSurface, children }) {
  const canvasRef = useRef(null)
  const [url, setUrl] = useState(null)
  const [ratio, setRatio] = useState(1.414)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let alive = true
    setState('loading')
    if (!version?.file_path) { setState('none'); return }
    signedUrl(version.file_path).then((u) => { if (alive) setUrl(u) }).catch(() => alive && setState('error'))
    return () => { alive = false }
  }, [version?.file_path])

  // PDF rendering — re-render when width changes so text stays sharp at every zoom level
  useEffect(() => {
    if (!url || !isPdf(version)) return
    let alive = true
    let task = null
    ;(async () => {
      try {
        const pdfjs = await loadPdfjs()
        let doc = docCache.get(url)
        if (!doc) { doc = await pdfjs.getDocument({ url }).promise; docCache.set(url, doc) }
        if (!alive) return
        onPages?.(doc.numPages)
        const pg = await doc.getPage(Math.min(page, doc.numPages))
        const base = pg.getViewport({ scale: 1 })
        setRatio(base.height / base.width)
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const scale = (width / base.width) * dpr
        const vp = pg.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas || !alive) return
        canvas.width = Math.floor(vp.width)
        canvas.height = Math.floor(vp.height)
        task = pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
        await task.promise
        if (alive) setState('ready')
      } catch (e) {
        if (alive && e?.name !== 'RenderingCancelledException') setState('error')
      }
    })()
    return () => { alive = false; try { task?.cancel() } catch { /* ignore */ } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, page, Math.round(width / 40)])

  if (state === 'none') return null

  const unsupported = url && !isPdf(version) && !isImage(version)
  if (state === 'error' || unsupported) {
    return (
      <div className="card" style={{ width: Math.min(width, 520), padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', lineHeight: 1.45 }}>
        <span className="empty-icon tone-orange"><FileWarning size={22} /></span>
        <b>{unsupported ? 'Preview isn’t available for this file type' : 'This file could not be displayed'}</b>
        <span className="muted" style={{ fontSize: 14 }}>Upload artwork as PDF, PNG or JPG to review it here. You can still download the original.</span>
        <button className="btn btn-secondary" onClick={() => downloadFile(version.file_path, version.file_name)}><Download size={16} />Download {version.file_name}</button>
      </div>
    )
  }

  const height = Math.round(width * ratio)
  return (
    <div className="viewer-surface" style={{ width, minHeight: state === 'loading' ? height : undefined }}>
      {isPdf(version) && <canvas ref={canvasRef} style={{ width, height, opacity: state === 'ready' ? 1 : 0, transition: 'opacity 200ms' }} />}
      {isImage(version) && url && (
        <img src={url} alt={version.file_name || 'Artwork'} style={{ width }}
          onLoad={(e) => { setRatio(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth); setState('ready'); onPages?.(1) }}
          onError={() => setState('error')} />
      )}
      {state === 'loading' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="spinner" /></div>
      )}
      {state === 'ready' && onClickSurface && (
        <button type="button" className="click-layer" aria-label="Add a comment at this spot"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            onClickSurface({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
          }} />
      )}
      {state === 'ready' && children}
    </div>
  )
}
