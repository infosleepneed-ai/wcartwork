import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Check, Minus, Plus, ArrowRight, TriangleAlert, Clock, ShieldCheck, Upload, History, Columns2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import { METADATA_FIELDS, fmtDate, fmtDateTime, timeAgo, currentStep, stepWho } from '../lib/constants'
import { Avatar, Empty, Spinner } from '../components/ui'
import ArtworkSurface from '../components/ArtworkSurface'
import UploadVersionModal from '../components/UploadVersionModal'
import { useArtworkData, ArtworkHeader, canDecide } from './ArtworkReview'

const LABELS = Object.fromEntries(METADATA_FIELDS.map((m) => [m.key, m.label]))

function ComparePane({ version, zoom, colW, scrollRef, onScroll, tag }) {
  return (
    <div style={{ background: 'var(--viewer-bg)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface)', gap: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className={`tag ${tag === 'Current' ? 'blue' : 'grey'} mono`}>{version?.version_label || '—'}</span>
          <span className="muted ellipsis" style={{ fontSize: 13 }}>{tag}{version?.change_note ? ` · ${version.change_note}` : ''}</span>
        </span>
        <span className="hint" style={{ flex: 'none' }}>{version ? fmtDate(version.created_at) : ''}</span>
      </div>
      <div ref={scrollRef} onScroll={onScroll} style={{ height: 460, overflow: 'auto', display: 'flex', padding: 24 }}>
        <div style={{ margin: 'auto' }}>
          {version ? <ArtworkSurface version={version} width={Math.max(240, colW - 48) * zoom} /> : <span className="muted">Select a version</span>}
        </div>
      </div>
    </div>
  )
}

export default function ArtworkApproval() {
  const { id } = useParams()
  const { profile, user } = useAuth()
  const { toast, reload, people } = useStore()
  const { artwork, versions, comments, error, reloadAll } = useArtworkData(id)
  const [leftId, setLeftId] = useState(null)
  const [rightId, setRightId] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [colW, setColW] = useState(420)
  const [decision, setDecision] = useState('approve')
  const [remarks, setRemarks] = useState('')
  const [password, setPassword] = useState('')
  const [confirmSig, setConfirmSig] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [audit, setAudit] = useState([])
  const [uploadOpen, setUploadOpen] = useState(false)
  const gridRef = useRef(null)
  const leftRef = useRef(null)
  const rightRef = useRef(null)
  const syncing = useRef(false)

  useEffect(() => { api.listAudit(id, 20).then(setAudit).catch(() => {}) }, [id, artwork?.updated_at])
  useEffect(() => {
    if (!versions.length) return
    setRightId((r) => r || versions[0].id)
    setLeftId((l) => l || (versions[1] || versions[0]).id)
  }, [versions])
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setColW(e.contentRect.width >= 640 ? e.contentRect.width / 2 : e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [versions.length])
  useEffect(() => {
    if (window.location.hash === '#compare') setTimeout(() => document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth' }), 300)
  }, [])

  const left = versions.find((v) => v.id === leftId)
  const right = versions.find((v) => v.id === rightId)
  const changes = useMemo(() => {
    if (!left || !right || left.id === right.id) return []
    const a = left.metadata || {}, b = right.metadata || {}
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((k) => (a[k] || '') !== (b[k] || ''))
      .map((k) => ({ key: k, label: LABELS[k] || k, from: a[k], to: b[k] }))
  }, [left, right])

  if (error) return <main className="page"><Empty title="This artwork couldn’t be loaded" text={error} /></main>
  if (!artwork) return <main className="page"><Spinner label="Loading approval…" /></main>

  const step = currentStep(artwork)
  const allowed = canDecide(artwork, profile)
  const openComments = comments.filter((c) => !c.parent_id && !c.resolved && (!c.version_id || c.version_id === artwork.current_version_id)).length
  const completed = artwork.steps.filter((s) => s.state === 'done').length
  const isPasswordUser = (user?.app_metadata?.provider || 'email') === 'email'
  const sigReady = isPasswordUser ? password.length > 0 : confirmSig
  const needsRemarks = decision !== 'approve'

  const sync = (from, to) => () => {
    if (syncing.current || !from.current || !to.current) return
    syncing.current = true
    const f = from.current, t = to.current
    t.scrollTop = (f.scrollTop / Math.max(1, f.scrollHeight - f.clientHeight)) * (t.scrollHeight - t.clientHeight)
    t.scrollLeft = (f.scrollLeft / Math.max(1, f.scrollWidth - f.clientWidth)) * (t.scrollWidth - t.clientWidth)
    requestAnimationFrame(() => { syncing.current = false })
  }

  const submit = async () => {
    setBusy(true)
    try {
      if (isPasswordUser) await api.verifyPassword(user.email, password)
      const apiDecision = decision === 'approve_comments' ? 'approve' : decision
      const text = decision === 'approve_comments' ? `Approved with comments: ${remarks}` : remarks
      await api.decide(id, apiDecision, text)
      if (decision === 'correction' && remarks.trim()) {
        await api.addComment({ artwork_id: id, version_id: artwork.current_version_id, body: `Correction requested: ${remarks.trim()}` })
      }
      setDone({ decision: apiDecision, step: step?.name, at: new Date() })
      setPassword(''); setRemarks(''); setConfirmSig(false)
      toast(apiDecision === 'approve' ? `${step?.name} approved` : apiDecision === 'correction' ? 'Correction requested' : 'Artwork rejected')
      await reloadAll(); reload()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  const options = [
    { k: 'approve', label: 'Approve', hint: step ? (artwork.steps.find((s) => s.position === step.position + 1) ? `Send to ${artwork.steps.find((s) => s.position === step.position + 1).name}` : 'Final approval — artwork becomes Approved') : '' },
    { k: 'approve_comments', label: 'Approve with comments', hint: 'Approve and leave notes for the next team' },
    { k: 'correction', label: 'Request correction', hint: 'Return to Design with your remarks', tone: 'warn' },
    { k: 'reject', label: 'Reject', hint: 'Stop this artwork — it cannot continue', tone: 'danger' }
  ]
  const actionLabel = { created: 'Created request', version_uploaded: 'Uploaded', approve: 'Approved', correction: 'Requested correction', reject: 'Rejected' }

  return (
    <main className="page wide">
      <Link to={`/artworks/${id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--muted)', marginBottom: -8 }}><ChevronLeft size={15} />Back to review</Link>
      <ArtworkHeader artwork={artwork} />

      {done && (
        <div className={`notice ${done.decision === 'approve' ? 'ok' : 'warn'}`} role="status" style={{ padding: '14px 16px', borderRadius: 14, animation: 'scaleIn 190ms' }}>
          {done.decision === 'approve' ? <ShieldCheck size={20} /> : <TriangleAlert size={20} />}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <b style={{ fontSize: 15 }}>{done.decision === 'approve' ? `${done.step} approved` : done.decision === 'correction' ? 'Correction requested' : 'Artwork rejected'}</b>
            <span>E-signed by {profile?.full_name} · {fmtDateTime(done.at)}{done.decision === 'approve' && currentStep(artwork) ? ` · Now with ${stepWho(currentStep(artwork), people)}` : ''}</span>
          </span>
        </div>
      )}

      <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card-head">
          <h2 className="card-title">Approval workflow</h2>
          <span className="muted" style={{ fontSize: 13 }}>{completed} of {artwork.steps.length} stages complete</span>
        </div>
        <div className="table-wrap">
          <div className="htimeline">
            {artwork.steps.map((s, i) => (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span className={`tl-dot ${s.state}`}>{s.state === 'done' && <Check size={14} strokeWidth={3} />}</span>
                  {i < artwork.steps.length - 1 && <span className={`tl-line ${s.state === 'done' ? 'done' : ''}`} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 12 }}>
                  <b style={{ fontSize: 14 }}>{s.name}</b>
                  <span style={{ fontSize: 12, fontWeight: 500, color: s.state === 'done' ? 'var(--s-ok-fg)' : s.state === 'current' ? 'var(--primary)' : 'var(--faint)' }}>
                    {s.state === 'done' ? `Completed · ${fmtDate(s.completed_at)}` : s.state === 'current' ? (artwork.status === 'correction' ? 'Waiting for correction' : 'Current') : 'Pending'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={s.completer?.full_name || stepWho(s, people)} size={24} />
                    <span className="ellipsis" style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.completer?.full_name || stepWho(s, people)}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="split" style={{ gap: 20 }}>
        <div className="grow card" id="compare" style={{ overflow: 'hidden' }}>
          <div className="card-head" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div className="section-title"><h2 style={{ fontSize: 18 }}>Version comparison</h2><span>Synchronized zoom and scroll</span></div>
            {versions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <label className="sr-only" htmlFor="lv">Left version</label>
                <select id="lv" className="select" style={{ height: 34, width: 'auto' }} value={leftId || ''} onChange={(e) => setLeftId(e.target.value)}>
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.version_label}</option>)}
                </select>
                <span className="muted" style={{ fontSize: 13 }}>vs</span>
                <label className="sr-only" htmlFor="rv">Right version</label>
                <select id="rv" className="select" style={{ height: 34, width: 'auto' }} value={rightId || ''} onChange={(e) => setRightId(e.target.value)}>
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.version_label}</option>)}
                </select>
                <span style={{ display: 'flex', alignItems: 'center', gap: 2, padding: 3, border: '1px solid var(--border)', borderRadius: 10 }}>
                  <button className="icon-btn sm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))} aria-label="Zoom out both"><Minus size={16} /></button>
                  <span className="mono" style={{ minWidth: 46, textAlign: 'center', fontSize: 13 }}>{Math.round(zoom * 100)}%</span>
                  <button className="icon-btn sm" onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))} aria-label="Zoom in both"><Plus size={16} /></button>
                </span>
              </div>
            )}
          </div>
          {versions.length === 0 ? (
            <Empty icon={Upload} tone="tone-blue" title="No versions to compare yet" text="Upload artwork files to compare versions side by side.">
              <button className="btn btn-primary" onClick={() => setUploadOpen(true)}><Upload size={16} />Upload version</button>
            </Empty>
          ) : (
            <>
              <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 1, background: 'var(--border)' }}>
                <ComparePane version={left} zoom={zoom} colW={colW} scrollRef={leftRef} onScroll={sync(leftRef, rightRef)} tag={left?.id === artwork.current_version_id ? 'Current' : 'Previous'} />
                <ComparePane version={right} zoom={zoom} colW={colW} scrollRef={rightRef} onScroll={sync(rightRef, leftRef)} tag={right?.id === artwork.current_version_id ? 'Current' : 'Selected'} />
              </div>
              <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <b style={{ fontSize: 13, color: 'var(--text-2)' }}>Detected changes · {changes.length}</b>
                {left?.id === right?.id && <span className="muted" style={{ fontSize: 14 }}>Pick two different versions to see what changed.</span>}
                {left?.id !== right?.id && changes.length === 0 && <span className="muted" style={{ fontSize: 14 }}>No differences in the recorded artwork details. Check the files visually above.</span>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                  {changes.map((c) => (
                    <div key={c.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="hint">{c.label}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
                        <span className="tag red" style={{ textDecoration: 'line-through', fontWeight: 500 }}>{c.from || 'empty'}</span>
                        <ArrowRight size={16} color="var(--faint)" />
                        <span className="tag" style={{ background: 'var(--s-ok-bg)', color: 'var(--s-ok-fg)', fontWeight: 500 }}>{c.to || 'empty'}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="side" style={{ gap: 20 }}>
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 className="card-title">Your decision</h2>
            {artwork.status === 'approved' ? (
              <div className="notice ok"><ShieldCheck size={18} /><span>This artwork is fully approved{artwork.approved_at ? ` (${fmtDate(artwork.approved_at)})` : ''}. Upload a new version to start another review.</span></div>
            ) : artwork.status === 'rejected' ? (
              <div className="notice warn"><TriangleAlert size={18} /><span>This artwork was rejected. Upload a new version to restart the review.</span></div>
            ) : !allowed ? (
              <div className="notice info"><Clock size={18} /><span>Waiting for <b>{stepWho(step, people)}</b> to complete <b>{step?.name}</b>. You’ll be able to act when it reaches your team.</span></div>
            ) : !artwork.current_version_id ? (
              <div className="notice warn"><TriangleAlert size={18} /><span>Upload an artwork file before approving.</span></div>
            ) : (
              <>
                <div className="notice info" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
                  <Columns2 size={17} color="var(--primary)" /><span>You’re signing <b>{step?.name}</b> for <b>{artwork.current_version?.version_label}</b>.</span>
                </div>
                {openComments > 0 && (
                  <div className="notice warn"><TriangleAlert size={17} /><span>{openComments} comment{openComments > 1 ? 's are' : ' is'} still open on this version. <Link to={`/artworks/${id}`} style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>Review them</Link></span></div>
                )}
                <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <legend className="label" style={{ marginBottom: 8 }}>Decision</legend>
                  {options.map((o) => (
                    <button key={o.k} type="button" className={`opt${decision === o.k ? ' on' : ''} ${o.tone || ''}`} aria-pressed={decision === o.k} onClick={() => setDecision(o.k)}>
                      <span className="radio" />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <b style={{ fontSize: 14 }}>{o.label}</b>
                        <span className="hint">{o.hint}</span>
                      </span>
                    </button>
                  ))}
                </fieldset>
                <div className="field">
                  <label htmlFor="remarks">Remarks {needsRemarks ? <span style={{ color: 'var(--s-rej-fg)' }}>*</span> : <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>}</label>
                  <textarea id="remarks" className="textarea" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Recorded in the audit trail" />
                </div>
                {isPasswordUser ? (
                  <div className="field">
                    <label htmlFor="sig">E-signature · confirm your password</label>
                    <input id="sig" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && sigReady && !(needsRemarks && !remarks.trim())) submit() }} />
                  </div>
                ) : (
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--text-2)' }}>
                    <input type="checkbox" checked={confirmSig} onChange={(e) => setConfirmSig(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--primary)' }} />
                    I, {profile?.full_name}, confirm this decision is my electronic signature.
                  </label>
                )}
                <button className={`btn btn-lg btn-block ${decision === 'correction' ? 'btn-warn' : decision === 'reject' ? 'btn-danger' : 'btn-primary'}`}
                  disabled={busy || !sigReady || (needsRemarks && !remarks.trim())} onClick={submit}>
                  {busy ? 'Signing…' : decision === 'correction' ? 'Sign & request correction' : decision === 'reject' ? 'Sign & reject' : 'Sign & approve'}
                </button>
              </>
            )}
          </div>

          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card-head">
              <h2 className="card-title">Version history</h2>
              {versions.length > 1 && <button className="btn btn-secondary btn-sm" onClick={() => { setLeftId(versions[1].id); setRightId(versions[0].id); document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth' }) }}>Compare Versions</button>}
            </div>
            {versions.length === 0 && <span className="muted" style={{ fontSize: 14 }}>No versions yet.</span>}
            <div>
              {versions.map((v, i) => {
                const cur = v.id === artwork.current_version_id
                return (
                  <div key={v.id} className="vtl" style={{ padding: '0 8px', borderRadius: 10, background: cur ? 'var(--primary-soft)' : 'transparent' }}>
                    <div className="vtl-rail" style={{ paddingTop: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 99, flex: 'none', background: cur ? 'var(--primary)' : 'var(--surface)', border: cur ? 0 : '2px solid var(--border-strong)', boxShadow: cur ? '0 0 0 4px var(--ring)' : 'none' }} />
                      {i < versions.length - 1 && <span className="tl-line" style={{ marginTop: 4 }} />}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 0 14px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <b className="mono" style={{ fontSize: 14 }}>{v.version_label}</b>
                        {cur && <span className="tag blue" style={{ padding: '1px 8px', fontSize: 11 }}>Current</span>}
                      </span>
                      <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{v.change_note || 'No change note'}</span>
                      <span className="hint">{fmtDate(v.created_at)} · {v.uploader?.full_name}</span>
                    </div>
                    {!cur && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'center' }} onClick={() => { setLeftId(v.id); setRightId(artwork.current_version_id); document.getElementById('compare')?.scrollIntoView({ behavior: 'smooth' }) }}>Compare</button>}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><History size={18} color="var(--primary)" />Audit trail</h2>
            {audit.length === 0 && <span className="muted" style={{ fontSize: 14 }}>No events yet.</span>}
            {audit.map((e) => (
              <div key={e.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
                <Avatar name={e.actor?.full_name || 'System'} size={28} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 14 }}><b style={{ fontWeight: 600 }}>{e.actor?.full_name || 'System'}</b> {actionLabel[e.action] || e.action}{e.detail?.version ? ` ${e.detail.version}` : ''}{e.detail?.step ? ` · ${e.detail.step}` : ''}</span>
                  {e.detail?.remarks && <span className="hint" style={{ whiteSpace: 'pre-wrap' }}>“{e.detail.remarks}”</span>}
                  <span className="hint" title={fmtDateTime(e.created_at)}>{timeAgo(e.created_at)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <UploadVersionModal open={uploadOpen} onClose={() => setUploadOpen(false)} artwork={artwork} versions={versions} onDone={reloadAll} />
    </main>
  )
}
