import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePolling } from '../hooks/usePolling'
import { ConnectedRepo, ScanFinding, ScanResults } from '../types'
import {
  GitPullRequest, Shield, AlertTriangle, CheckCircle2, Zap,
  RefreshCw, Trash2, Eye, ArrowRight, Activity, Globe,
  Lock, Server, Plus, Search, ExternalLink
} from 'lucide-react'

export default function ReposDashboard() {
  const { data: repos, refetch: refetchRepos } = usePolling<ConnectedRepo[]>('/api/repos', 10000)
  const [connectForm, setConnectForm] = useState({ repo: '', token: '' })
  const [connecting, setConnecting] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [scanResults, setScanResults] = useState<ScanResults | null>(null)
  const [scanning, setScanning] = useState<string | null>(null)
  const [fixing, setFixing] = useState<string | null>(null)
  const [logInput, setLogInput] = useState('')
  const [logResult, setLogResult] = useState<any>(null)
  const [submittingLog, setSubmittingLog] = useState(false)

  // Connect a repo
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!connectForm.repo) return
    setConnecting(true)
    try {
      const res = await fetch('/api/repos/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_full_name: connectForm.repo,
          github_token: connectForm.token || undefined,
          monitor_logs: true,
          monitor_deps: true,
          monitor_frameworks: true,
        }),
      })
      if (res.ok) {
        setConnectForm({ repo: '', token: '' })
        refetchRepos()
      }
    } finally {
      setConnecting(false)
    }
  }

  // Disconnect a repo
  const handleDisconnect = async (repoId: string) => {
    await fetch(`/api/repos/disconnect/${repoId}`, { method: 'DELETE' })
    refetchRepos()
    if (selectedRepo === repoId) {
      setSelectedRepo(null)
      setScanResults(null)
    }
  }

  // Trigger scan
  const handleScan = async (repoId: string) => {
    setScanning(repoId)
    try {
      await fetch(`/api/repos/scan/${repoId}`, { method: 'POST' })
      // Wait a moment for scan to complete, then fetch results
      setTimeout(async () => {
        const res = await fetch(`/api/repos/scan/${repoId}/results`)
        if (res.ok) {
          const data = await res.json()
          setScanResults(data)
          setSelectedRepo(repoId)
        }
        setScanning(null)
        refetchRepos()
      }, 2000)
    } catch {
      setScanning(null)
    }
  }

  // View scan results
  const handleViewResults = async (repoId: string) => {
    const res = await fetch(`/api/repos/scan/${repoId}/results`)
    if (res.ok) {
      const data = await res.json()
      setScanResults(data)
      setSelectedRepo(repoId)
    }
  }

  // Trigger fix for a finding
  const handleFix = async (findingId: string) => {
    setFixing(findingId)
    try {
      await fetch(`/api/repos/fix/${findingId}`, { method: 'POST' })
      // Refresh results after a delay
      setTimeout(() => {
        if (selectedRepo) handleViewResults(selectedRepo)
        setFixing(null)
      }, 3000)
    } catch {
      setFixing(null)
    }
  }

  // Submit production log
  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!logInput.trim()) return
    setSubmittingLog(true)
    setLogResult(null)
    try {
      const res = await fetch('/logs/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: [{
            level: 'ERROR',
            message: logInput,
            stacktrace: logInput.includes('Traceback') ? logInput : undefined,
          }],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setLogResult(data)
        setLogInput('')
      }
    } finally {
      setSubmittingLog(false)
    }
  }

  const severityColor = (s: string) => {
    switch (s) {
      case 'CRITICAL': return 'text-red bg-red/10 border-red/20'
      case 'HIGH': return 'text-accent3 bg-accent3/10 border-accent3/20'
      case 'MEDIUM': return 'text-accent2 bg-accent2/10 border-accent2/20'
      default: return 'text-muted bg-white/5 border-white/10'
    }
  }

  const statusColor = (s: string) => {
    switch (s) {
      case 'pr_created': return 'text-accent bg-accent/10'
      case 'fix_in_progress': return 'text-accent2 bg-accent2/10'
      case 'resolved': return 'text-accent bg-accent/10'
      default: return 'text-muted bg-white/5'
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/85 backdrop-blur-xl border-b border-border h-14 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted text-[11px] font-mono hover:text-text transition-colors">← Back to site</Link>
          <span className="font-mono text-[13px] text-accent tracking-wider">RUNTIMEGUARD_AI</span>
          <span className="text-muted text-[11px] font-mono">/ Repos</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/repos" className="text-accent text-[11px] font-mono hover:text-accent/80 transition-colors border border-accent/20 px-3 py-1 rounded">
            Connect Repos
          </Link>
          <Link to="/dashboard" className="text-muted text-[11px] font-mono hover:text-text transition-colors border border-border px-3 py-1 rounded">
            Demo Dashboard
          </Link>
        </div>
      </nav>

      <div className="pt-20 px-6 max-w-[1400px] mx-auto pb-20">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Connected Repositories</h1>
          <p className="text-muted text-[13px]">Connect your GitHub repos to monitor for crashes, deprecated APIs, and framework upgrades.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* Left: Repos list + scan results */}
          <div className="space-y-6">
            {/* Connect form */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="font-mono text-[11px] text-accent tracking-wider mb-4 flex items-center gap-2">
                <Plus size={12} /> CONNECT REPOSITORY
              </h3>
              <form onSubmit={handleConnect} className="flex gap-3">
                <input
                  type="text"
                  placeholder="owner/repo (e.g. facebook/react)"
                  value={connectForm.repo}
                  onChange={e => setConnectForm(f => ({ ...f, repo: e.target.value }))}
                  className="flex-1 bg-bg border border-border rounded px-3 py-2 text-[13px] text-text placeholder:text-dim focus:border-accent/40 focus:outline-none transition-colors"
                />
                <input
                  type="password"
                  placeholder="GitHub token (optional)"
                  value={connectForm.token}
                  onChange={e => setConnectForm(f => ({ ...f, token: e.target.value }))}
                  className="w-[200px] bg-bg border border-border rounded px-3 py-2 text-[13px] text-text placeholder:text-dim focus:border-accent/40 focus:outline-none transition-colors"
                />
                <button
                  type="submit"
                  disabled={connecting || !connectForm.repo}
                  className="bg-accent text-bg px-4 py-2 rounded text-[12px] font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              </form>
            </div>

            {/* Repos list */}
            {repos && repos.length > 0 && (
              <div className="space-y-3">
                {repos.map(repo => (
                  <div key={repo.id} className={`bg-surface border rounded-lg p-5 transition-colors ${selectedRepo === repo.id ? 'border-accent/30' : 'border-border'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <GitPullRequest size={14} className="text-accent" />
                          <span className="font-mono text-[13px] font-bold">{repo.repo_full_name}</span>
                          {repo.language && (
                            <span className="text-[10px] text-muted bg-white/5 px-2 py-0.5 rounded">{repo.language}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted">
                          <span>Branch: {repo.default_branch}</span>
                          {repo.last_scan_at && <span>Last scan: {new Date(repo.last_scan_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${repo.health_score >= 80 ? 'text-accent bg-accent/10' : repo.health_score >= 50 ? 'text-accent3 bg-accent3/10' : 'text-red bg-red/10'}`}>
                          {repo.health_score}/100
                        </span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="bg-bg rounded px-3 py-2 border border-border">
                        <div className="text-[9px] text-muted">Deprecated</div>
                        <div className="text-[14px] font-mono font-bold text-accent3">{repo.deprecated_count}</div>
                      </div>
                      <div className="bg-bg rounded px-3 py-2 border border-border">
                        <div className="text-[9px] text-muted">Vulnerabilities</div>
                        <div className="text-[14px] font-mono font-bold text-red">{repo.vulnerability_count}</div>
                      </div>
                      <div className="bg-bg rounded px-3 py-2 border border-border">
                        <div className="text-[9px] text-muted">Outdated Deps</div>
                        <div className="text-[14px] font-mono font-bold text-accent2">{repo.outdated_deps_count}</div>
                      </div>
                      <div className="bg-bg rounded px-3 py-2 border border-border">
                        <div className="text-[9px] text-muted">Monitoring</div>
                        <div className="flex gap-1 mt-1">
                          {repo.monitor_logs && <Activity size={10} className="text-accent" />}
                          {repo.monitor_deps && <Shield size={10} className="text-accent2" />}
                          {repo.monitor_frameworks && <Globe size={10} className="text-purple" />}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleScan(repo.id)}
                        disabled={scanning === repo.id}
                        className="flex items-center gap-1.5 bg-accent/10 border border-accent/20 text-accent px-3 py-1.5 rounded text-[11px] font-mono hover:bg-accent/20 transition-colors disabled:opacity-50"
                      >
                        <Search size={11} /> {scanning === repo.id ? 'Scanning...' : 'Scan Now'}
                      </button>
                      <button
                        onClick={() => handleViewResults(repo.id)}
                        className="flex items-center gap-1.5 bg-white/5 border border-border text-muted px-3 py-1.5 rounded text-[11px] font-mono hover:text-text transition-colors"
                      >
                        <Eye size={11} /> View Findings
                      </button>
                      <button
                        onClick={() => handleDisconnect(repo.id)}
                        className="flex items-center gap-1.5 text-red/60 px-2 py-1.5 rounded text-[11px] font-mono hover:text-red hover:bg-red/5 transition-colors ml-auto"
                      >
                        <Trash2 size={11} /> Disconnect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {(!repos || repos.length === 0) && (
              <div className="bg-surface border border-border rounded-lg p-12 text-center">
                <GitPullRequest size={32} className="text-muted mx-auto mb-4" />
                <p className="text-muted text-[13px] mb-2">No repositories connected yet.</p>
                <p className="text-dim text-[12px]">Connect a GitHub repo above to start monitoring.</p>
              </div>
            )}

            {/* Scan Results */}
            {scanResults && (
              <div className="bg-surface border border-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono text-[11px] text-accent tracking-wider flex items-center gap-2">
                    <AlertTriangle size={12} /> SCAN FINDINGS — {scanResults.repo}
                  </h3>
                  <span className="text-[11px] text-muted">{scanResults.total_findings} issues found</span>
                </div>

                {scanResults.findings.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle2 size={24} className="text-accent mx-auto mb-2" />
                    <p className="text-muted text-[13px]">No issues found. Your repo is clean!</p>
                  </div>
                )}

                <div className="space-y-2">
                  {scanResults.findings.map(finding => (
                    <div key={finding.id} className="bg-bg border border-border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${severityColor(finding.severity)}`}>
                              {finding.severity}
                            </span>
                            <span className="text-[10px] font-mono text-muted bg-white/5 px-1.5 py-0.5 rounded">
                              {finding.finding_type}
                            </span>
                          </div>
                          <h4 className="text-[13px] font-semibold mb-1">{finding.title}</h4>
                          {finding.description && (
                            <p className="text-[11px] text-muted leading-relaxed">{finding.description}</p>
                          )}
                          {finding.file_path && (
                            <div className="text-[10px] text-dim font-mono mt-1">
                              {finding.file_path}{finding.line_number ? `:${finding.line_number}` : ''}
                            </div>
                          )}
                          {finding.fix_hint && (
                            <div className="text-[10px] text-accent/70 mt-1 font-mono">
                              💡 {finding.fix_hint}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {finding.status === 'pr_created' && finding.pr_url ? (
                            <a href={finding.pr_url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-accent text-[10px] font-mono bg-accent/10 px-2 py-1 rounded hover:bg-accent/20 transition-colors">
                              <ExternalLink size={10} /> PR #{finding.pr_number}
                            </a>
                          ) : finding.status === 'fix_in_progress' ? (
                            <span className={`text-[10px] font-mono px-2 py-1 rounded ${statusColor(finding.status)}`}>
                              Fixing...
                            </span>
                          ) : (
                            <button
                              onClick={() => handleFix(finding.id)}
                              disabled={fixing === finding.id}
                              className="flex items-center gap-1 bg-accent text-bg px-2.5 py-1 rounded text-[10px] font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
                            >
                              <Zap size={10} /> {fixing === finding.id ? 'Fixing...' : 'Auto-Fix'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar: Log ingestion + quick actions */}
          <div className="space-y-6">
            {/* Log ingestion */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="font-mono text-[11px] text-accent2 tracking-wider mb-4 flex items-center gap-2">
                <Activity size={12} /> INGEST PRODUCTION LOG
              </h3>
              <p className="text-[11px] text-muted mb-3">Paste an error log or stacktrace. RuntimeGuard will parse it and trigger the fix pipeline.</p>
              <form onSubmit={handleLogSubmit}>
                <textarea
                  value={logInput}
                  onChange={e => setLogInput(e.target.value)}
                  placeholder={'Traceback (most recent call last):\n  File "app.py", line 42, in get_user\n    email = data["email"]\nKeyError: "email"'}
                  className="w-full h-[140px] bg-bg border border-border rounded px-3 py-2 text-[11px] font-mono text-text placeholder:text-dim focus:border-accent2/40 focus:outline-none transition-colors resize-none"
                />
                <button
                  type="submit"
                  disabled={submittingLog || !logInput.trim()}
                  className="mt-3 w-full bg-accent2 text-bg py-2 rounded text-[12px] font-semibold hover:bg-accent2/90 transition-colors disabled:opacity-50"
                >
                  {submittingLog ? 'Processing...' : 'Submit Log → Trigger Pipeline'}
                </button>
              </form>
              {logResult && (
                <div className="mt-3 bg-accent/5 border border-accent/20 rounded p-3">
                  <div className="text-[11px] text-accent font-mono">
                    ✓ {logResult.message}
                  </div>
                  {logResult.incidents_created > 0 && (
                    <div className="text-[10px] text-muted mt-1">
                      Pipeline triggered. <Link to="/dashboard" className="text-accent hover:underline">View in Dashboard →</Link>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Integration guide */}
            <div className="bg-surface border border-border rounded-lg p-5">
              <h3 className="font-mono text-[11px] text-purple tracking-wider mb-4 flex items-center gap-2">
                <Server size={12} /> INTEGRATION ENDPOINTS
              </h3>
              <div className="space-y-3">
                <div className="bg-bg rounded p-3 border border-border">
                  <div className="text-[10px] text-accent font-mono mb-1">POST /logs/ingest</div>
                  <div className="text-[10px] text-muted">Batch log ingestion — send structured error logs</div>
                </div>
                <div className="bg-bg rounded p-3 border border-border">
                  <div className="text-[10px] text-accent font-mono mb-1">POST /logs/sentry</div>
                  <div className="text-[10px] text-muted">Sentry webhook — drop-in replacement for alerts</div>
                </div>
                <div className="bg-bg rounded p-3 border border-border">
                  <div className="text-[10px] text-accent font-mono mb-1">POST /webhook/crash</div>
                  <div className="text-[10px] text-muted">Direct crash webhook — full crash payload</div>
                </div>
                <div className="bg-bg rounded p-3 border border-border">
                  <div className="text-[10px] text-accent font-mono mb-1">POST /repos/connect</div>
                  <div className="text-[10px] text-muted">Connect a GitHub repo for monitoring</div>
                </div>
              </div>
              <a href="http://localhost:8000/docs" target="_blank" rel="noopener noreferrer"
                className="mt-4 flex items-center gap-1.5 text-[11px] text-accent font-mono hover:underline">
                <ExternalLink size={10} /> View Full API Docs (Swagger)
              </a>
            </div>

            {/* Quick stats */}
            {repos && repos.length > 0 && (
              <div className="bg-surface border border-border rounded-lg p-5">
                <h3 className="font-mono text-[11px] text-accent3 tracking-wider mb-4 flex items-center gap-2">
                  <Shield size={12} /> OVERVIEW
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-bg rounded p-3 border border-border text-center">
                    <div className="text-xl font-mono font-bold text-accent">{repos.length}</div>
                    <div className="text-[9px] text-muted">Repos Connected</div>
                  </div>
                  <div className="bg-bg rounded p-3 border border-border text-center">
                    <div className="text-xl font-mono font-bold text-accent3">
                      {repos.reduce((sum, r) => sum + r.deprecated_count, 0)}
                    </div>
                    <div className="text-[9px] text-muted">Deprecated APIs</div>
                  </div>
                  <div className="bg-bg rounded p-3 border border-border text-center">
                    <div className="text-xl font-mono font-bold text-red">
                      {repos.reduce((sum, r) => sum + r.vulnerability_count, 0)}
                    </div>
                    <div className="text-[9px] text-muted">Vulnerabilities</div>
                  </div>
                  <div className="bg-bg rounded p-3 border border-border text-center">
                    <div className="text-xl font-mono font-bold text-accent2">
                      {repos.reduce((sum, r) => sum + r.outdated_deps_count, 0)}
                    </div>
                    <div className="text-[9px] text-muted">Outdated Deps</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
