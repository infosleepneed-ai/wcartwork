import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, ArrowRight } from 'lucide-react'
import { useStore } from '../lib/store'
import { productName, STATUS_LABEL, todayISO } from '../lib/constants'
import { StatusPill } from './ui'

const SUGGESTIONS = [
  'Find Rosuvastatin Philippines artwork',
  'Show pending Tanzania artwork',
  'Which artworks are overdue?',
  'Open latest approved artwork for Dydrogesterone'
]

function interpret(text, { artworks, countries }) {
  const t = text.toLowerCase()
  const today = todayISO()
  let list = artworks.slice()
  const said = []

  const country = countries.find((c) => t.includes(c.name.toLowerCase()) || new RegExp(`\\b${c.code.toLowerCase()}\\b`).test(t))
  if (country) { list = list.filter((a) => a.country_code === country.code); said.push(country.name) }

  const words = t.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3)
  const productWord = words.find((w) => artworks.some((a) => a.product?.name.toLowerCase().includes(w)))
  if (productWord) { list = list.filter((a) => a.product?.name.toLowerCase().includes(productWord)); said.push(productWord[0].toUpperCase() + productWord.slice(1)) }

  if (/overdue|late|delayed/.test(t)) { list = list.filter((a) => a.due_date && a.due_date < today && a.status !== 'approved'); said.push('overdue') }
  else if (/due today/.test(t)) { list = list.filter((a) => a.due_date === today && a.status !== 'approved'); said.push('due today') }
  if (/correction/.test(t)) { list = list.filter((a) => a.status === 'correction'); said.push('in correction') }
  else if (/approved/.test(t)) { list = list.filter((a) => a.status === 'approved'); said.push('approved') }
  else if (/pending|waiting|open/.test(t) && !/latest/.test(t)) { list = list.filter((a) => !['approved', 'rejected'].includes(a.status)); said.push('still open') }
  if (/urgent/.test(t)) { list = list.filter((a) => a.priority === 'urgent'); said.push('urgent') }

  if (/latest|newest|recent/.test(t)) list.sort((a, b) => new Date(b.approved_at || b.updated_at) - new Date(a.approved_at || a.updated_at))

  const wantsOpen = /^open\b/.test(t.trim()) && list.length > 0
  let reply
  if (/dossier/.test(t)) reply = 'Dossiers are not live in WC Artwork Hub yet, so I searched artwork instead. '
  else reply = ''
  if (!said.length) reply += list.length ? `Here are the most recently updated artworks.` : `I couldn't find any artwork yet.`
  else reply += list.length ? `Found ${list.length} artwork${list.length === 1 ? '' : 's'} matching ${said.join(', ')}.` : `No artwork matches ${said.join(', ')}.`
  return { reply, results: list.slice(0, 6), openFirst: wantsOpen ? list[0] : null }
}

export default function Assist() {
  const store = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [log, setLog] = useState([])
  const bodyRef = useRef(null)

  useEffect(() => { bodyRef.current?.scrollTo({ top: 1e6, behavior: 'smooth' }) }, [log])

  const ask = (text) => {
    if (!text.trim()) return
    const res = interpret(text, store)
    setLog((l) => [...l, { me: text }, { bot: res.reply, results: res.results }])
    setQ('')
    if (res.openFirst) setTimeout(() => { setOpen(false); nav(`/artworks/${res.openFirst.id}`) }, 700)
  }

  return (
    <>
      {open && (
        <div className="assist" role="dialog" aria-label="WC Assist">
          <div className="assist-head">
            <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={17} /></span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <b style={{ fontSize: 15 }}>WC Assist</b>
              <span style={{ fontSize: 12, color: '#C9CCEE' }}>Finds artwork by product, country, status or deadline</span>
            </span>
            <button className="icon-btn sm" style={{ color: '#fff' }} onClick={() => setOpen(false)} aria-label="Close WC Assist"><X size={17} /></button>
          </div>
          <div className="assist-body" ref={bodyRef}>
            {log.length === 0 && (
              <>
                <span className="palette-section" style={{ padding: '0 0 2px' }}>Try asking</span>
                {SUGGESTIONS.map((s) => <button key={s} className="chip-btn" onClick={() => ask(s)}>{s}</button>)}
              </>
            )}
            {log.map((m, i) => m.me ? (
              <div key={i} className="bubble me">{m.me}</div>
            ) : (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="bubble bot">{m.bot}</div>
                {m.results.map((a) => (
                  <button key={a.id} className="chip-btn" style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    onClick={() => { setOpen(false); nav(`/artworks/${a.id}`) }}>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                      <span className="ellipsis" style={{ fontWeight: 500, color: 'var(--text)' }}>{productName(a.product)}</span>
                      <span className="menu-sub">{a.code} · {a.country?.name} · {a.artwork_type}</span>
                    </span>
                    <StatusPill status={a.status} label={STATUS_LABEL[a.status]} />
                  </button>
                ))}
              </div>
            ))}
          </div>
          <form style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}
            onSubmit={(e) => { e.preventDefault(); ask(q) }}>
            <label htmlFor="assist-q" className="sr-only">Ask WC Assist</label>
            <input id="assist-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything…" style={{ height: 42 }} />
            <button className="btn btn-primary" style={{ width: 42, padding: 0 }} aria-label="Send"><ArrowRight size={17} /></button>
          </form>
        </div>
      )}
      <button className="assist-fab" onClick={() => setOpen((v) => !v)} aria-label="Open WC Assist">
        <Sparkles size={19} color="#5CC2F2" />WC Assist
      </button>
    </>
  )
}
