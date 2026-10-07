import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Plus, Clock, MessageSquareWarning, CircleCheck, Gauge, Inbox, CalendarClock, Globe, AlarmClock,
  ChartColumn, Users, ArrowUpRight, PartyPopper, MessageSquare, Activity, FileText
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import * as api from '../lib/api'
import {
  PIPELINE, STATUS_LABEL, STATUS_DOT, ROLE_LABEL, ROLE_TEAM, greeting, productName, timeAgo, todayISO,
  currentStep, dueInfo
} from '../lib/constants'
import { StatusPill, Sparkline, Empty, ProductTile, Skeleton, DueTag } from '../components/ui'

const DAY = 86400000
const weekly = (items, getDate, weeks = 7) => {
  const now = Date.now()
  const out = Array(weeks).fill(0)
  items.forEach((it) => {
    const d = getDate(it); if (!d) return
    const w = Math.floor((now - new Date(d).getTime()) / (7 * DAY))
    if (w >= 0 && w < weeks) out[weeks - 1 - w]++
  })
  return out
}
const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null)
const startOfMonth = (offset = 0) => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); d.setMonth(d.getMonth() + offset); return d }

function buildCards(role, artworks, myQueue) {
  const today = todayISO()
  const open = artworks.filter((a) => !['approved', 'rejected'].includes(a.status))
  const approved = artworks.filter((a) => a.approved_at)
  const m0 = startOfMonth(0), m1 = startOfMonth(-1)
  const apprThis = approved.filter((a) => new Date(a.approved_at) >= m0).length
  const apprLast = approved.filter((a) => new Date(a.approved_at) >= m1 && new Date(a.approved_at) < m0).length
  const days = (list) => list.length ? list.reduce((s, a) => s + (new Date(a.approved_at) - new Date(a.created_at)) / DAY, 0) / list.length : null
  const recent = approved.filter((a) => Date.now() - new Date(a.approved_at) < 90 * DAY)
  const prior = approved.filter((a) => { const t = Date.now() - new Date(a.approved_at); return t >= 90 * DAY && t < 180 * DAY })
  const avg = days(recent), avgPrior = days(prior)
  const corrections = artworks.filter((a) => a.status === 'correction')
  const corrToday = corrections.filter((a) => a.updated_at?.slice(0, 10) === today).length
  const overdue = open.filter((a) => a.due_date && a.due_date < today)
  const dueToday = open.filter((a) => a.due_date === today)
  const urgentQ = myQueue.filter((a) => a.priority === 'urgent' || (a.due_date && a.due_date <= today)).length
  const g = pct(apprThis, apprLast)

  const C = {
    queue: { label: 'Waiting for you', value: myQueue.length, trend: urgentQ ? `${urgentQ} urgent or due` : 'Nothing urgent', t: urgentQ ? 'warn' : 'neutral', tone: 'amber', icon: Clock, href: '/artworks?view=mine', spark: weekly(myQueue, (a) => a.updated_at) },
    corrections: { label: 'Correction required', value: corrections.length, trend: `${corrToday} received today`, t: corrToday ? 'warn' : 'neutral', tone: 'orange', icon: MessageSquareWarning, href: '/artworks?status=correction', spark: weekly(corrections, (a) => a.updated_at) },
    approvedMonth: { label: 'Approved this month', value: apprThis, trend: g === null ? `${apprLast} last month` : `${g >= 0 ? '↑' : '↓'} ${Math.abs(g)}% vs last month`, t: g === null || g >= 0 ? 'good' : 'warn', tone: 'green', icon: CircleCheck, href: '/artworks?status=approved', spark: weekly(approved, (a) => a.approved_at) },
    avgTime: { label: 'Avg. approval time', value: avg === null ? '—' : avg.toFixed(1), unit: avg === null ? '' : 'days', trend: avg !== null && avgPrior !== null ? `${avg <= avgPrior ? '↓' : '↑'} ${Math.abs(avg - avgPrior).toFixed(1)} days vs prior 90` : 'Last 90 days', t: avg !== null && avgPrior !== null && avg > avgPrior ? 'warn' : 'good', tone: 'blue', icon: Gauge, href: '/artworks?status=approved', spark: weekly(recent, (a) => a.approved_at) },
    newRequests: { label: 'New requests', value: artworks.filter((a) => a.status === 'draft' || (a.status === 'under_review' && currentStep(a)?.position === 2)).length, trend: `${artworks.filter((a) => a.created_at?.slice(0, 10) === today).length} arrived today`, t: 'neutral', tone: 'blue', icon: Inbox, href: '/artworks?status=draft', spark: weekly(artworks, (a) => a.created_at) },
    dueToday: { label: 'Due today', value: dueToday.length, trend: `${overdue.length} overdue`, t: overdue.length ? 'warn' : 'good', tone: 'amber', icon: CalendarClock, href: '/artworks?view=due', spark: weekly(open, (a) => a.due_date) },
    completedWeek: { label: 'Approved this week', value: approved.filter((a) => Date.now() - new Date(a.approved_at) < 7 * DAY).length, trend: 'Last 7 days', t: 'good', tone: 'green', icon: CircleCheck, href: '/artworks?status=approved', spark: weekly(approved, (a) => a.approved_at) },
    createdMonth: { label: 'Artworks this month', value: artworks.filter((a) => new Date(a.created_at) >= m0).length, trend: `${artworks.filter((a) => new Date(a.created_at) >= m1 && new Date(a.created_at) < m0).length} last month`, t: 'neutral', tone: 'blue', icon: ChartColumn, href: '/artworks', spark: weekly(artworks, (a) => a.created_at) },
    countries: { label: 'Active countries', value: new Set(open.map((a) => a.country_code)).size, trend: 'With open artwork', t: 'neutral', tone: 'navy', icon: Globe, href: '/artworks', spark: null },
    overdue: { label: 'Overdue', value: overdue.length, trend: overdue.length ? 'Needs follow-up' : 'All on time', t: overdue.length ? 'warn' : 'good', tone: 'orange', icon: AlarmClock, href: '/artworks?view=overdue', spark: null },
    urgent: { label: 'Urgent artwork', value: open.filter((a) => a.priority === 'urgent').length, trend: `${dueToday.length} due today`, t: 'warn', tone: 'orange', icon: AlarmClock, href: '/artworks?view=urgent', spark: null },
    workload: { label: 'Open artwork', value: open.length, trend: `${artworks.filter((a) => a.status === 'pending_approval').length} pending approval`, t: 'neutral', tone: 'navy', icon: Users, href: '/artworks', spark: weekly(open, (a) => a.created_at) }
  }
  const sets = {
    regulatory: ['queue', 'corrections', 'approvedMonth', 'avgTime'],
    designer: ['newRequests', 'corrections', 'dueToday', 'completedWeek'],
    management: ['createdMonth', 'avgTime', 'countries', 'overdue'],
    export: ['queue', 'countries', 'urgent', 'approvedMonth'],
    qa: ['queue', 'approvedMonth', 'avgTime', 'overdue'],
    admin: ['queue', 'workload', 'approvedMonth', 'avgTime']
  }
  return (sets[role] || sets.regulatory).map((k) => C[k])
}

const SPARK = { amber: 'var(--s-pend-dot)', orange: 'var(--s-corr-dot)', green: 'var(--s-ok-dot)', blue: 'var(--accent)', navy: '#5A52C9' }
const VIEW_ROLES = ['regulatory', 'designer', 'management', 'export']

export default function Dashboard() {
  const { profile } = useAuth()
  const { artworks, myQueue, counts, loadingArtworks, open } = useStore()
  const nav = useNavigate()
  const [viewRole, setViewRole] = useState(null)
  const [stage, setStage] = useState(null)
  const [activity, setActivity] = useState(null)
  const role = viewRole || (VIEW_ROLES.includes(profile?.role) ? profile.role : 'regulatory')

  useEffect(() => { api.listAudit(null, 8).then(setActivity).catch(() => setActivity([])) }, [artworks])

  const cards = useMemo(() => buildCards(role, artworks, myQueue), [role, artworks, myQueue])
  const attention = useMemo(() => {
    const rank = (a) => (a.priority === 'urgent' ? 0 : a.priority === 'high' ? 1 : 2)
    return myQueue.slice().sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || rank(a) - rank(b)).slice(0, 6)
  }, [myQueue])
  const recentRows = useMemo(() => artworks.filter((a) => !stage || a.status === stage).slice(0, 8), [artworks, stage])
  const overdue = useMemo(() => artworks.filter((a) => dueInfo(a)?.label === 'Overdue').slice(0, 5), [artworks])
  const maxCount = Math.max(1, ...PIPELINE.map((s) => counts[s] || 0))
  const firstName = (profile?.full_name || '').split(' ')[0]
  const activeTotal = artworks.filter((a) => !['approved', 'rejected'].includes(a.status)).length

  const actionLabel = { created: 'created', version_uploaded: 'uploaded a new version of', approve: 'approved a step on', correction: 'requested correction on', reject: 'rejected' }

  return (
    <main className="page">
      <section className="page-head">
        <div>
          <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <h1 style={{ marginTop: 6 }}>{greeting()}, {firstName} 👋</h1>
          <p>Here’s what needs your attention today.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div className="segmented" role="group" aria-label="View dashboard as">
            {VIEW_ROLES.map((r) => (
              <button key={r} className={role === r ? 'on' : ''} aria-pressed={role === r} onClick={() => setViewRole(r)}>{ROLE_LABEL[r]}</button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => open('create')}><Plus size={17} strokeWidth={2.2} />Create Artwork Request</button>
        </div>
      </section>

      <section className="kpis" aria-label="Key numbers">
        {cards.map((k) => (
          <Link key={k.label} to={k.href} className="card lift kpi">
            <div className="kpi-top">
              <span className="kpi-label"><span className={`kpi-icon tone-${k.tone}`}><k.icon size={17} /></span>{k.label}</span>
              <ArrowUpRight size={16} color="var(--faint)" />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {loadingArtworks ? <Skeleton h={32} w={64} /> : <span className="kpi-value">{k.value}{k.unit && <small>{k.unit}</small>}</span>}
                <span className={`kpi-trend trend-${k.t}`}>{k.trend}</span>
              </div>
              {k.spark && <Sparkline data={k.spark} color={SPARK[k.tone]} />}
            </div>
          </Link>
        ))}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card-head">
          <div className="section-title"><h2>Needs your attention</h2><span>{ROLE_TEAM[profile?.role] || ''} queue · {myQueue.length}</span></div>
          <Link to="/artworks?view=mine" style={{ fontWeight: 500 }}>View all tasks</Link>
        </div>
        {loadingArtworks ? (
          <div className="task-grid">{[0, 1, 2].map((i) => <div key={i} className="card task"><Skeleton h={18} w="40%" /><Skeleton h={64} /><Skeleton h={40} /></div>)}</div>
        ) : attention.length === 0 ? (
          <div className="card"><Empty icon={PartyPopper} title="No artwork needs your approval 🎉" text="You’re all caught up." /></div>
        ) : (
          <div className="task-grid">
            {attention.map((a) => {
              const step = currentStep(a)
              const corr = a.status === 'correction'
              const d = dueInfo(a)
              return (
                <article key={a.id} className="card lift task">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {d ? <DueTag artwork={a} /> : a.priority !== 'normal' ? <span className="tag orange">{a.priority === 'urgent' ? 'Urgent' : 'High priority'}</span> : <span className="tag grey">No due date</span>}
                    <span className="mono muted" style={{ fontSize: 12 }}>{a.code}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <span className="thumb"><ProductTile name={a.product?.name} size={36} /></span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <b style={{ fontSize: 16, fontWeight: 600 }}>{productName(a.product)}</b>
                      <span className="muted" style={{ fontSize: 13 }}>{a.country?.name} · {a.artwork_type} · {a.current_version?.version_label || 'No file yet'}</span>
                      <span style={{ alignSelf: 'flex-start' }}>
                        <StatusPill status={a.status} label={corr ? 'Correction Required' : step && a.status === 'pending_approval' ? `Pending ${step.name}` : undefined} />
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    {corr ? (
                      <Link className="btn btn-secondary" style={{ flex: 1 }} to={`/artworks/${a.id}`}><MessageSquare size={16} />View Comments</Link>
                    ) : (
                      <>
                        <Link className="btn btn-primary" style={{ flex: 1 }} to={`/artworks/${a.id}`}>Review Artwork</Link>
                        <Link className="btn btn-secondary" style={{ flex: 1 }} to={`/artworks/${a.id}/approval`}>View Details</Link>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card-head">
          <div className="section-title"><h2>Artwork pipeline</h2><span>{activeTotal} active · click a stage to filter</span></div>
          {stage && <button className="btn btn-secondary btn-sm" onClick={() => setStage(null)}>Clear filter</button>}
        </div>
        <div className="pipeline">
          {PIPELINE.map((s) => (
            <button key={s} className={`stage${stage === s ? ' on' : ''}`} aria-pressed={stage === s} onClick={() => setStage(stage === s ? null : s)}>
              <span className="stage-label"><span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_DOT[s] }} />{STATUS_LABEL[s]}</span>
              <span className="stage-count">{counts[s] || 0}</span>
              <span className="bar"><span style={{ width: `${Math.max(4, ((counts[s] || 0) / maxCount) * 100)}%`, background: STATUS_DOT[s] }} /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="split">
        <div className="grow card" style={{ overflow: 'hidden' }}>
          <div className="card-head" style={{ padding: '18px 20px' }}>
            <div className="section-title"><h2>Recent artwork</h2><span>{stage ? `Filtered: ${STATUS_LABEL[stage]}` : 'Latest updates'}</span></div>
            <Link to={stage ? `/artworks?status=${stage}` : '/artworks'} style={{ fontWeight: 500 }}>View all</Link>
          </div>
          <div className="table-wrap">
            <div style={{ minWidth: 760 }}>
              <div className="thead" style={{ position: 'static', gridTemplateColumns: '128px minmax(180px,2fr) 140px 80px minmax(110px,1fr) 160px', borderTop: '1px solid var(--border)' }}>
                <span>Artwork ID</span><span>Product</span><span>Market</span><span>Version</span><span>Last update</span><span>Status</span>
              </div>
              {recentRows.map((a) => (
                <Link key={a.id} to={`/artworks/${a.id}`} className="trow" style={{ gridTemplateColumns: '128px minmax(180px,2fr) 140px 80px minmax(110px,1fr) 160px', minHeight: 56 }}>
                  <span className="mono muted" style={{ fontSize: 13 }}>{a.code}</span>
                  <span className="cell-stack"><b>{productName(a.product)}</b><small>{a.artwork_type}</small></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="cc">{a.country_code}</span><span className="ellipsis">{a.country?.name}</span></span>
                  <span className="mono" style={{ fontSize: 13 }}>{a.current_version?.version_label || '—'}</span>
                  <span className="muted" style={{ fontSize: 13 }}>{timeAgo(a.updated_at)}</span>
                  <span><StatusPill status={a.status} /></span>
                </Link>
              ))}
              {!loadingArtworks && recentRows.length === 0 && (
                stage ? <Empty icon={PartyPopper} title="Nothing in this stage 🎉" text="You’re all caught up." />
                  : <Empty icon={FileText} tone="tone-blue" title="No artwork yet" text="Create the first artwork request to start the workflow.">
                    <button className="btn btn-primary" onClick={() => open('create')}><Plus size={16} />New Artwork Request</button>
                  </Empty>
              )}
            </div>
          </div>
        </div>

        <div className="side">
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card-head"><span style={{ fontSize: 16, fontWeight: 600 }}>Overdue</span><Link to="/artworks?view=overdue" style={{ fontSize: 13, fontWeight: 500 }}>View all</Link></div>
            {overdue.length === 0 ? (
              <Empty icon={CircleCheck} title="No overdue artwork 🎉" text="You’re all caught up." />
            ) : overdue.map((a) => (
              <button key={a.id} className="menu-item" style={{ padding: '8px 6px' }} onClick={() => nav(`/artworks/${a.id}`)}>
                <ProductTile name={a.product?.name} size={32} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span className="ellipsis" style={{ fontWeight: 500 }}>{productName(a.product)}</span>
                  <span className="menu-sub">{a.country?.name} · due {a.due_date}</span>
                </span>
                <StatusPill status={a.status} />
              </button>
            ))}
          </div>

          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}><Activity size={17} color="var(--primary)" />Recent activity</span>
            {activity === null && <><Skeleton h={14} /><Skeleton h={14} w="80%" /></>}
            {activity?.length === 0 && <span className="muted" style={{ fontSize: 14, padding: '8px 0' }}>Activity appears here as your team works.</span>}
            {activity?.map((e) => (
              <Link key={e.id} to={e.artwork?.id ? `/artworks/${e.artwork.id}` : '#'} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 0', borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                <span style={{ fontSize: 14 }}><b style={{ fontWeight: 600 }}>{e.actor?.full_name || 'System'}</b> {actionLabel[e.action] || e.action} {productName(e.artwork?.product)}</span>
                <span className="hint">{e.artwork?.code} · {timeAgo(e.created_at)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
