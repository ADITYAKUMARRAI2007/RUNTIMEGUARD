import { Incident } from '../types'
import { AlertTriangle, CheckCircle, XCircle, Loader, GitPullRequest } from 'lucide-react'

interface Props {
  incident: Incident
  expanded: boolean
  onToggle: () => void
}

const STATUS_CONFIG: Record<string, { color: string; icon: any; pulse?: boolean }> = {
  detected: { color: '#f85149', icon: XCircle },
  bundled: { color: '#f59e0b', icon: Loader },
  reproducing: { color: '#f59e0b', icon: Loader, pulse: true },
  patching: { color: '#f59e0b', icon: Loader, pulse: true },
  verifying: { color: '#f59e0b', icon: Loader, pulse: true },
  pr_created: { color: '#0ea5e9', icon: GitPullRequest },
  healed: { color: '#00ff88', icon: CheckCircle },
  failed: { color: '#f85149', icon: XCircle },
}

export default function IncidentCard({ incident, expanded, onToggle }: Props) {
  const config = STATUS_CONFIG[incident.status] || STATUS_CONFIG.detected
  const Icon = config.icon

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden transition-all hover:border-border2 cursor-pointer" onClick={onToggle}>
      <div className="p-4 flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${config.pulse ? 'animate-pulse-dot' : ''}`} style={{ background: config.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-text">{incident.exception_type}</span>
            <span className="text-[11px] text-muted truncate">{incident.file_path}:{incident.line_number}</span>
          </div>
          <div className="text-[11px] text-dim mt-0.5">{incident.endpoint || 'unknown endpoint'}</div>
        </div>
        <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: `${config.color}15`, color: config.color }}>
          {incident.status}
        </span>
      </div>
      {incident.was_preventable && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 bg-[#f59e0b10] border-l-2 border-accent3 px-3 py-1.5 rounded-r">
            <AlertTriangle size={12} className="text-accent3 flex-shrink-0" />
            <span className="text-[11px] text-accent3 font-medium">
              Was preventable — PR #{incident.preventable_pr_number} warned {incident.preventable_pr_days_ago} days ago
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
