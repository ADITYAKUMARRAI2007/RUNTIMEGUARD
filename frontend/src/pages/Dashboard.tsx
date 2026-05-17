import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePolling } from '../hooks/usePolling'
import { Incident, HealthScore } from '../types'
import LiveStatusBadge from '../components/LiveStatusBadge'
import HealthScoreGauge from '../components/HealthScoreGauge'
import IncidentCard from '../components/IncidentCard'
import IncidentDetail from '../components/IncidentDetail'
import { Zap, RotateCcw } from 'lucide-react'

export default function Dashboard() {
  const { data: incidents } = usePolling<Incident[]>('/incidents', 5000)
  const { data: health } = usePolling<HealthScore>('/health-score', 5000)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [triggering, setTriggering] = useState(false)

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      await fetch('/demo/trigger', { method: 'POST' })
    } finally {
      setTimeout(() => setTriggering(false), 1000)
    }
  }

  const handleReset = async () => {
    await fetch('/demo/reset', { method: 'POST' })
    setExpandedId(null)
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/85 backdrop-blur-xl border-b border-border h-14 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted text-[11px] font-mono hover:text-text transition-colors">← Back to site</Link>
          <span className="font-mono text-[13px] text-accent tracking-wider">RUNTIMEGUARD_AI</span>
        </div>
        <div className="flex items-center gap-4">
          <LiveStatusBadge />
          <button onClick={handleTrigger} disabled={triggering}
            className="flex items-center gap-1.5 bg-red/10 border border-red/30 text-red px-3 py-1 rounded text-[11px] font-mono hover:bg-red/20 transition-colors disabled:opacity-50">
            <Zap size={12} /> {triggering ? 'Triggering...' : 'Demo Trigger'}
          </button>
          <button onClick={handleReset}
            className="flex items-center gap-1.5 bg-surface2 border border-border text-muted px-3 py-1 rounded text-[11px] font-mono hover:text-text transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </nav>

      {/* Content */}
      <div className="pt-20 px-6 max-w-[1200px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* Left: Health */}
          <div className="space-y-4">
            <HealthScoreGauge health={health} />
          </div>

          {/* Right: Incidents */}
          <div className="space-y-3">
            <h2 className="font-mono text-[11px] text-accent tracking-widest uppercase">Incident Timeline</h2>
            {(!incidents || incidents.length === 0) && (
              <div className="bg-surface border border-border rounded-lg p-8 text-center">
                <p className="text-muted text-[13px]">No incidents yet. Click "Demo Trigger" to start.</p>
              </div>
            )}
            {incidents?.map(inc => (
              <div key={inc.id}>
                <IncidentCard incident={inc} expanded={expandedId === inc.id} onToggle={() => setExpandedId(expandedId === inc.id ? null : inc.id)} />
                {expandedId === inc.id && <IncidentDetail incident={inc} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
