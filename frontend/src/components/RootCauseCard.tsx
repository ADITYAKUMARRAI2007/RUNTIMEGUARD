interface Props { explanation: string }

export default function RootCauseCard({ explanation }: Props) {
  return (
    <div className="bg-surface2 border border-border rounded-lg p-3">
      <h4 className="font-mono text-[11px] text-accent3 tracking-wider uppercase mb-2">Root Cause</h4>
      <p className="text-[13px] text-muted leading-relaxed">{explanation}</p>
    </div>
  )
}
