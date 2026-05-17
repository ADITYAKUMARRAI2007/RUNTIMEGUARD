import { Incident } from '../types'

interface Props { incident: Incident }

export default function ContextEnginePanel({ incident }: Props) {
  const similar = incident.pce_similar_incidents ? JSON.parse(incident.pce_similar_incidents) : []
  const remediations = incident.pce_suggested_remediations ? JSON.parse(incident.pce_suggested_remediations) : []

  return (
    <div className="bg-surface2 border border-purple/20 rounded-lg p-3">
      <h4 className="font-mono text-[11px] text-purple tracking-wider uppercase mb-2">Context Engine</h4>
      {incident.pce_explain && <p className="text-[12px] text-muted mb-3">{incident.pce_explain}</p>}
      {similar.length > 0 && (
        <div className="mb-2">
          <span className="font-mono text-[10px] text-dim">Similar incidents:</span>
          {similar.map((s: any, i: number) => (
            <div key={i} className="text-[11px] text-muted mt-1 pl-2 border-l border-purple/30">
              {s.id} — {Math.round(s.similarity * 100)}% match — {s.rationale}
            </div>
          ))}
        </div>
      )}
      {remediations.length > 0 && (
        <div>
          <span className="font-mono text-[10px] text-dim">Suggested:</span>
          {remediations.map((r: any, i: number) => (
            <div key={i} className="text-[11px] text-muted mt-1 pl-2 border-l border-accent/30">
              {r.action} → {r.target} (confidence: {Math.round(r.confidence * 100)}%)
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
