interface Props { score: number; label: string }

export default function RiskScoreBadge({ score, label }: Props) {
  const color = score >= 80 ? '#00ff88' : score >= 50 ? '#f59e0b' : '#f85149'
  return (
    <span className="font-mono text-[11px] px-2 py-0.5 rounded" style={{ background: `${color}15`, color }}>
      Risk: {score}/100 — {label}
    </span>
  )
}
