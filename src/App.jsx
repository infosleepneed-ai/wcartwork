import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { StoreProvider } from './lib/store'
import Layout from './components/Layout'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import AllArtwork from './pages/AllArtwork'
import ArtworkReview from './pages/ArtworkReview'
import ArtworkApproval from './pages/ArtworkApproval'
import MasterData from './pages/MasterData'
import UsersRoles from './pages/UsersRoles'
import ComingSoon from './pages/ComingSoon'
import CountryRequirements from './pages/CountryRequirements'
import Workflows from './pages/Workflows'

function Protected() {
  const { session, loading } = useAuth()
  if (loading) return <div className="loading-screen"><span className="spinner" />Loading Artwork Hub…</div>
  if (!session) return <Navigate to="/login" replace />
  return (
    <StoreProvider>
      <Layout />
    </StoreProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<Protected />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/artworks" element={<AllArtwork />} />
        <Route path="/artworks/:id" element={<ArtworkReview />} />
        <Route path="/artworks/:id/approval" element={<ArtworkApproval />} />
        <Route path="/master/:kind" element={<MasterData />} />
        <Route path="/admin/users" element={<UsersRoles />} />
        <Route path="/admin/workflows" element={<Workflows />} />
        <Route path="/module/country-requirements" element={<CountryRequirements />} />
        <Route path="/module/:name" element={<ComingSoon />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
