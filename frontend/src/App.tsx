import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import Dashboard from './pages/Dashboard'
import ReposDashboard from './pages/ReposDashboard'
import ScanDashboard from './pages/ScanDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/legacy-dashboard" element={<Dashboard />} />
        <Route path="/repos" element={<ReposDashboard />} />
        <Route path="/scan" element={<ScanDashboard />} />
        <Route path="/dashboard" element={<ScanDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}
