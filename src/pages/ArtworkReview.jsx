import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ZoomIn, ZoomOut, Maximize, Minimize, RotateCw, Columns2, MessageSquarePlus, Check, RotateCcw, Upload, Download,
  ChevronLeft, ChevronRight, Scan, FileText, MessageSquare, Send, CircleCheck
} from 'lucide-react'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import * as api from '../lib/api'
import { ROLE_LABEL, ROLE_TEAM, METADATA_FIELDS, productName, timeAgo, fmtDate, fmtDateTime, currentStep, dueInfo, extOf, fileSize } from '../lib/constants'
import { StatusPill, Avatar, Empty, Spinner, Modal } from '../components/ui'
import ArtworkSurface from '../components/ArtworkSurface'
import UploadVersionModal from '../components/UploadVersionModal'
import { FileDrop } from '../components/FileDrop'

export function useArtworkData(id) {
  const { artworks } = useStore()
  const [artwork, setArtwork] = useState(null)
  const [versions, setVersions] = useState([])
  const [comments, setComments] = useState([])
  const [attachments, setAttachments] = useState([])
  const [error, setError] = useState(null)

  const loadArtwork = useCallback(async () => {
    try { setArtwork(await api.getArtwork(id)) } catch (e) { setError(e.message) }
  }, [id])
  const loadVersions = useCallback(async () => { setVersions(await api.listVersions(id)) }, [id])
  const loadComments = useCallback(async () => { setComments(await api.listComments(id)) }, [id])
  const loadAttachments = useCallback(async () => { setAttachments(await api.listAttachments(id)) }, [id])
  const reloadAll = useCallback(() => Promise.all([loadArtwork(), loadVersions(), loadComments(), loadAttachments()]).catch((e) => setError(e.message)), [loadArtwork, loadVersions, loadComments, loadAttachments])

  useEffect(() => { setArtwork(null); setError(null); reloadAll() }, [reloadAll])

  // keep in sync when the shared list sees this artwork change (status, new version…)
  const stamp = artworks.find((a) => a.id === id)?.updated_at
  useEffect(() => { if (stamp) { loadArtwork(); loadVersions() } }, [stamp, loadArtwork, loadVersions])

  useEffect(() => {
    const ch = supabase.channel(`comments-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments', filter: `artwork_id=eq.${id}` }, () => loadComments())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, loadComments])

  return { artwork, versions, comments, attachments, error, reloadAll, loadComments, loadAttachments, loadArtwork, loadVersions }
}

export function ArtworkHeader({ artwork, actions }) {
  const step = currentStep(artwork)
  const label = artwork.status === 'pending_approval' && step ? `Pending ${step.name}` : undefined
  return (
    <section className="page-head" style={{ alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 28 }}>{productName(artwork.product)}</h1>
          <StatusPill status={artwork.status} label={label} large />
        </div>
        <div className="meta-line">
          <span className="mono" style={{ color: 'var(--text-2)' }}>{artwork.code}</span><span className="sep" />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span className="cc">{artwork.country_code}</span>{artwork.country?.name}</span><span className="sep" />
          <span>{artwork.artwork_type}</span><span className="sep" />
          <span>Version {artwork.current_version?.version_label || '—'}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{actions}</div>
    </section>
  )
}

export function canDecide(artwork, profile) {
  const step = currentStep(artwork)
  if (!step || ['approved', 'rejected'].includes(artwork?.status)) return false
  return profile?.role === 'admin' || profile?.role === step.role
}

export default function ArtworkReview() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile, user } = useAuth()
  const { toast } = useStore()
  const { artwork, versions, comments, attachments, error, reloadAll, loadComments, loadAttachments } = useArtworkData(id)

  const [versionId, setVersionId] = useState(null)
  const [page, setPage] = useState(1)
  const [numPages, setNumPages] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [rot, setRot] = useState(0)
  const [mode, setMode] = useState(false)
  const [draft, setDraft] = useState(null)
  const [active, setActive] = useState(null)
  const [tab, setTab] = useState('Comments')
  const [showResolved, setShowResolved] = useState(true)
  const [general, setGeneral] = useState('')
  const [replies, setReplies] = useState({})
  const [replyOpen, setReplyOpen] = useState(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [corrOpen, setCorrOpen] = useState(false)
  const [corrText, setCorrText] = useState('')
  const [busy, setBusy] = useState(false)
  const [fs, setFs] = useState(false)
  const [boxW, setBoxW] = useState(800)
  const viewerRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [artwork?.id, versions.length])
  useEffect(() => {
    const h = () => setFs(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  const version = versions.find((v) => v.id === versionId) || versions.find((v) => v.id === artwork?.current_version_id) || versions[0]
  useEffect(() => { setPage(1) }, [version?.id])

  const threads = useMemo(() => {
    const top = comments.filter((c) => !c.parent_id && (!c.version_id || c.version_id === version?.id))
    return top.map((c) => ({ ...c, replies: comments.filter((r) => r.parent_id === c.id) }))
  }, [comments, version])
  const openCount = threads.filter((c) => !c.resolved).length
  const pins = threads.filter((c) => c.x != null && (c.page || 1) === page)

  if (error) return <main className="page"><Empty icon={FileText} tone="tone-orange" title="This artwork couldn’t be loaded" text={error}><Link className="btn btn-secondary" to="/artworks">Back to all artwork</Link></Empty></main>
  if (!artwork) return <main className="page"><Spinner label="Loading artwork…" /></main>

  const step = currentStep(artwork)
  const allowed = canDecide(artwork, profile)
  const canUpload = ['designer', 'admin'].includes(profile?.role) || artwork.created_by === user?.id
  const width = Math.max(320, Math.min(boxW - 64, 1000)) * zoom
  const due = dueInfo(artwork)

  const postComment = async (body, extra = {}) => {
    if (!body.trim()) return
    try {
      await api.addComment({ artwork_id: id, version_id: version?.id || null, body: body.trim(), ...extra })
      await loadComments()
    } catch (e) { toast(e.message, 'error') }
  }
  const submitPin = async () => {
    await postComment(draft.text || '', { x: draft.x, y: draft.y, page })
    setDraft(null); setMode(false); setTab('Comments')
  }
  const toggleResolve = async (c) => {
    try { await api.setResolved(c.id, !c.resolved); await loadComments() } catch (e) { toast(e.message, 'error') }
  }
  const requestCorrection = async () => {
    setBusy(true)
    try {
      await api.decide(id, 'correction', corrText)
      await postComment(`Correction requested: ${corrText}`)
      toast('Correction requested')
      setCorrOpen(false); setCorrText('')
      reloadAll()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else viewerRef.current?.requestFullscreen?.()
  }

  const info = [
    ['Product', productName(artwork.product)], ['Market', artwork.country?.name], ['Buyer', artwork.customer?.name || '—'],
    ['Pack size', version?.metadata?.pack_size || artwork.packing_style || artwork.pack_size || '—'], ['Language', artwork.language], ['Artwork type', artwork.artwork_type],
    ['Version', version?.version_label || '—'], ['Requested by', artwork.creator?.full_name || '—'],
    ['Due date', artwork.due_date ? fmtDate(artwork.due_date) : '—', due && ['Overdue', 'Due today'].includes(due.label)]
  ]

  return (
    <main className="page wide">
      <ArtworkHeader artwork={artwork} actions={<>
        {canUpload && <button className="btn btn-secondary" onClick={() => setUploadOpen(true)}><Upload size={16} />Upload version</button>}
        <button className="btn btn-warn" disabled={!allowed || !version} title={allowed ? '' : step ? `Only the ${ROLE_TEAM[step.role]} can act on ${step.name}` : ''} onClick={() => setCorrOpen(true)}>
          <RotateCcw size={16} />Request Correction
        </button>
        <button className="btn btn-primary" disabled={!version} onClick={() => nav(`/artworks/${id}/approval`)}><Check size={16} strokeWidth={2.4} />{allowed ? 'Approve Artwork' : 'Approval & Versions'}</button>
      </>} />

      <section className="info-grid" aria-label="Artwork information">
        {info.map(([k, v, warn]) => <div className="info" key={k}><span>{k}</span><b title={v} style={warn ? { color: 'var(--s-rej-fg)' } : undefined}>{v}</b></div>)}
      </section>

      <section className="split" style={{ alignItems: 'stretch', gap: 20 }}>
        <div className="grow viewer" ref={viewerRef}>
          {version ? (
            <>
              <div className="viewer-toolbar" role="toolbar" aria-label="Viewer">
                <button className="icon-btn sm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} aria-label="Zoom out"><ZoomOut size={17} /></button>
                <span className="mono" style={{ minWidth: 48, textAlign: 'center', fontSize: 13 }}>{Math.round(zoom * 100)}%</span>
                <button className="icon-btn sm" onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))} aria-label="Zoom in"><ZoomIn size={17} /></button>
                <span className="tool-sep" />
                <button className="icon-btn sm" onClick={() => { setZoom(1); setRot(0) }} aria-label="Fit to screen"><Scan size={17} /></button>
                <button className="icon-btn sm" onClick={() => { setRot((r) => (r + 90) % 360); setMode(false) }} aria-label="Rotate"><RotateCw size={17} /></button>
                <button className="icon-btn sm" onClick={fullscreen} aria-label={fs ? 'Exit fullscreen' : 'Fullscreen'}>{fs ? <Minimize size={17} /> : <Maximize size={17} />}</button>
                <Link className="btn btn-ghost btn-sm" to={`/artworks/${id}/approval#compare`}><Columns2 size={16} />Compare</Link>
                <span className="tool-sep" />
                <button className={`btn btn-sm ${mode ? 'btn-primary' : ''}`} style={mode ? undefined : { background: 'var(--primary-soft)', color: 'var(--primary-ink)', fontWeight: 600 }}
                  disabled={rot !== 0} title={rot !== 0 ? 'Reset rotation to add comments' : ''} aria-pressed={mode}
                  onClick={() => { setMode(!mode); setDraft(null) }}><MessageSquarePlus size={16} />Comment</button>
              </div>
              {mode && !draft && <div className="mode-hint">Click anywhere on the artwork to drop a comment pin</div>}

              <div className="viewer-scroll" ref={scrollRef}>
                <div className="viewer-stage" style={{ transform: `rotate(${rot}deg)` }}>
                  <ArtworkSurface version={version} page={page} width={width} onPages={setNumPages}
                    onClickSurface={mode && !draft ? (p) => setDraft({ ...p, text: '' }) : null}>
                    {pins.map((c) => (
                      <button key={c.id} className={`pin ${c.resolved ? 'done' : 'open'}${active === c.id ? ' active' : ''}`}
                        style={{ left: `${c.x}%`, top: `${c.y}%` }} aria-label={`Comment ${c.pin_number}`}
                        onClick={() => { setActive(c.id); setTab('Comments'); document.getElementById(`c-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }}>
                        {c.pin_number}
                      </button>
                    ))}
                    {draft && (
                      <>
                        <span className="pin open active" style={{ left: `${draft.x}%`, top: `${draft.y}%` }}>+</span>
                        <div className="pin-composer" style={{ left: `min(calc(${draft.x}% + 18px), calc(100% - 290px))`, top: `${draft.y}%` }}>
                          <label htmlFor="pin-text" className="sr-only">Comment</label>
                          <textarea id="pin-text" className="textarea" autoFocus rows={3} style={{ minHeight: 72 }} placeholder="What needs to change here?"
                            value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitPin() }} />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" disabled={!draft.text.trim()} onClick={submitPin}>Comment</button>
                          </div>
                        </div>
                      </>
                    )}
                  </ArtworkSurface>
                </div>
              </div>

              <div className="viewer-foot">
                <span className="ellipsis">{version.file_name} · {version.version_label}{version.id !== artwork.current_version_id ? ' (older version)' : ''}</span>
                {numPages > 1 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button className="icon-btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
                    Page {page} of {numPages}
                    <button className="icon-btn sm" disabled={page >= numPages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
                  </span>
                )}
                {versions.length > 1 && (
                  <select className="select" style={{ height: 32, width: 'auto', fontSize: 13 }} value={version.id} onChange={(e) => setVersionId(e.target.value)} aria-label="Version">
                    {versions.map((v) => <option key={v.id} value={v.id}>{v.version_label}{v.id === artwork.current_version_id ? ' (current)' : ''}</option>)}
                  </select>
                )}
              </div>
            </>
          ) : (
            <div style={{ margin: 'auto', padding: 32, maxWidth: 460, width: '100%' }}>
              <Empty icon={Upload} tone="tone-blue" title="No artwork file yet" text="Upload the first version to start the review.">
                {canUpload && <button className="btn btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16} />Upload V1.0</button>}
              </Empty>
            </div>
          )}
        </div>

        <aside className="side card" style={{ flex: '1 1 360px', gap: 0, overflow: 'hidden', maxHeight: 'calc(100vh - 110px)', position: 'sticky', top: 88 }}>
          <div className="panel-tabs" role="tablist" aria-label="Review panel">
            {['Comments', 'Approval', 'Details', 'Files'].map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t}{t === 'Comments' && openCount > 0 && <span className="count">{openCount}</span>}
                {t === 'Files' && <span className="count">{versions.length + attachments.length}</span>}
              </button>
            ))}
          </div>

          {tab === 'Comments' && (
            <>
              <div style={{ padding: '14px 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: 13 }}>{openCount} open · {threads.length - openCount} resolved</span>
                <button className="link-btn" style={{ fontSize: 13 }} onClick={() => setShowResolved(!showResolved)}>{showResolved ? 'Hide resolved' : 'Show resolved'}</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {threads.length === 0 && <Empty icon={MessageSquare} tone="tone-blue" title="No comments yet" text="Turn on Comment mode and click the artwork to pin feedback exactly where it applies." />}
                {threads.filter((c) => showResolved || !c.resolved).map((c) => (
                  <article id={`c-${c.id}`} key={c.id} className={`comment${active === c.id ? ' active' : ''}${c.resolved ? ' resolved' : ''}`} onClick={() => { setActive(c.id); if (c.page && c.page !== page) setPage(c.page) }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {c.pin_number && <span className="pin-badge" style={{ background: c.resolved ? 'var(--s-ok-dot)' : 'var(--s-corr-dot)' }}>{c.pin_number}</span>}
                      <Avatar name={c.author?.full_name} size={32} />
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <b style={{ fontSize: 14 }}>{c.author?.full_name}</b>
                        <span className="hint">{ROLE_LABEL[c.author?.role]} · {timeAgo(c.created_at)}</span>
                      </span>
                      <span className={`pill ${c.resolved ? 's-approved' : 's-correction'}`}>{c.resolved ? 'Resolved' : 'Open'}</span>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{c.body}</p>
                    {c.replies.map((r) => (
                      <div key={r.id} className="reply">
                        <span style={{ fontSize: 13 }}><b>{r.author?.full_name}</b> <span className="hint">· {timeAgo(r.created_at)}</span></span>
                        <span style={{ fontSize: 14, color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{r.body}</span>
                      </div>
                    ))}
                    {replyOpen === c.id && (
                      <form style={{ display: 'flex', gap: 6 }} onSubmit={async (e) => { e.preventDefault(); await postComment(replies[c.id] || '', { parent_id: c.id }); setReplies({ ...replies, [c.id]: '' }); setReplyOpen(null) }}>
                        <label htmlFor={`r-${c.id}`} className="sr-only">Reply</label>
                        <input id={`r-${c.id}`} className="input" autoFocus style={{ height: 36 }} placeholder="Write a reply…" value={replies[c.id] || ''} onChange={(e) => setReplies({ ...replies, [c.id]: e.target.value })} />
                        <button className="btn btn-primary btn-sm" style={{ height: 36 }} aria-label="Send reply"><Send size={14} /></button>
                      </form>
                    )}
                    <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-secondary btn-sm" onClick={() => setReplyOpen(replyOpen === c.id ? null : c.id)}>Reply</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => toggleResolve(c)}>{c.resolved ? <><RotateCcw size={14} />Reopen</> : <><Check size={14} strokeWidth={2.4} />Resolve</>}</button>
                    </div>
                  </article>
                ))}
              </div>
              <form style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}
                onSubmit={async (e) => { e.preventDefault(); await postComment(general); setGeneral('') }}>
                <label htmlFor="gen-c" className="hint" style={{ fontWeight: 500 }}>Add a general comment</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input id="gen-c" className="input" style={{ height: 42 }} placeholder="Write a comment…" value={general} onChange={(e) => setGeneral(e.target.value)} />
                  <button className="btn btn-primary" style={{ width: 42, padding: 0 }} disabled={!general.trim()} aria-label="Post comment"><Send size={16} /></button>
                </div>
              </form>
            </>
          )}

          {tab === 'Approval' && (
            <div style={{ padding: '18px 20px', overflowY: 'auto' }}>
              {artwork.steps.map((s, i) => (
                <div key={s.id} className="vtl">
                  <div className="vtl-rail">
                    <span className={`tl-dot ${s.state}`}>{s.state === 'done' && <Check size={12} strokeWidth={3} />}</span>
                    {i < artwork.steps.length - 1 && <span className={`tl-line ${s.state === 'done' ? 'done' : ''}`} />}
                  </div>
                  <div style={{ paddingBottom: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <b style={{ fontSize: 14 }}>{s.name}</b>
                    <span style={{ fontSize: 13, color: s.state === 'current' ? 'var(--primary)' : 'var(--muted)', fontWeight: s.state === 'current' ? 500 : 400 }}>
                      {s.state === 'done' ? `${s.completer?.full_name || ROLE_TEAM[s.role]} · ${fmtDate(s.completed_at)}` : s.state === 'current' ? `${ROLE_TEAM[s.role]} · in progress` : ROLE_TEAM[s.role]}
                    </span>
                    {s.remarks && <span className="hint">“{s.remarks}”</span>}
                  </div>
                </div>
              ))}
              <Link className="btn btn-secondary btn-block" to={`/artworks/${id}/approval`}>Open approval workflow</Link>
            </div>
          )}

          {tab === 'Details' && (
            <div style={{ padding: '8px 20px 20px', overflowY: 'auto' }}>
              {[
                ['Request no.', artwork.request_no], ['Brand name', artwork.brand_name], ['Mfg site', artwork.mfg_site || artwork.product?.plant],
                ['License code', artwork.license_code], ['Marketing person', artwork.marketing_person], ['Registration no.', artwork.registration_no],
                ['Type of change', artwork.change_type], ['Packaging type', artwork.packaging_type], ['Packing style', artwork.packing_style],
                ['Effective date', artwork.effective_date && fmtDate(artwork.effective_date)], ['Mfg. date', artwork.mfg_date && fmtDate(artwork.mfg_date)],
                ['Exp. date', artwork.exp_date && fmtDate(artwork.exp_date)], ['Batch no.', artwork.batch_no],
                ['Generic name', artwork.product?.name], ['Dosage form', artwork.product?.dosage_form],
                ['Priority', artwork.priority[0].toUpperCase() + artwork.priority.slice(1)], ['Created', fmtDateTime(artwork.created_at)],
                ...METADATA_FIELDS.map((m) => [m.label, version?.metadata?.[m.key]])
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="muted">{k}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{v}</span>
                </div>
              ))}
              {artwork.notes && (
                <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="muted">Remarks</span>
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{artwork.notes}</p>
                </div>
              )}
              {artwork.regulatory_comments && (
                <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="muted">Regulatory comments</span>
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{artwork.regulatory_comments}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'Files' && (
            <div style={{ padding: '14px 16px 20px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              <span className="palette-section" style={{ padding: '0 0 2px' }}>Artwork versions</span>
              {versions.length === 0 && <span className="muted" style={{ fontSize: 14 }}>No versions uploaded.</span>}
              {versions.map((v) => (
                <button key={v.id} className="file-card" style={{ textAlign: 'left' }} onClick={() => api.downloadFile(v.file_path, v.file_name)}>
                  <span className="file-ext">{extOf(v.file_name)}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span className="ellipsis" style={{ fontWeight: 500 }}>{v.file_name}</span>
                    <span className="hint">{v.version_label}{v.id === artwork.current_version_id ? ' · Current' : ''} · {fmtDate(v.created_at)}</span>
                  </span>
                  <Download size={16} color="var(--faint)" />
                </button>
              ))}
              <span className="palette-section" style={{ padding: '10px 0 2px' }}>Reference documents</span>
              {attachments.map((f) => (
                <button key={f.id} className="file-card" style={{ textAlign: 'left' }} onClick={() => api.downloadFile(f.file_path, f.file_name)}>
                  <span className="file-ext" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>{extOf(f.file_name)}</span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span className="ellipsis" style={{ fontWeight: 500 }}>{f.file_name}</span>
                    <span className="hint">{fileSize(f.size_bytes)} · {f.uploader?.full_name}</span>
                  </span>
                  <Download size={16} color="var(--faint)" />
                </button>
              ))}
              <FileDrop multiple onFiles={async (files) => {
                try { for (const fl of files) await api.addAttachment(id, fl); await loadAttachments(); toast(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`) } catch (e) { toast(e.message, 'error') }
              }} />
            </div>
          )}
        </aside>
      </section>

      <UploadVersionModal open={uploadOpen} onClose={() => setUploadOpen(false)} artwork={artwork} versions={versions}
        onDone={() => { setVersionId(null); reloadAll() }} />

      <Modal open={corrOpen} onClose={() => setCorrOpen(false)} title="Request correction" size="sm"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setCorrOpen(false)}>Cancel</button>
          <button className="btn btn-warn" disabled={!corrText.trim() || busy} onClick={requestCorrection}>{busy ? 'Sending…' : 'Request Correction'}</button>
        </>}>
        <div className="modal-body">
          {openCount > 0 && <div className="notice info"><CircleCheck size={17} /><span>{openCount} open comment{openCount > 1 ? 's' : ''} will go to the Design Team with this request.</span></div>}
          <div className="field">
            <label htmlFor="corr">What needs to change?</label>
            <textarea id="corr" className="textarea" autoFocus rows={4} value={corrText} onChange={(e) => setCorrText(e.target.value)} placeholder="Summarise the corrections for the designer" />
          </div>
        </div>
      </Modal>
    </main>
  )
}
