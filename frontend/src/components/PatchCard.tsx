import { Patch } from '../types'
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  patch: Patch
}

export default function PatchCard({ patch }: Props) {
  const [showOutput, setShowOutput] = useState(false)

  const statusColor = patch.rejected ? '#f85149' : patch.sandbox_status === 'passed' ? '#00ff88' : patch.sandbox_status === 'failed' ? '#f85149' : '#484f58'
  const statusText = patch.rejected ? 'REJECTED' : patch.sandbox_status === 'passed' ? 'VERIFIED' : patch.sandbox_status === 'failed' ? 'FAILED' : 'PENDING'

  return (
    <div className={`border rounded-lg overflow-hidden ${patch.selected ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface2'}`}>
      <div className="p-3 flex items-center gap-3">
        <span className="font-mono text-[11px] text-dim">#{patch.candidate_num}</span>
        <span className="font-mono text-[10px] px-2 py-0.5 rounded" style={{ background: `${statusColor}15`, color: statusColor }}>
          {statusText}
        </span>
        {patch.risk_score !== null && patch.sandbox_status === 'passed' && (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent">
            Risk: {patch.risk_score}/100 {patch.risk_label}
          </span>
        )}
        {patch.selected && <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-accent/20 text-accent">SELECTED</span>}
        {patch.sandbox_output && (
          <button onClick={(e) => { e.stopPropagation(); setShowOutput(!showOutput) }} className="ml-auto text-dim hover:text-muted">
            {showOutput ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>
      {patch.rejected && patch.rejection_reasons && (
        <div className="px-3 pb-2">
          <div className="text-[11px] text-red/80 font-mono bg-red/5 p-2 rounded border border-red/10">
            {JSON.parse(patch.rejection_reasons).map((r: string, i: number) => <div key={i}>• {r}</div>)}
          </div>
        </div>
      )}
      {showOutput && patch.sandbox_output && (
        <div className="px-3 pb-3">
          <pre className="text-[11px] font-mono text-muted bg-bg p-2 rounded border border-border overflow-x-auto">{patch.sandbox_output}</pre>
        </div>
      )}
    </div>
  )
}
