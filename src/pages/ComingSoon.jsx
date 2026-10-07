import { useParams, Link } from 'react-router-dom'
import { Hammer } from 'lucide-react'
import { Empty } from '../components/ui'

export default function ComingSoon() {
  const { name } = useParams()
  const title = (name || 'This module').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return (
    <main className="page">
      <div className="card" style={{ padding: 24 }}>
        <Empty icon={Hammer} tone="tone-blue" title={`${title} is coming next`}
          text="This module is part of the next release. Artwork requests, review and approval are fully live today.">
          <Link className="btn btn-primary" to="/artworks">Go to artwork</Link>
        </Empty>
      </div>
    </main>
  )
}
