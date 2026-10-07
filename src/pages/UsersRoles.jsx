import { useEffect, useState } from 'react'
import { ShieldCheck, Users } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'
import * as api from '../lib/api'
import { ROLES, ROLE_LABEL, fmtDate } from '../lib/constants'
import { Avatar, Empty, Spinner } from '../components/ui'

const ROLE_HELP = {
  designer: 'Creates artwork, uploads versions, handles Design Review and corrections',
  regulatory: 'Signs Regulatory Review',
  export: 'Signs Export Review and records Customer Approval',
  qa: 'Signs Final Approval',
  management: 'Views everything, signs nothing',
  admin: 'Can act on any step and manage users'
}

export default function UsersRoles() {
  const { isAdmin, user, refreshProfile } = useAuth()
  const { toast } = useStore()
  const [people, setPeople] = useState(null)

  useEffect(() => { api.listProfiles().then(setPeople).catch((e) => toast(e.message, 'error')) }, [toast])

  const change = async (p, role) => {
    try {
      await api.updateProfile(p.id, { role })
      setPeople((list) => list.map((x) => (x.id === p.id ? { ...x, role } : x)))
      if (p.id === user.id) refreshProfile()
      toast(`${p.full_name} is now ${ROLE_LABEL[role]}`)
    } catch (e) { toast(e.message, 'error') }
  }

  const grid = 'minmax(220px,2fr) minmax(180px,1.4fr) 180px 120px'
  return (
    <main className="page" style={{ gap: 20 }}>
      <section className="page-head">
        <div><h1>Users &amp; roles</h1><p>Roles decide which approval step each person can sign.</p></div>
      </section>
      {!isAdmin && <div className="notice info"><ShieldCheck size={17} /><span>Only admins can change roles. Ask an admin if your role is wrong.</span></div>}
      <section className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, padding: 16 }}>
        {ROLES.map((r) => <div key={r} className="info"><span>{ROLE_LABEL[r]}</span><b style={{ whiteSpace: 'normal', fontWeight: 500, fontSize: 13 }}>{ROLE_HELP[r]}</b></div>)}
      </section>
      <section className="card" style={{ overflow: 'hidden' }}>
        {people === null ? <Spinner /> : people.length === 0 ? <Empty icon={Users} title="No users yet" /> : (
          <div className="table-wrap"><div style={{ minWidth: 700 }}>
            <div className="thead" style={{ gridTemplateColumns: grid, position: 'static' }}><span>Name</span><span>Email</span><span>Role</span><span>Joined</span></div>
            {people.map((p) => (
              <div key={p.id} className="trow" style={{ gridTemplateColumns: grid }}>
                <span className="cell-product"><Avatar name={p.full_name} size={32} /><b style={{ fontWeight: 500 }}>{p.full_name}{p.id === user.id ? ' (you)' : ''}</b></span>
                <span className="muted ellipsis">{p.email}</span>
                {isAdmin ? (
                  <select className="select" style={{ height: 36 }} value={p.role} onChange={(e) => change(p, e.target.value)} aria-label={`Role for ${p.full_name}`}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                ) : <span>{ROLE_LABEL[p.role]}</span>}
                <span className="muted">{fmtDate(p.created_at)}</span>
              </div>
            ))}
          </div></div>
        )}
      </section>
    </main>
  )
}
