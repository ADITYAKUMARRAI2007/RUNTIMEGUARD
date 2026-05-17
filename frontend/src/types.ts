export interface Patch {
  id: string
  candidate_num: number
  patch_content: string
  rejected: boolean
  rejection_reasons: string | null
  sandbox_status: string
  sandbox_output: string | null
  risk_score: number | null
  risk_label: string | null
  selected: boolean
}

export interface Incident {
  id: string
  created_at: string
  exception_type: string
  exception_msg: string
  file_path: string | null
  line_number: number | null
  function_name: string | null
  endpoint: string | null
  request_payload: string | null
  suspected_cause: string | null
  severity: string | null
  root_cause_explanation: string | null
  replay_test_code: string | null
  replay_test_before_result: string | null
  status: string
  failure_reason: string | null
  pr_url: string | null
  pr_number: number | null
  was_preventable: boolean
  preventable_pr_number: number | null
  preventable_pr_days_ago: number | null
  pce_explain: string | null
  pce_similar_incidents: string | null
  pce_suggested_remediations: string | null
  pce_causal_chain: string | null
  patches: Patch[]
}

export interface HealthScore {
  repo: string
  score: number
  cve_count: number
  deprecated_count: number
  open_incidents: number
  risky_patterns: number
}

export interface ProactivePR {
  id: string
  created_at: string
  file_path: string
  pattern_matched: string
  pr_url: string | null
  pr_number: number | null
  pr_title: string | null
  days_since_created: number
  repo: string | null
}

export interface ConnectedRepo {
  id: string
  repo_full_name: string
  repo_url: string | null
  default_branch: string
  language: string | null
  connected: boolean
  last_scan_at: string | null
  deprecated_count: number
  vulnerability_count: number
  outdated_deps_count: number
  health_score: number
  monitor_logs: boolean
  monitor_deps: boolean
  monitor_frameworks: boolean
  auto_fix: boolean
  created_at: string
}

export interface ScanFinding {
  id: string
  finding_type: string
  title: string
  description: string | null
  file_path: string | null
  line_number: number | null
  severity: string
  package_name: string | null
  current_version: string | null
  latest_version: string | null
  fix_hint: string | null
  status: string
  pr_url: string | null
  pr_number: number | null
  created_at: string
}

export interface ScanResults {
  repo: string
  total_findings: number
  by_type: Record<string, number>
  by_severity: Record<string, number>
  findings: ScanFinding[]
}
