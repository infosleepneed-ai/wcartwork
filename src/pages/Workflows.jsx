import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, ArrowUp, ArrowDown, Trash2, Copy, Save, ShieldCheck, Workflow as WorkflowIcon, X, UserPlus, ChevronRight, Star } from 'lucide-react'
import { useStore } from '../lib/store'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import { ROLE_LABEL, ROLE_TEAM, stepWho } from '../lib/constants'
import { Avatar, Empty, Spinner } from '../components/ui'

const SIGN_ROLES = ['designer', 'regulatory', 'export', 'qa', 'management']
const USE_ROLES = ['designer', 'regulatory', 'export', 'qa', 'management']
const blank = () => ({ id: null, name: '', description: '', is_default: false, active: true, allowed_roles: [], steps: [{ key: Math.random(), name: '', role: '', assignee_ids: [] }] })

function PeoplePicker({ value, onChange, people, disabled }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const chosen = value.map((id) => people.find((p) => p.id === id)).filter(Boolean)
  const options = people.filter((p) => !value.includes(p.id) && `${p.full_name} ${p.email}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', position: 'relative' }} ref={ref}>
      {chosen.map((p) => (
        <span key={p.id} className="tag blue" style={{ padding: '3px 4px 3px 4px', gap: 6 }}>
          <Avatar name={p.full_name} size={20} />{p.full_name}
          {!disabled && <button type="button" className="icon-btn sm" style={{ width: 20, height: 20 }} aria-label={`Remove ${p.full_name}`} onClick={() => onChange(value.filter((x) => x !== p.id))}><X size={12} /></button>}
        </span>
      ))}
      {!disabled && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}><UserPlus size={15} />Add person</button>
      )}
      {open && (
        <div className="popover" style={{ top: 38, left: 0, width: 280, maxHeight: 300, overflowY: 'auto' }}>
          <input className="input" autoFocus style={{ height: 36, marginBottom: 4 }} placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
          {options.length === 0 && <div className="muted" style={{ padding: 10, fontSize: 13 }}>No one else to add.</div>}
          {options.map((p) => (
            <button key={p.id} type="button" className="menu-item" onClick={() => { onChange([...value, p.id]); setQ(''); setOpen(false) }}>
              <Avatar name={p.full_name} size={28} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span className="ellipsis" style={{ fontWeight: 500 }}>{p.full_name}</span>
                <span className="menu-sub">{ROLE_LABEL[p.role]} · {p.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Workflows() {
  const { isAdmin } = useAuth()
  const { people, toast, artworks } = useStore()
  const [list, setList] = useState(null)
  const [selId, setSelId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = async (keep) => {
    try {
      const rows = await api.listWorkflows()
      setList(rows)
      const pick = rows.find((w) => w.id === (keep || selId)) || rows.find((w) => w.is_default) || rows[0]
      if (pick) select(pick)
    } catch (e) { toast(e.message, 'error'); setList([]) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function select(w) {
    setSelId(w.id)
    setDraft({ ...w, description: w.description || '', allowed_roles: w.allowed_roles || [], steps: w.steps.map((s) => ({ ...s, key: s.id, role: s.role || '', assignee_ids: s.assignee_ids || [] })) })
    setDirty(false)
  }
  const confirmLeave = () => !dirty || window.confirm('You have unsaved changes. Discard them?')
  const upd = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true) }
  const updStep = (i, patch) => upd({ steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  const move = (i, dir) => {
    const s = [...draft.steps]; const j = i + dir
    if (j < 0 || j >= s.length) return
    ;[s[i], s[j]] = [s[j], s[i]]; upd({ steps: s })
  }

  const usage = useMemo(() => {
    const m = {}; artworks.forEach((a) => { if (a.workflow_id) m[a.workflow_id] = (m[a.workflow_id] || 0) + 1 }); return m
  }, [artworks])

  const problems = useMemo(() => {
    if (!draft) return []
    const p = []
    if (!draft.name.trim()) p.push('Give the workflow a name')
    if (!draft.steps.length) p.push('Add at least one step')
    draft.steps.forEach((s, i) => {
      if (!s.name.trim()) p.push(`Step ${i + 1} needs a name`)
      if (!s.role && !s.assignee_ids.length) p.push(`Step ${i + 1} needs a team or a person who can sign`)
    })
    if (draft.is_default && !draft.active) p.push('The default workflow must be active')
    return p
  }, [draft])

  const save = async () => {
    setBusy(true)
    try {
      const id = await api.saveWorkflow(draft)
      toast('Workflow saved')
      setDirty(false)
      await load(id)
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!window.confirm(`Delete workflow “${draft.name}”? Artworks already using it keep their steps.`)) return
    try { await api.deleteWorkflow(draft.id); toast('Workflow deleted'); setSelId(null); setDirty(false); load() }
    catch (e) { toast(e.message, 'error') }
  }

  if (list === null) return <main className="page"><Spinner label="Loading workflows…" /></main>
  const ro = !isAdmin

  return (
    <main className="page" style={{ gap: 20 }}>
      <section className="page-head">
        <div>
          <h1>Workflows</h1>
          <p>Decide the approval steps for artwork and who can sign each one.</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => { if (confirmLeave()) { setSelId(null); setDraft(blank()); setDirty(true) } }}><Plus size={17} />New workflow</button>}
      </section>

      {ro && <div className="notice info"><ShieldCheck size={17} /><span>Only admins can create or change workflows. You can view them.</span></div>}

      <section className="split" style={{ gap: 20 }}>
        <aside style={{ flex: '1 1 260px', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 10, alignSelf: 'flex-start' }}>
          {list.map((w) => (
            <button key={w.id} type="button" className={`card lift`} onClick={() => { if (w.id !== selId && confirmLeave()) select(w) }}
              style={{ textAlign: 'left', padding: 14, display: 'flex', flexDirection: 'column', gap: 6, font: 'inherit', color: 'var(--text)', borderColor: w.id === selId ? 'var(--primary)' : undefined, boxShadow: w.id === selId ? '0 0 0 3px var(--ring)' : undefined }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ flex: 1, fontSize: 15 }} className="ellipsis">{w.name}</b>
                {w.is_default && <span className="tag blue"><Star size={11} />Default</span>}
                {!w.active && <span className="tag grey">Inactive</span>}
              </span>
              <span className="hint">{w.steps.length} step{w.steps.length === 1 ? '' : 's'} · used by {usage[w.id] || 0} artwork{(usage[w.id] || 0) === 1 ? '' : 's'}</span>
              <span className="hint ellipsis">{w.steps.map((s) => s.name).join(' → ')}</span>
            </button>
          ))}
          {list.length === 0 && <div className="card"><Empty icon={WorkflowIcon} tone="tone-blue" title="No workflows yet" text="Run workflows.sql in Supabase to add the standard workflow." /></div>}
        </aside>

        <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!draft ? (
            <div className="card"><Empty icon={WorkflowIcon} tone="tone-blue" title="Pick a workflow" text="Choose one on the left, or create a new one." /></div>
          ) : (
            <>
              <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor="wf-name">Workflow name *</label>
                    <input id="wf-name" className="input" disabled={ro} value={draft.name} onChange={(e) => upd({ name: e.target.value })} placeholder="e.g. Quick label change" />
                  </div>
                  <div className="field">
                    <label htmlFor="wf-desc">Description</label>
                    <input id="wf-desc" className="input" disabled={ro} value={draft.description} onChange={(e) => upd({ description: e.target.value })} placeholder="When should people pick this workflow?" />
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input type="checkbox" disabled={ro} checked={draft.is_default} onChange={(e) => upd({ is_default: e.target.checked, active: e.target.checked ? true : draft.active })} style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
                    Default workflow for new requests
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                    <input type="checkbox" disabled={ro || draft.is_default} checked={draft.active} onChange={(e) => upd({ active: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
                    Active (can be picked when creating artwork)
                  </label>
                </div>
                <div className="field">
                  <span className="label">Who can use this workflow</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button type="button" disabled={ro} className={`fpill${draft.allowed_roles.length === 0 ? ' on' : ''}`} onClick={() => upd({ allowed_roles: [] })}>Everyone</button>
                    {USE_ROLES.map((r) => {
                      const on = draft.allowed_roles.includes(r)
                      return (
                        <button key={r} type="button" disabled={ro} className={`fpill${on ? ' on' : ''}`} aria-pressed={on}
                          onClick={() => upd({ allowed_roles: on ? draft.allowed_roles.filter((x) => x !== r) : [...draft.allowed_roles, r] })}>
                          {ROLE_LABEL[r]}
                        </button>
                      )
                    })}
                  </div>
                  <span className="hint">Admins can always use every workflow.</span>
                </div>
              </div>

              <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span className="label">Flow preview</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <span className="pill s-approved">Artwork Created</span>
                  {draft.steps.map((s, i) => (
                    <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ChevronRight size={14} color="var(--faint)" />
                      <span className="pill s-under_review" title={stepWho(s, people)}>{s.name || `Step ${i + 1}`}</span>
                    </span>
                  ))}
                  <ChevronRight size={14} color="var(--faint)" /><span className="pill s-approved">Approved</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {draft.steps.map((s, i) => (
                  <div key={s.key} className="card" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <span className="step-num" style={{ background: 'var(--primary)', borderColor: 'var(--primary)', color: 'var(--on-primary)', marginTop: 10, flex: 'none' }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="grid-2">
                        <div className="field">
                          <label htmlFor={`st-n-${i}`}>Step name</label>
                          <input id={`st-n-${i}`} className="input" disabled={ro} value={s.name} onChange={(e) => updStep(i, { name: e.target.value })} placeholder="e.g. Regulatory Review" />
                        </div>
                        <div className="field">
                          <label htmlFor={`st-r-${i}`}>Team that can sign</label>
                          <select id={`st-r-${i}`} className="select" disabled={ro} value={s.role} onChange={(e) => updStep(i, { role: e.target.value })}>
                            <option value="">No team — only the people below</option>
                            {SIGN_ROLES.map((r) => <option key={r} value={r}>{ROLE_TEAM[r]}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="field">
                        <span className="label">Specific people who can sign <span className="muted" style={{ fontWeight: 400 }}>(in addition to the team)</span></span>
                        <PeoplePicker value={s.assignee_ids} onChange={(v) => updStep(i, { assignee_ids: v })} people={people} disabled={ro} />
                      </div>
                    </div>
                    {!ro && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button className="icon-btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move step ${i + 1} up`}><ArrowUp size={16} /></button>
                        <button className="icon-btn sm" disabled={i === draft.steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move step ${i + 1} down`}><ArrowDown size={16} /></button>
                        <button className="icon-btn sm" disabled={draft.steps.length === 1} onClick={() => upd({ steps: draft.steps.filter((_, j) => j !== i) })} aria-label={`Remove step ${i + 1}`}><Trash2 size={16} /></button>
                      </div>
                    )}
                  </div>
                ))}
                {!ro && (
                  <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => upd({ steps: [...draft.steps, { key: Math.random(), name: '', role: '', assignee_ids: [] }] })}>
                    <Plus size={16} />Add step
                  </button>
                )}
              </div>

              {!ro && (
                <div className="card card-pad" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, position: 'sticky', bottom: 16, zIndex: 5 }}>
                  <span className="hint" style={{ flex: 1, minWidth: 200 }}>
                    {problems.length ? problems[0] : draft.id && usage[draft.id] ? `Changes apply to new requests. ${usage[draft.id]} existing artwork${usage[draft.id] === 1 ? '' : 's'} keep their current steps.` : dirty ? 'Unsaved changes' : 'All changes saved'}
                  </span>
                  {draft.id && !draft.is_default && <button className="btn btn-ghost" onClick={remove}><Trash2 size={16} />Delete</button>}
                  {draft.id && <button className="btn btn-secondary" onClick={() => { if (confirmLeave()) { setSelId(null); setDraft({ ...draft, id: null, name: `${draft.name} (copy)`, is_default: false, steps: draft.steps.map((s) => ({ ...s, key: Math.random() })) }); setDirty(true) } }}><Copy size={16} />Duplicate</button>}
                  <button className="btn btn-primary" disabled={busy || problems.length > 0 || !dirty} onClick={save}><Save size={16} />{busy ? 'Saving…' : 'Save workflow'}</button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
