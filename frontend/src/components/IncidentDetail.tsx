import { Incident } from '../types'
import PatchCard from './PatchCard'
import RootCauseCard from './RootCauseCard'
import ReplayTestCard from './ReplayTestCard'
import ContextEnginePanel from './ContextEnginePanel'
import { ExternalLink } from 'lucide-react'

interface Props {
  incident: Incident
}

export default function IncidentDetail({ incident }: Props) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4 space-y-4 mt-2">
      {incident.root_cause_explanation && <RootCauseCard explanation={incident.root_cause_explanation} />}
      {incident.replay_test_code && (
        <ReplayTestCard code={incident.replay_test_code} beforeResult={incident.replay_test_before_result} />
      )}
      {incident.pce_explain && <ContextEnginePanel incident={incident} />}
      <div className="space-y-2">
        <h4 className="font-mono text-[11px] text-accent tracking-wider uppercase">Patch Candidates</h4>
        {incident.patches.map(p => <PatchCard key={p.id} patch={p} />)}
      </div>
      {incident.pr_url && (
        <a href={incident.pr_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-accent2/10 border border-accent2/30 text-accent2 px-3 py-1.5 rounded text-[12px] font-mono hover:bg-accent2/20 transition-colors">
          <ExternalLink size={12} /> View Recovery PR
        </a>
      )}
    </div>
  )
}
