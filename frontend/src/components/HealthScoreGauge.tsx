import { HealthScore } from '../types'

interface Props {
  health: HealthScore | null
}

export default function HealthScoreGauge({ health }: Props) {
  const score = health?.score ?? 100
  const color = score >= 80 ? '#00ff88' : score >= 50 ? '#f59e0b' : '#f85149'
  const circumference = 2 * Math.PI * 45
  const offset = circumference - (score / 100) * circumference

  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <h3 className="font-mono text-[11px] text-accent tracking-widest uppercase mb-4">Codebase Health</h3>
      <div className="flex justify-center mb-4">
        <svg width="120" height="120" className="transform -rotate-90">
          <circle cx="60" cy="60" r="45" fill="none" stroke="#21262d" strokeWidth="8" />
          <circle cx="60" cy="60" r="45" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute flex items-center justify-center w-[120px] h-[120px]">
          <span className="font-mono text-2xl" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <div className="flex justify-between"><span className="text-muted">CVEs</span><span className="text-text font-mono">{health?.cve_count ?? 0}</span></div>
        <div className="flex justify-between"><span className="text-muted">Deprecated</span><span className="text-text font-mono">{health?.deprecated_count ?? 0}</span></div>
        <div className="flex justify-between"><span className="text-muted">Incidents</span><span className="text-text font-mono">{health?.open_incidents ?? 0}</span></div>
        <div className="flex justify-between"><span className="text-muted">Patterns</span><span className="text-text font-mono">{health?.risky_patterns ?? 0}</span></div>
      </div>
    </div>
  )
}
