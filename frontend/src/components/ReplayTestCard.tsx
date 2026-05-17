interface Props { code: string; beforeResult: string | null }

export default function ReplayTestCard({ code, beforeResult }: Props) {
  return (
    <div className="bg-surface2 border border-border rounded-lg p-3">
      <h4 className="font-mono text-[11px] text-accent2 tracking-wider uppercase mb-2">Replay Test</h4>
      {beforeResult && (
        <div className="text-[11px] font-mono text-accent mb-2 bg-accent/5 px-2 py-1 rounded border border-accent/10">
          ✓ Bug confirmed: {beforeResult}
        </div>
      )}
      <pre className="text-[11px] font-mono text-muted bg-bg p-2 rounded border border-border overflow-x-auto max-h-32">{code}</pre>
    </div>
  )
}
