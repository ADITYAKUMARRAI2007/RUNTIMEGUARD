import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, Github, Globe, ChevronDown, ChevronUp, Eye, EyeOff,
  Terminal, CheckCircle2, Circle, Clock, Zap, Copy, Download,
  FileCode, Bug, GitPullRequest, Brain, Activity, Layers,
  AlertTriangle, CheckCheck, XCircle, RotateCcw, Play,
  Server, Code2, Database, Network, Package, FlaskConical
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RepoRisk {
  risk_type: string
  file: string
  line?: number
  evidence: string
  severity: string
  matched?: string
}

interface BrowserEvent {
  event_type: string
  message?: string
  url?: string
  status?: number
  text?: string
  page?: string
  triggered_by?: string
  method?: string
  result?: string
  screenshot?: string
}

interface SandboxTest {
  name: string
  status: string
  output?: string
  duration_ms?: number
}

interface AppMapNode {
  type: string
  name: string
  path?: string
  children?: AppMapNode[]
  calls?: string[]
  env_vars?: string[]
  deps?: string[]
}

interface IncidentBundle {
  incident_id?: string
  affected_flow?: string
  user_action?: string
  failed_api?: string
  frontend_symptom?: string
  backend_error?: string
  incident_type?: string
  root_cause_hypothesis?: string
  evidence?: string[]
  business_impact?: string
  severity?: string
  timestamp?: string
  [key: string]: unknown
}

interface MemoryPattern {
  id?: string
  pattern_type?: string
  description?: string
  fix_applied?: string
  confidence?: number
  created_at?: string
  [key: string]: unknown
}

interface ScanData {
  scan_id: string
  status: string
  failure_reason?: string
  repo_path?: string
  deployment_url?: string
  framework?: string
  app_map?: AppMapNode | AppMapNode[] | Record<string, unknown>
  repo_risks?: RepoRisk[]
  browser_events?: BrowserEvent[]
  pages_visited?: number
  buttons_tested?: number
  failed_api_calls?: number
  console_errors?: number
  incident_type?: string
  incident_bundle?: IncidentBundle
  recovery_strategy?: string
  patch_diff?: string
  patch_files?: string[]
  test_code?: string
  sandbox_status?: string
  sandbox_tests?: SandboxTest[]
  sandbox_duration_ms?: number
  sandbox_logs?: string[]
  risk_score?: number
  risk_label?: string
  risk_reasons?: string[]
  pr_title?: string
  pr_body?: string
  started_at?: string
  completed_at?: string
}

interface FormFields {
  repoPath: string
  deploymentUrl: string
  appType: string
  scanMode: string
  loginEmail: string
  loginPassword: string
  anthropicApiKey: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

// 20-step pipeline for display
const PIPELINE_STEPS = [
  { id: 'repo_received',           label: 'Repo Received',           group: 'started' },
  { id: 'repo_scanning',           label: 'Repo Scanning',           group: 'repo_scanning' },
  { id: 'framework_detected',      label: 'Framework Detected',      group: 'repo_scanning' },
  { id: 'app_map_built',           label: 'App Map Built',           group: 'repo_scanning' },
  { id: 'browser_launched',        label: 'Browser Launched',        group: 'browser_scanning' },
  { id: 'page_opened',             label: 'Page Opened',             group: 'browser_scanning' },
  { id: 'actions_discovered',      label: 'Actions Discovered',      group: 'browser_scanning' },
  { id: 'actions_testing',         label: 'Actions Testing',         group: 'browser_scanning' },
  { id: 'runtime_signals_collected', label: 'Runtime Signals',       group: 'correlating' },
  { id: 'failure_detected',        label: 'Failure Detected',        group: 'correlating' },
  { id: 'correlating',             label: 'Correlating',             group: 'correlating' },
  { id: 'incident_classified',     label: 'Incident Classified',     group: 'bundling' },
  { id: 'recovery_planned',        label: 'Recovery Planned',        group: 'patching' },
  { id: 'patch_generating',        label: 'Patch Generating',        group: 'patching' },
  { id: 'patch_generated',         label: 'Patch Generated',         group: 'patching' },
  { id: 'sandbox_started',         label: 'Sandbox Started',         group: 'verifying' },
  { id: 'tests_running',           label: 'Tests Running',           group: 'verifying' },
  { id: 'verification_complete',   label: 'Verification Complete',   group: 'verifying' },
  { id: 'awaiting_approval',       label: 'Awaiting Approval',       group: 'awaiting_approval' },
  { id: 'memory_updated',          label: 'Memory Updated',          group: 'approved' },
]

// Map backend status → pipeline step index
const STATUS_TO_PIPELINE_IDX: Record<string, number> = {
  started: 0,
  repo_scanning: 2,
  browser_scanning: 6,
  correlating: 10,
  bundling: 11,
  patching: 14,
  verifying: 17,
  awaiting_approval: 18,
  approved: 19,
  rejected: 18,
  failed: 18,
}

const TERMINAL_STATUSES = new Set(['awaiting_approval', 'approved', 'rejected', 'failed'])

const INCIDENT_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  dependency_incompatibility:         { label: 'Dependency Incompatibility', color: '#ff7744', bg: 'rgba(255,119,68,0.07)', icon: '📦' },
  runtime_config_drift:               { label: 'Runtime Config Drift',       color: '#ffcc44', bg: 'rgba(255,204,68,0.07)', icon: '⚙️' },
  frontend_backend_contract_mismatch: { label: 'API Contract Mismatch',      color: '#aa66ff', bg: 'rgba(170,102,255,0.07)', icon: '🔗' },
  visual_user_flow_failure:           { label: 'Visual Flow Failure',         color: '#ff4488', bg: 'rgba(255,68,136,0.07)', icon: '👁' },
  unknown_runtime_failure:            { label: 'Unknown Runtime Failure',     color: '#888888', bg: 'rgba(136,136,136,0.07)', icon: '❓' },
  no_failure_detected:                { label: 'No Failure Detected',         color: '#00ff88', bg: 'rgba(0,255,136,0.07)', icon: '✓' },
}

const SEV_COLOR: Record<string, string> = {
  critical: '#ff2244', high: '#ff6622', medium: '#ffaa22', low: '#88cc44', info: '#66aaff',
}

type LucideIconType = React.ComponentType<{ size?: number; color?: string; className?: string }>

const RESULT_TABS: Array<{ id: string; label: string; icon: LucideIconType }> = [
  { id: 'overview',       label: 'Overview',         icon: Activity as LucideIconType },
  { id: 'repo',           label: 'Repo Intelligence', icon: Code2 as LucideIconType },
  { id: 'appmap',         label: 'App Map',           icon: Network as LucideIconType },
  { id: 'browser',        label: 'Browser Agent',     icon: Globe as LucideIconType },
  { id: 'failures',       label: 'Runtime Failures',  icon: Bug as LucideIconType },
  { id: 'bundle',         label: 'Incident Bundle',   icon: Layers as LucideIconType },
  { id: 'recovery',       label: 'Recovery Plan',     icon: Zap as LucideIconType },
  { id: 'sandbox',        label: 'Sandbox',           icon: FlaskConical as LucideIconType },
  { id: 'pr',             label: 'PR Preview',        icon: GitPullRequest as LucideIconType },
  { id: 'memory',         label: 'Memory',            icon: Brain as LucideIconType },
  { id: 'approve',        label: 'Approve',           icon: CheckCheck as LucideIconType },
]

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function ts() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function incidentMeta(type?: string) {
  return INCIDENT_META[type ?? ''] ?? { label: type ?? 'Unknown', color: '#888', bg: 'rgba(136,136,136,0.07)', icon: '❓' }
}

function isGithubUrl(s: string) {
  return s.startsWith('https://github.com') || s.startsWith('http://github.com') || s.startsWith('git@github.com')
}

// ─── Tiny UI Atoms ────────────────────────────────────────────────────────────

function PulsingDot({ color = '#00ff88', size = 8 }: { color?: string; size?: number }) {
  return (
    <span className="relative flex shrink-0" style={{ width: size, height: size }}>
      <span className="animate-ping absolute inset-0 rounded-full opacity-50" style={{ backgroundColor: color }} />
      <span className="relative rounded-full w-full h-full" style={{ backgroundColor: color }} />
    </span>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider"
      style={{ color, border: `1px solid ${color}44`, background: `${color}11` }}>
      {label}
    </span>
  )
}

function SevBadge({ severity }: { severity: string }) {
  const color = SEV_COLOR[severity?.toLowerCase()] ?? '#888'
  return <Badge label={severity} color={color} />
}

function StatCard({ value, label, accent, icon: Icon }: { value: number | string; label: string; accent?: string; icon?: LucideIconType }) {
  return (
    <div className="rounded-xl border border-[#1e2130] p-4 flex flex-col gap-2"
      style={{ background: '#12141f' }}>
      <div className="flex items-center justify-between">
        {Icon && <Icon size={14} color={accent ?? '#555'} />}
        <span className="font-mono font-bold text-2xl ml-auto" style={{ color: accent ?? '#fff' }}>{value}</span>
      </div>
      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  )
}

function DiffViewer({ diff }: { diff: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(diff)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  if (!diff) return null
  return (
    <div className="rounded-xl border border-[#2a2d3e] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#2a2d3e]" style={{ background: '#12141f' }}>
        <FileCode size={12} color="#555" />
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Patch Diff</span>
        <span className="ml-auto text-[10px] font-mono text-[#00ff88]">Generated by RuntimeGuard AI</span>
        <button onClick={copy} className="ml-3 flex items-center gap-1 text-[10px] font-mono text-gray-600 hover:text-gray-300 transition-colors">
          <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-[12px] font-mono overflow-auto max-h-80 leading-relaxed" style={{ background: '#0a0c12' }}>
        {diff.split('\n').map((line, i) => {
          const color = line.startsWith('+') ? '#44ff99' : line.startsWith('-') ? '#ff5566' : line.startsWith('@@') ? '#66aaff' : line.startsWith('diff') || line.startsWith('index') ? '#aaaaaa' : '#666'
          const bg = line.startsWith('+') ? 'rgba(68,255,153,0.06)' : line.startsWith('-') ? 'rgba(255,85,102,0.06)' : 'transparent'
          return (
            <span key={i} className="block px-2 -mx-2 rounded-sm" style={{ color, background: bg }}>{line || ' '}</span>
          )
        })}
      </pre>
    </div>
  )
}

function CodeBlock({ code, language = 'python' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="rounded-xl border border-[#2a2d3e] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#2a2d3e]" style={{ background: '#12141f' }}>
        <Code2 size={12} color="#555" />
        <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{language}</span>
        <button onClick={copy} className="ml-auto flex items-center gap-1 text-[10px] font-mono text-gray-600 hover:text-gray-300 transition-colors">
          <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-[12px] font-mono overflow-auto max-h-72 leading-relaxed text-gray-300" style={{ background: '#0a0c12' }}>
        {code}
      </pre>
    </div>
  )
}

function RiskGauge({ score, label }: { score?: number; label?: string }) {
  const s = score ?? 0
  const color = s >= 75 ? '#00ff88' : s >= 50 ? '#ffaa22' : s >= 25 ? '#ff6622' : '#ff3344'
  const circumference = 2 * Math.PI * 36
  const dashLen = (s / 100) * circumference
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
        <svg width="96" height="96" style={{ position: 'absolute', top: 0, left: 0 }}>
          <circle cx="48" cy="48" r="36" fill="none" stroke="#1a1d2e" strokeWidth="7" />
          <circle cx="48" cy="48" r="36" fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${dashLen} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 48 48)"
            style={{ filter: `drop-shadow(0 0 6px ${color}88)`, transition: 'stroke-dasharray 1.2s ease' }}
          />
        </svg>
        <div className="flex flex-col items-center z-10">
          <span className="font-mono font-bold text-xl leading-none" style={{ color }}>{s}</span>
          <span className="text-[9px] text-gray-600 font-mono">/100</span>
        </div>
      </div>
      {label && <span className="text-[10px] font-mono font-bold uppercase tracking-wider" style={{ color }}>{label}</span>}
    </div>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav({ scanId, status }: { scanId?: string; status?: string }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1e2130]"
      style={{ background: 'rgba(15,17,23,0.96)', backdropFilter: 'blur(24px)', height: 52 }}>
      <div className="h-full flex items-center justify-between px-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-5">
          <Link to="/" className="text-[11px] font-mono text-gray-600 hover:text-gray-300 transition-colors flex items-center gap-1">
            ← Back
          </Link>
          <div className="w-px h-4 bg-[#1e2130]" />
          <div className="flex items-center gap-2">
            <Shield size={14} color="#00ff88" />
            <span className="text-[13px] font-mono font-bold text-[#00ff88] tracking-widest">RUNTIMEGUARD</span>
            <span className="text-[10px] font-mono text-gray-600 tracking-widest">AI</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {scanId && (
            <span className="text-[10px] font-mono text-gray-600">
              scan: <span className="text-gray-400 font-bold">{scanId.slice(0, 12)}...</span>
            </span>
          )}
          {status && !TERMINAL_STATUSES.has(status) && status !== 'form' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#00ff88]/20" style={{ background: 'rgba(0,255,136,0.05)' }}>
              <PulsingDot color="#00ff88" size={6} />
              <span className="text-[10px] font-mono text-[#00ff88] font-bold">LIVE SCAN</span>
            </div>
          )}
          {status === 'awaiting_approval' && <Badge label="Awaiting Approval" color="#ffaa22" />}
          {status === 'approved' && <Badge label="Approved" color="#00ff88" />}
          {status === 'rejected' && <Badge label="Rejected" color="#ff4444" />}
          {status === 'failed' && <Badge label="Failed" color="#ff4444" />}
        </div>
      </div>
    </nav>
  )
}

// ─── Phase 1: Form ────────────────────────────────────────────────────────────

function FormPhase({ onStart }: { onStart: (scanId: string) => void }) {
  const [form, setForm] = useState<FormFields>({
    repoPath: '',
    deploymentUrl: '',
    appType: 'auto',
    scanMode: 'deep',
    loginEmail: '',
    loginPassword: '',
    anthropicApiKey: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreds, setShowCreds] = useState(false)
  const [showApiSettings, setShowApiSettings] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  // Load API key from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('rg_anthropic_api_key')
    if (saved) setForm(f => ({ ...f, anthropicApiKey: saved }))
  }, [])

  const set = (k: keyof FormFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'anthropicApiKey') localStorage.setItem('rg_anthropic_api_key', v)
  }

  const repoIsGithub = isGithubUrl(form.repoPath)

  const handleStart = async () => {
    if (!form.repoPath.trim() || !form.deploymentUrl.trim()) return
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        repo_input: form.repoPath.trim(),
        deployment_url: form.deploymentUrl.trim(),
        app_type: form.appType,
        scan_mode: form.scanMode,
      }
      if (form.loginEmail) body.login_email = form.loginEmail
      if (form.loginPassword) body.login_password = form.loginPassword
      if (form.anthropicApiKey) body.anthropic_api_key = form.anthropicApiKey

      const res = await fetch(`${BACKEND}/api/scans/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Backend returned ${res.status}: ${text.slice(0, 120)}`)
      }
      const json = await res.json()
      const scanId = json.scan_id ?? json.id
      if (!scanId) throw new Error('Backend did not return a scan_id')
      onStart(scanId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      if (msg.includes('fetch') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setError('Cannot reach backend at localhost:8000. Make sure the RuntimeGuard server is running and accessible.')
      } else {
        setError(msg)
      }
      setLoading(false)
    }
  }

  const inputBase = "w-full rounded-lg px-3.5 py-2.5 text-[13px] font-mono text-white placeholder-gray-700 outline-none border transition-all duration-200"
  const inputStyle = { background: '#090b12', borderColor: '#2a2d3e' }
  const focusStyle = { borderColor: 'rgba(0,255,136,0.4)' }
  const blurStyle = { borderColor: '#2a2d3e' }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 pt-20 pb-16" style={{ background: '#0f1117' }}>
      {/* ambient glow */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(0,255,136,0.05) 0%, transparent 65%)',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[540px] relative z-10"
      >
        {/* Header */}
        <div className="mb-9 text-center">
          <div className="inline-flex items-center gap-2 mb-5 px-3.5 py-1.5 rounded-full border border-[#00ff88]/20"
            style={{ background: 'rgba(0,255,136,0.05)' }}>
            <PulsingDot color="#00ff88" size={6} />
            <span className="text-[11px] font-mono text-[#00ff88] uppercase tracking-widest">RuntimeGuard AI</span>
          </div>
          <h1 className="text-[34px] font-bold text-white leading-tight tracking-tight">
            Agentic Recovery for
          </h1>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight" style={{ color: '#00ff88' }}>
            Production Web Apps
          </h1>
          <p className="mt-3 text-[13px] text-gray-500 leading-relaxed max-w-[420px] mx-auto">
            Point RuntimeGuard at your repo and live deployment. It discovers bugs, generates a minimal fix, verifies it in sandbox, then asks for your approval.
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-[#1e2130] overflow-hidden"
          style={{ background: '#13151f', boxShadow: '0 32px 64px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.025)' }}>

          <div className="px-6 pt-6 pb-5 space-y-4">

            {/* Repo Path / GitHub URL */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                Repository — GitHub URL or local path
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                  {repoIsGithub
                    ? <Github size={13} color="#00ff88" />
                    : <Server size={13} color="#555" />}
                </div>
                <input
                  type="text"
                  value={form.repoPath}
                  onChange={set('repoPath')}
                  placeholder="https://github.com/org/repo or ./path/to/repo"
                  className={`${inputBase} pl-9 pr-24`}
                  style={inputStyle}
                  onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
                  onBlur={e => Object.assign(e.currentTarget.style, blurStyle)}
                />
                {form.repoPath && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded"
                      style={{
                        color: repoIsGithub ? '#00ff88' : '#888',
                        background: repoIsGithub ? 'rgba(0,255,136,0.1)' : 'rgba(136,136,136,0.1)',
                        border: `1px solid ${repoIsGithub ? 'rgba(0,255,136,0.25)' : 'rgba(136,136,136,0.25)'}`,
                      }}>
                      {repoIsGithub ? 'GitHub' : 'Local'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Deployment URL */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest">
                Deployed App URL
              </label>
              <div className="relative">
                <Globe size={13} color="#555" className="absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={form.deploymentUrl}
                  onChange={set('deploymentUrl')}
                  placeholder="https://yourapp.com or http://localhost:3000"
                  className={`${inputBase} pl-9`}
                  style={inputStyle}
                  onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
                  onBlur={e => Object.assign(e.currentTarget.style, blurStyle)}
                />
              </div>
            </div>

            {/* App Type + Scan Mode */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest">App Type</label>
                <select
                  value={form.appType}
                  onChange={set('appType')}
                  className="w-full rounded-lg px-3 py-2.5 text-[12px] font-mono text-white outline-none border border-[#2a2d3e] transition-colors cursor-pointer appearance-none"
                  style={{ background: '#090b12' }}
                >
                  <option value="auto">Auto-detect</option>
                  <option value="react">React / Vite</option>
                  <option value="next">Next.js</option>
                  <option value="node">Node / Express</option>
                  <option value="fastapi">FastAPI</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-mono text-gray-500 uppercase tracking-widest">Scan Mode</label>
                <select
                  value={form.scanMode}
                  onChange={set('scanMode')}
                  className="w-full rounded-lg px-3 py-2.5 text-[12px] font-mono text-white outline-none border border-[#2a2d3e] transition-colors cursor-pointer appearance-none"
                  style={{ background: '#090b12' }}
                >
                  <option value="deep">Deep Scan</option>
                  <option value="quick">Quick Scan</option>
                  <option value="recovery">Recovery Mode</option>
                </select>
              </div>
            </div>

            {/* Credentials collapsible */}
            <div className="rounded-lg border border-[#1e2130] overflow-hidden" style={{ background: '#0f1118' }}>
              <button
                type="button"
                onClick={() => setShowCreds(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-mono text-gray-500 hover:text-gray-300 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Eye size={12} />
                  Credentials (optional)
                </span>
                {showCreds ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <AnimatePresence>
                {showCreds && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 border-t border-[#1e2130] pt-3">
                      <input
                        type="email"
                        value={form.loginEmail}
                        onChange={set('loginEmail')}
                        placeholder="email@example.com"
                        className={inputBase}
                        style={inputStyle}
                        onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
                        onBlur={e => Object.assign(e.currentTarget.style, blurStyle)}
                      />
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={form.loginPassword}
                          onChange={set('loginPassword')}
                          placeholder="password"
                          className={`${inputBase} pr-10`}
                          style={inputStyle}
                          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
                          onBlur={e => Object.assign(e.currentTarget.style, blurStyle)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* API Settings collapsible */}
            <div className="rounded-lg border border-[#1e2130] overflow-hidden" style={{ background: '#0f1118' }}>
              <button
                type="button"
                onClick={() => setShowApiSettings(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-[11px] font-mono text-gray-500 hover:text-gray-300 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Brain size={12} />
                  API Settings
                  {form.anthropicApiKey && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)' }}>
                      KEY SET
                    </span>
                  )}
                </span>
                {showApiSettings ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <AnimatePresence>
                {showApiSettings && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-2 border-t border-[#1e2130] pt-3">
                      <label className="block text-[10px] font-mono text-gray-600">Anthropic API Key</label>
                      <div className="relative">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={form.anthropicApiKey}
                          onChange={set('anthropicApiKey')}
                          placeholder="sk-ant-..."
                          className={`${inputBase} pr-10`}
                          style={inputStyle}
                          onFocus={e => Object.assign(e.currentTarget.style, focusStyle)}
                          onBlur={e => Object.assign(e.currentTarget.style, blurStyle)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
                        >
                          {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <p className="text-[10px] font-mono text-gray-600 leading-relaxed">
                        Optional: enables AI-powered patch generation. Stored in localStorage, never sent to any server except the local backend.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Error state */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mx-6 mb-4 flex items-start gap-2 rounded-lg px-4 py-3 border border-[#ff4444]/25"
                style={{ background: 'rgba(255,68,68,0.05)' }}
              >
                <AlertTriangle size={14} color="#ff6666" className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-[11px] font-mono text-[#ff6666] font-bold mb-0.5">Connection Error</p>
                  <p className="text-[11px] font-mono text-[#ff9999] leading-relaxed">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* CTA */}
          <div className="px-6 pb-6">
            <button
              onClick={handleStart}
              disabled={loading || !form.repoPath.trim() || !form.deploymentUrl.trim()}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl py-3.5 text-[14px] font-mono font-bold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{
                background: '#00ff88',
                color: '#080a10',
                boxShadow: (loading || !form.repoPath.trim() || !form.deploymentUrl.trim())
                  ? 'none'
                  : '0 0 40px rgba(0,255,136,0.3), 0 4px 16px rgba(0,255,136,0.2)',
              }}
            >
              {loading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-[#080a10]/40 border-t-[#080a10] rounded-full animate-spin" />
                  Initializing scan...
                </>
              ) : (
                <>
                  <Play size={15} />
                  Start RuntimeGuard Scan
                </>
              )}
            </button>
          </div>
        </div>

        {/* Feature pills */}
        <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
          {[
            { label: 'Real Playwright Browser Agent', color: '#00ddff' },
            { label: 'Sandbox Verified Patches', color: '#aa88ff' },
            { label: 'Human Approval Required', color: '#ffaa44' },
          ].map(({ label, color }) => (
            <span key={label}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono"
              style={{ color, border: `1px solid ${color}25`, background: `${color}08` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>

        <p className="mt-4 text-center text-[10px] font-mono text-gray-700">
          Backend API: <span className="text-gray-600">localhost:8000</span>
        </p>
      </motion.div>
    </div>
  )
}

// ─── Phase 2: Scanning ────────────────────────────────────────────────────────

interface LogEntry {
  time: string
  text: string
  type: 'info' | 'success' | 'warn' | 'error'
}

function ScanningPhase({ scanId, onComplete }: { scanId: string; onComplete: (data: ScanData) => void }) {
  const [data, setData] = useState<ScanData | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  const prevStatus = useRef<string>('')
  const completeCalled = useRef(false)

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'info') => {
    setLogs(l => [...l.slice(-80), { time: ts(), text, type }])
  }, [])

  useEffect(() => {
    addLog(`Scan pipeline started — ID: ${scanId}`, 'info')
    addLog('Establishing connection to RuntimeGuard backend...', 'info')

    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND}/api/scans/${scanId}`)
        if (!res.ok) {
          addLog(`Poll error: HTTP ${res.status}`, 'warn')
          return
        }
        const d: ScanData = await res.json()
        setData(d)

        if (d.status !== prevStatus.current) {
          const s = d.status
          prevStatus.current = s
          if (s === 'repo_scanning') addLog('Repository scanner activated — reading source files, lock files, configs...', 'info')
          if (s === 'browser_scanning') addLog('Playwright headless browser launched — navigating to deployment...', 'info')
          if (s === 'browser_scanning') addLog(`Target: ${d.deployment_url}`, 'info')
          if (s === 'correlating') {
            addLog(`Browser scan complete — ${d.pages_visited ?? 0} pages visited, ${d.buttons_tested ?? 0} actions tested`, 'success')
            addLog(`Found ${d.failed_api_calls ?? 0} failed API calls and ${d.console_errors ?? 0} console errors`, d.failed_api_calls ? 'warn' : 'info')
            addLog('Correlation engine linking browser failures to repository risks...', 'info')
          }
          if (s === 'bundling') addLog('Structuring full incident report with evidence chain...', 'info')
          if (s === 'patching') {
            addLog(`Incident classified: ${d.incident_type ?? 'analyzing...'}`, 'warn')
            addLog('AI patch generator crafting minimal, targeted recovery fix...', 'info')
          }
          if (s === 'verifying') addLog('Patch ready — executing in isolated sandbox environment...', 'info')
          if (s === 'awaiting_approval') {
            addLog(`Sandbox verification complete — ${d.sandbox_tests?.filter(t => t.status === 'passed').length ?? 0}/${d.sandbox_tests?.length ?? 0} tests passed`, 'success')
            addLog(`Risk score: ${d.risk_score}/100 (${d.risk_label})`, d.risk_score && d.risk_score >= 70 ? 'success' : 'warn')
            addLog('Fix ready for human review — awaiting your approval', 'success')
            if (!completeCalled.current) {
              completeCalled.current = true
              clearInterval(poll)
              setTimeout(() => onComplete(d), 900)
            }
          }
          if (s === 'failed') {
            addLog(`Pipeline failed: ${d.failure_reason ?? 'unknown error'}`, 'error')
            if (!completeCalled.current) {
              completeCalled.current = true
              clearInterval(poll)
              setTimeout(() => onComplete(d), 900)
            }
          }
        }
      } catch (e) {
        addLog(`Network error: ${e instanceof Error ? e.message : 'fetch failed'}`, 'error')
      }
    }, 2000)

    return () => clearInterval(poll)
  }, [scanId, addLog, onComplete])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const pipelineIdx = STATUS_TO_PIPELINE_IDX[data?.status ?? 'started'] ?? 0

  const logColor: Record<LogEntry['type'], string> = {
    info: '#8899aa',
    success: '#00ff88',
    warn: '#ffaa44',
    error: '#ff5566',
  }

  return (
    <div className="min-h-screen pt-14" style={{ background: '#0f1117' }}>
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 55% 35% at 50% 5%, rgba(0,255,136,0.04) 0%, transparent 65%)'
      }} />

      <div className="max-w-[1140px] mx-auto px-6 pt-8 pb-8 relative z-10">
        <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 360px' }}>

          {/* Left — Terminal */}
          <div className="rounded-2xl border border-[#1e2130] flex flex-col overflow-hidden" style={{ minHeight: 560, background: '#080a10' }}>
            {/* macOS chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e2130]" style={{ background: '#0e1016' }}>
              <span className="w-3 h-3 rounded-full bg-[#ff5f57] hover:brightness-125 cursor-default" />
              <span className="w-3 h-3 rounded-full bg-[#ffbd2e] hover:brightness-125 cursor-default" />
              <span className="w-3 h-3 rounded-full bg-[#28c840] hover:brightness-125 cursor-default" />
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[11px] font-mono text-gray-600">runtimeguard — scan pipeline — {scanId.slice(0, 16)}</span>
              </div>
              {data && !TERMINAL_STATUSES.has(data.status) && (
                <div className="flex items-center gap-1.5">
                  <PulsingDot color="#00ff88" size={5} />
                  <span className="text-[9px] font-mono text-[#00ff88]">LIVE</span>
                </div>
              )}
            </div>

            {/* Log area */}
            <div className="flex-1 p-4 overflow-auto font-mono text-[11.5px] leading-relaxed">
              <div className="space-y-0.5">
                {logs.map((entry, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex gap-2"
                  >
                    <span className="text-gray-700 shrink-0 select-none">{entry.time}</span>
                    <span className="text-gray-600 shrink-0 select-none">›</span>
                    <span style={{ color: logColor[entry.type] }}>{entry.text}</span>
                  </motion.div>
                ))}
                {data && !TERMINAL_STATUSES.has(data.status) && (
                  <span className="inline-block w-2 h-4 animate-pulse ml-0.5" style={{ background: '#00ff88', opacity: 0.8 }} />
                )}
              </div>
              <div ref={logsEndRef} />
            </div>

            {/* Live stats bar */}
            {data && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid grid-cols-4 border-t border-[#1e2130]"
                style={{ background: '#0a0c14' }}
              >
                {[
                  { label: 'Pages Visited', value: data.pages_visited ?? 0, color: '#00ddff' },
                  { label: 'Actions Tested', value: data.buttons_tested ?? 0, color: '#aa88ff' },
                  { label: 'API Failures', value: data.failed_api_calls ?? 0, color: '#ff6622' },
                  { label: 'Repo Risks', value: data.repo_risks?.length ?? 0, color: '#ffaa22' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex flex-col items-center py-3 border-r border-[#1e2130] last:border-r-0">
                    <span className="font-mono font-bold text-[17px]" style={{ color }}>{value}</span>
                    <span className="text-[9px] font-mono text-gray-600 uppercase tracking-wide mt-0.5">{label}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </div>

          {/* Right — 20-step pipeline tracker */}
          <div>
            <div className="mb-5">
              <p className="text-[10px] font-mono text-gray-600 uppercase tracking-widest mb-1">Pipeline Progress</p>
              <div className="flex items-center gap-2">
                {data && !TERMINAL_STATUSES.has(data.status) && <PulsingDot color="#00ff88" size={7} />}
                <h2 className="text-[16px] font-bold text-white">
                  {PIPELINE_STEPS[pipelineIdx]?.label ?? 'Initializing...'}
                </h2>
              </div>
              <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1d2e' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #00ff88, #00ddff)' }}
                  animate={{ width: `${((pipelineIdx + 1) / PIPELINE_STEPS.length) * 100}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
              <p className="text-[10px] font-mono text-gray-600 mt-1">
                Step {pipelineIdx + 1} of {PIPELINE_STEPS.length}
              </p>
            </div>

            <div className="space-y-1.5 max-h-[480px] overflow-auto pr-1">
              {PIPELINE_STEPS.map((step, idx) => {
                const done = idx < pipelineIdx
                const active = idx === pipelineIdx
                const pending = idx > pipelineIdx
                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: pending ? 0.3 : 1, x: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.03 }}
                    className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all duration-500"
                    style={{
                      border: active ? '1px solid rgba(0,255,136,0.3)' : '1px solid #1a1d2e',
                      background: active ? 'rgba(0,255,136,0.04)' : '#0f1117',
                    }}
                  >
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: done ? 'rgba(0,255,136,0.15)' : active ? 'rgba(0,255,136,0.08)' : '#1a1d2e',
                        border: done ? '1px solid rgba(0,255,136,0.4)' : active ? '1px solid rgba(0,255,136,0.25)' : '1px solid #2a2d3e',
                      }}>
                      {done
                        ? <CheckCircle2 size={11} color="#00ff88" />
                        : active
                          ? <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#00ff88' }} />
                          : <span className="text-[8px] font-mono text-gray-700">{idx + 1}</span>
                      }
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-mono leading-none truncate"
                        style={{ color: done ? '#00ff88' : active ? '#ffffff' : '#444' }}>
                        {step.label}
                      </p>
                    </div>
                    {done && <CheckCircle2 size={10} color="rgba(0,255,136,0.5)" className="shrink-0" />}
                    {active && <Clock size={10} color="rgba(0,255,136,0.6)" className="shrink-0 animate-pulse" />}
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Phase 3: Results ─────────────────────────────────────────────────────────

function ResultsPhase({ data: initialData, scanId, onReset }: {
  data: ScanData
  scanId: string
  onReset: () => void
}) {
  const [data, setData] = useState(initialData)
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [memoryPatterns, setMemoryPatterns] = useState<MemoryPattern[]>([])

  const meta = incidentMeta(data.incident_type)
  const bundle = data.incident_bundle ?? {}
  const risks = data.repo_risks ?? []
  const events = data.browser_events ?? []
  const tests = data.sandbox_tests ?? []
  const reasons = data.risk_reasons ?? []
  const failedApis = events.filter(e => e.event_type === 'failed_api')
  const consoleErrs = events.filter(e => e.event_type === 'console_error')
  const btnEvents = events.filter(e => ['button_clicked', 'button_triggered_failure', 'button_discovered'].includes(e.event_type))
  const pagesVisited = events.filter(e => e.event_type === 'page_visited')
  const screenshots = events.filter(e => e.event_type === 'screenshot' && e.url)

  const isApproved = data.status === 'approved'
  const isRejected = data.status === 'rejected'
  const isFailed = data.status === 'failed'
  const isAwaiting = data.status === 'awaiting_approval'

  useEffect(() => {
    fetch(`${BACKEND}/api/memory/patterns`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setMemoryPatterns(Array.isArray(d) ? d : d.patterns ?? []))
      .catch(() => {})
  }, [])

  const approve = async () => {
    setApproving(true)
    try {
      await fetch(`${BACKEND}/api/incidents/${scanId}/approve`, { method: 'POST' })
      setData(d => ({ ...d, status: 'approved' }))
    } finally { setApproving(false) }
  }

  const reject = async () => {
    setRejecting(true)
    try {
      await fetch(`${BACKEND}/api/incidents/${scanId}/reject`, { method: 'POST' })
      setData(d => ({ ...d, status: 'rejected' }))
    } finally { setRejecting(false) }
  }

  const downloadPatch = () => {
    if (!data.patch_diff) return
    const blob = new Blob([data.patch_diff], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `runtimeguard-${scanId.slice(0, 8)}.patch`
    a.click()
  }

  const downloadReport = () => {
    const lines = [
      `# RuntimeGuard AI — Incident Report`,
      ``,
      `**Scan ID:** ${scanId}`,
      `**Timestamp:** ${new Date().toISOString()}`,
      `**Incident Type:** ${meta.label}`,
      `**Risk Score:** ${data.risk_score}/100 (${data.risk_label})`,
      ``,
      `## Root Cause`,
      bundle.root_cause_hypothesis ?? '—',
      ``,
      `## Business Impact`,
      bundle.business_impact ?? '—',
      ``,
      `## Evidence (${risks.length} repo risks)`,
      ...risks.map(r => `- [${r.severity}] ${r.file}${r.line ? ':' + r.line : ''}: ${r.evidence}`),
      ``,
      `## Failed API Calls`,
      ...failedApis.map(e => `- ${e.method ?? 'POST'} ${e.url} → ${e.status}`),
      ``,
      `## Recovery Strategy`,
      data.recovery_strategy ?? '—',
      ``,
      `## Sandbox Results`,
      ...tests.map(t => `- [${t.status === 'passed' ? 'PASS' : 'FAIL'}] ${t.name}`),
      ``,
      `## Patch Diff`,
      '```diff',
      data.patch_diff ?? '(no patch)',
      '```',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `runtimeguard-report-${scanId.slice(0, 8)}.md`
    a.click()
  }

  // ── Tab content renderers ──

  const renderOverview = () => (
    <div className="space-y-5">
      {/* Evidence chain */}
      <div className="rounded-xl border border-[#1e2130] overflow-hidden" style={{ background: '#12141f' }}>
        <div className="px-5 py-3 border-b border-[#1e2130] flex items-center justify-between">
          <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">Evidence Chain</span>
          <div className="flex gap-2">
            <Badge label={`${risks.length} repo risks`} color="#00ddff" />
            <Badge label={`${failedApis.length} API fails`} color="#ff6622" />
            <Badge label={`${consoleErrs.length} console errors`} color="#ff4488" />
          </div>
        </div>
        <div className="divide-y divide-[#1a1c29] max-h-72 overflow-auto">
          {risks.slice(0, 10).map((r, i) => (
            <div key={i} className="px-5 py-3 hover:bg-white/[0.01] transition-colors">
              <div className="flex items-center gap-2 mb-1">
                <SevBadge severity={r.severity} />
                <span className="text-[10px] font-mono text-gray-600 truncate">{r.file}{r.line ? `:${r.line}` : ''}</span>
                {r.risk_type && <span className="text-[10px] font-mono text-gray-700 ml-auto">{r.risk_type}</span>}
              </div>
              <p className="text-[11px] font-mono text-gray-300 leading-relaxed">{r.evidence}</p>
              {r.matched && <p className="text-[10px] font-mono text-gray-600 mt-0.5 truncate">matched: "{r.matched}"</p>}
            </div>
          ))}
          {risks.length === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-[12px] font-mono text-gray-600">No repository risks found</p>
            </div>
          )}
        </div>
      </div>

      {/* Key stats grid */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard value={data.pages_visited ?? 0} label="Pages Visited" accent="#00ddff" icon={Globe} />
        <StatCard value={data.buttons_tested ?? 0} label="Actions Tested" accent="#aa88ff" icon={Activity} />
        <StatCard value={data.failed_api_calls ?? 0} label="API Failures" accent="#ff6622" icon={Network} />
        <StatCard value={risks.length} label="Repo Risks" accent="#ffaa22" icon={FileCode} />
      </div>

      {/* Risk reasons */}
      {reasons.length > 0 && (
        <div className="rounded-xl border border-[#1e2130] p-4" style={{ background: '#12141f' }}>
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-3">Risk Factors</p>
          <div className="space-y-1.5">
            {reasons.map((r, i) => (
              <p key={i} className="text-[12px] font-mono text-gray-300 flex items-start gap-2">
                <span style={{ color: '#00ff88' }} className="mt-0.5">▸</span>{r}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const renderRepo = () => (
    <div className="space-y-5">
      {/* Framework + meta */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Framework', value: data.framework ?? 'Auto-detected', accent: '#00ff88' },
          { label: 'Repository', value: data.repo_path ?? '—', accent: '#aaa' },
          { label: 'Risk Count', value: `${risks.length} findings`, accent: risks.length > 5 ? '#ff6622' : '#00ff88' },
        ].map(({ label, value, accent }) => (
          <div key={label} className="rounded-xl border border-[#1e2130] p-4" style={{ background: '#12141f' }}>
            <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-[13px] font-mono font-bold truncate" style={{ color: accent }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Risks table */}
      <div className="rounded-xl border border-[#1e2130] overflow-hidden" style={{ background: '#12141f' }}>
        <div className="px-5 py-3 border-b border-[#1e2130]">
          <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">Repository Risks</span>
        </div>
        {risks.length > 0 ? (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-[#1e2130]" style={{ background: '#0f1118' }}>
                  {['File', 'Line', 'Type', 'Severity', 'Evidence'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[9px] text-gray-600 uppercase tracking-widest font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181b27]">
                {risks.map((r, i) => (
                  <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-4 py-2.5 text-gray-400 truncate max-w-[160px]" title={r.file}>{r.file.split('/').slice(-2).join('/')}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.line ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{r.risk_type}</td>
                    <td className="px-4 py-2.5"><SevBadge severity={r.severity} /></td>
                    <td className="px-4 py-2.5 text-gray-400 max-w-[280px] truncate" title={r.evidence}>{r.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <CheckCircle2 size={24} color="rgba(0,255,136,0.4)" className="mx-auto mb-2" />
            <p className="text-[12px] font-mono text-gray-600">No repository risks found</p>
          </div>
        )}
      </div>
    </div>
  )

  const renderAppMap = () => {
    const appMap = data.app_map
    if (!appMap) {
      return (
        <div className="rounded-xl border border-[#1e2130] p-12 text-center" style={{ background: '#12141f' }}>
          <Network size={28} color="#333" className="mx-auto mb-3" />
          <p className="text-[12px] font-mono text-gray-600">App map not available for this scan</p>
        </div>
      )
    }

    const renderNode = (node: AppMapNode | Record<string, unknown>, depth = 0): React.ReactNode => {
      if (typeof node !== 'object' || node === null) {
        return <span className="text-[11px] font-mono text-gray-400">{String(node)}</span>
      }
      const indent = depth * 20
      const entries = Object.entries(node)
      return (
        <div style={{ marginLeft: indent }}>
          {entries.map(([key, val]) => (
            <div key={key} className="mb-1">
              <span className="text-[10px] font-mono text-[#00ddff]">{key}: </span>
              {Array.isArray(val) ? (
                <div className="mt-1">
                  {(val as unknown[]).map((item, i) => (
                    <div key={i} className="ml-4 mb-1">
                      {typeof item === 'object' ? renderNode(item as Record<string, unknown>, depth + 1) : (
                        <span className="text-[11px] font-mono text-gray-400">• {String(item)}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : typeof val === 'object' ? (
                renderNode(val as Record<string, unknown>, depth + 1)
              ) : (
                <span className="text-[11px] font-mono text-gray-300">{String(val)}</span>
              )}
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: Globe, label: 'Frontend Pages', color: '#00ddff' },
            { icon: Activity, label: 'API Calls', color: '#aa88ff' },
            { icon: Server, label: 'Backend Files', color: '#ffaa44' },
            { icon: Database, label: 'Dependencies', color: '#00ff88' },
          ].map(({ icon: Icon, label, color }) => (
            <div key={label} className="rounded-xl border border-[#1e2130] p-4 flex flex-col items-center gap-2" style={{ background: '#12141f' }}>
              <Icon size={18} color={color} />
              <span className="text-[10px] font-mono text-gray-600 text-center">{label}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-[#1e2130] p-5 overflow-auto max-h-[420px]" style={{ background: '#0a0c12' }}>
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-4">Application Structure</p>
          <div className="font-mono text-[11px]">
            {renderNode(appMap as Record<string, unknown>)}
          </div>
        </div>
      </div>
    )
  }

  const renderBrowser = () => (
    <div className="space-y-5">
      {/* Pages visited */}
      <div className="rounded-xl border border-[#1e2130] overflow-hidden" style={{ background: '#12141f' }}>
        <div className="px-5 py-3 border-b border-[#1e2130] flex items-center justify-between">
          <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">Pages Visited</span>
          <Badge label={`${data.pages_visited ?? pagesVisited.length} pages`} color="#00ddff" />
        </div>
        <div className="divide-y divide-[#181b27] max-h-40 overflow-auto">
          {pagesVisited.length > 0 ? pagesVisited.map((e, i) => (
            <div key={i} className="px-5 py-2.5 flex items-center gap-3">
              <Globe size={11} color="#555" />
              <span className="text-[11px] font-mono text-gray-300 truncate">{e.url ?? e.page}</span>
            </div>
          )) : (
            <div className="px-5 py-4">
              <p className="text-[11px] font-mono text-gray-600">{data.deployment_url ?? 'Deployment URL scanned'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Screenshots */}
      {screenshots.length > 0 && (
        <div className="rounded-xl border border-[#1e2130] p-4" style={{ background: '#12141f' }}>
          <p className="text-[11px] font-mono text-gray-500 uppercase tracking-wider mb-3">Screenshots</p>
          <div className="grid grid-cols-3 gap-3">
            {screenshots.map((e, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-[#2a2d3e] aspect-video flex items-center justify-center"
                style={{ background: '#0a0c12' }}>
                <img src={e.url} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action log */}
      <div className="rounded-xl border border-[#1e2130] overflow-hidden" style={{ background: '#12141f' }}>
        <div className="px-5 py-3 border-b border-[#1e2130] flex items-center justify-between">
          <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">Actions Discovered & Tested</span>
          <Badge label={`${data.buttons_tested ?? btnEvents.length} actions`} color="#aa88ff" />
        </div>
        <div className="p-4 grid grid-cols-2 gap-2 max-h-72 overflow-auto">
          {btnEvents.map((e, i) => {
            const isFailure = e.event_type === 'button_triggered_failure'
            const isSuccess = e.event_type === 'button_clicked'
            return (
              <div key={i} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border"
                style={{
                  background: isFailure ? 'rgba(255,68,68,0.04)' : 'rgba(0,255,136,0.03)',
                  borderColor: isFailure ? '#ff444430' : '#1e2130',
                }}>
                <span className="shrink-0">
                  {isFailure ? <XCircle size={11} color="#ff5566" /> : isSuccess ? <CheckCircle2 size={11} color="#00ff88" /> : <Circle size={11} color="#555" />}
                </span>
                <span className="text-[11px] font-mono truncate" style={{ color: isFailure ? '#ff8899' : '#aaa' }}>
                  {e.text ?? e.event_type}
                </span>
              </div>
            )
          })}
          {btnEvents.length === 0 && (
            <div className="col-span-2 py-6 text-center">
              <p className="text-[12px] font-mono text-gray-600">No UI actions recorded</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderFailures = () => (
    <div className="space-y-5">
      {/* Failed API calls table */}
      <div className="rounded-xl border border-[#1e2130] overflow-hidden" style={{ background: '#12141f' }}>
        <div className="px-5 py-3 border-b border-[#1e2130] flex items-center justify-between">
          <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">Failed API Calls</span>
          <Badge label={`${failedApis.length} failures`} color="#ff6622" />
        </div>
        {failedApis.length > 0 ? (
          <div className="overflow-auto max-h-64">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="border-b border-[#1e2130]" style={{ background: '#0f1118' }}>
                  {['Method', 'URL', 'Status', 'Triggered By'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[9px] text-gray-600 uppercase tracking-widest font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#181b27]">
                {failedApis.map((e, i) => (
                  <tr key={i} className="hover:bg-white/[0.01]">
                    <td className="px-4 py-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: 'rgba(255,102,34,0.15)', color: '#ff8855' }}>
                        {e.method ?? 'POST'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 max-w-[240px] truncate" title={e.url}>{e.url}</td>
                    <td className="px-4 py-2.5">
                      <span style={{ color: '#ff5566' }} className="font-bold">{e.status ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[160px] truncate">{e.triggered_by ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <CheckCircle2 size={24} color="rgba(0,255,136,0.4)" className="mx-auto mb-2" />
            <p className="text-[12px] font-mono text-gray-600">No failed API calls detected</p>
          </div>
        )}
      </div>

      {/* Console errors */}
      <div className="rounded-xl border border-[#1e2130] overflow-hidden" style={{ background: '#12141f' }}>
        <div className="px-5 py-3 border-b border-[#1e2130] flex items-center justify-between">
          <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">Console Errors</span>
          <Badge label={`${consoleErrs.length} errors`} color="#ff4488" />
        </div>
        <div className="divide-y divide-[#181b27] max-h-64 overflow-auto">
          {consoleErrs.map((e, i) => (
            <div key={i} className="px-5 py-3 flex items-start gap-3">
              <AlertTriangle size={11} color="#ff4488" className="shrink-0 mt-0.5" />
              <p className="text-[11px] font-mono text-[#ff9999] leading-relaxed break-all">{e.message}</p>
            </div>
          ))}
          {consoleErrs.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-[12px] font-mono text-gray-600">No console errors recorded</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderBundle = () => {
    const bundleEntries = Object.entries(bundle).filter(([k]) => !['incident_id'].includes(k))
    return (
      <div className="rounded-xl border border-[#1e2130] overflow-hidden" style={{ background: '#12141f' }}>
        <div className="px-5 py-3 border-b border-[#1e2130] flex items-center gap-2">
          <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">Incident Bundle</span>
          <span className="text-[10px] font-mono text-gray-700 ml-auto">#{bundle.incident_id ?? scanId.slice(0, 8)}</span>
        </div>
        <div className="divide-y divide-[#181b27]">
          {bundleEntries.map(([key, value]) => {
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            const isArray = Array.isArray(value)
            const isObj = typeof value === 'object' && value !== null && !isArray
            return (
              <div key={key} className="px-5 py-3.5 flex gap-4">
                <div className="w-44 shrink-0">
                  <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">{label}</p>
                </div>
                <div className="flex-1 min-w-0">
                  {isArray ? (
                    <div className="space-y-1">
                      {(value as unknown[]).map((item, i) => (
                        <p key={i} className="text-[12px] font-mono text-gray-300 flex items-start gap-1.5">
                          <span style={{ color: '#00ff88' }}>•</span> {String(item)}
                        </p>
                      ))}
                    </div>
                  ) : isObj ? (
                    <pre className="text-[11px] font-mono text-gray-400 whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                  ) : (
                    <p className="text-[12px] font-mono text-gray-200 leading-relaxed">{String(value ?? '—')}</p>
                  )}
                </div>
              </div>
            )
          })}
          {bundleEntries.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-[12px] font-mono text-gray-600">No bundle data available</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderRecovery = () => (
    <div className="space-y-5">
      {data.recovery_strategy && (
        <div className="rounded-xl border border-[#1e2130] p-5" style={{ background: '#12141f' }}>
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-2">Recovery Strategy</p>
          <p className="text-[13px] font-mono text-gray-200 leading-relaxed">{data.recovery_strategy}</p>
        </div>
      )}
      {data.patch_diff ? (
        <DiffViewer diff={data.patch_diff} />
      ) : (
        <div className="rounded-xl border border-[#1e2130] p-8 text-center" style={{ background: '#12141f' }}>
          <FileCode size={24} color="#333" className="mx-auto mb-3" />
          <p className="text-[12px] font-mono text-gray-600">No patch generated yet</p>
        </div>
      )}
      {data.test_code && (
        <div>
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-2">Generated Test Code</p>
          <CodeBlock code={data.test_code} language="python" />
        </div>
      )}
    </div>
  )

  const renderSandbox = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#1e2130] p-4 col-span-1" style={{ background: '#12141f' }}>
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-1">Status</p>
          <Badge label={data.sandbox_status ?? 'pending'} color={
            data.sandbox_status?.includes('pass') || data.sandbox_status === 'verified' ? '#00ff88' :
            data.sandbox_status === 'failed' ? '#ff4444' : '#ffaa22'
          } />
        </div>
        <div className="rounded-xl border border-[#1e2130] p-4" style={{ background: '#12141f' }}>
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-1">Tests</p>
          <p className="text-[15px] font-mono font-bold text-white">
            {tests.filter(t => t.status === 'passed').length}<span className="text-gray-600">/{tests.length}</span>
          </p>
        </div>
        <div className="rounded-xl border border-[#1e2130] p-4" style={{ background: '#12141f' }}>
          <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-1">Duration</p>
          <p className="text-[15px] font-mono font-bold text-white">
            {data.sandbox_duration_ms != null ? `${data.sandbox_duration_ms}ms` : '—'}
          </p>
        </div>
      </div>

      {/* Test results */}
      <div className="rounded-xl border border-[#1e2130] overflow-hidden" style={{ background: '#12141f' }}>
        <div className="px-5 py-3 border-b border-[#1e2130]">
          <span className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">Test Results</span>
        </div>
        <div className="divide-y divide-[#181b27]">
          {tests.map((t, i) => (
            <div key={i} className="px-5 py-3.5 flex items-start gap-3"
              style={{ background: t.status === 'passed' ? 'rgba(0,255,136,0.02)' : 'rgba(255,68,68,0.02)' }}>
              {t.status === 'passed'
                ? <CheckCircle2 size={14} color="#00ff88" className="shrink-0 mt-0.5" />
                : <XCircle size={14} color="#ff5566" className="shrink-0 mt-0.5" />
              }
              <div>
                <p className="text-[12px] font-mono leading-snug" style={{ color: t.status === 'passed' ? '#00ff88' : '#ff6666' }}>
                  {t.name}
                </p>
                {t.output && <p className="text-[10px] font-mono text-gray-600 mt-1">{t.output}</p>}
                {t.duration_ms != null && <p className="text-[10px] font-mono text-gray-700 mt-0.5">{t.duration_ms}ms</p>}
              </div>
            </div>
          ))}
          {tests.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-[12px] font-mono text-gray-600">No test results available</p>
            </div>
          )}
        </div>
      </div>

      {/* Sandbox logs */}
      {data.sandbox_logs && data.sandbox_logs.length > 0 && (
        <div className="rounded-xl border border-[#1e2130] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#2a2d3e]" style={{ background: '#12141f' }}>
            <Terminal size={12} color="#555" />
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Sandbox Logs</span>
          </div>
          <pre className="p-4 text-[11px] font-mono text-gray-400 overflow-auto max-h-48 leading-relaxed" style={{ background: '#0a0c12' }}>
            {data.sandbox_logs.join('\n')}
          </pre>
        </div>
      )}
    </div>
  )

  const renderPR = () => {
    if (!data.pr_title && !data.pr_body) {
      return (
        <div className="rounded-xl border border-[#1e2130] p-12 text-center" style={{ background: '#12141f' }}>
          <GitPullRequest size={28} color="#333" className="mx-auto mb-3" />
          <p className="text-[12px] font-mono text-gray-600">No PR preview available</p>
        </div>
      )
    }
    return (
      <div className="rounded-xl border border-[#2a2d3e] overflow-hidden">
        {/* GitHub-style header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#2a2d3e]" style={{ background: '#12141f' }}>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono font-bold"
            style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', border: '1px solid rgba(0,255,136,0.2)' }}>
            <GitPullRequest size={12} />
            Open
          </div>
          <span className="text-[13px] font-mono font-bold text-white">{data.pr_title}</span>
        </div>
        <div className="p-5" style={{ background: '#0d0f1a' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-[#1e2130] flex items-center justify-center">
              <Shield size={11} color="#00ff88" />
            </div>
            <span className="text-[11px] font-mono text-gray-500">runtimeguard-bot wants to merge changes</span>
          </div>
          <div className="rounded-lg border border-[#1e2130] p-4" style={{ background: '#0a0c14' }}>
            <pre className="text-[12px] font-mono text-gray-300 whitespace-pre-wrap leading-relaxed">{data.pr_body}</pre>
          </div>
        </div>
      </div>
    )
  }

  const renderMemory = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-mono text-gray-500 uppercase tracking-wider">Knowledge Patterns</p>
        <Badge label={`${memoryPatterns.length} patterns`} color="#aa88ff" />
      </div>
      {memoryPatterns.length > 0 ? (
        <div className="space-y-3">
          {memoryPatterns.map((p, i) => (
            <div key={i} className="rounded-xl border border-[#1e2130] p-4" style={{ background: '#12141f' }}>
              <div className="flex items-center gap-2 mb-2">
                {p.pattern_type && <Badge label={p.pattern_type} color="#aa88ff" />}
                {p.confidence != null && (
                  <span className="text-[10px] font-mono text-gray-600">
                    {Math.round(p.confidence * 100)}% confidence
                  </span>
                )}
                {p.created_at && <span className="text-[10px] font-mono text-gray-700 ml-auto">{p.created_at}</span>}
              </div>
              {p.description && <p className="text-[12px] font-mono text-gray-300 leading-relaxed mb-1">{p.description}</p>}
              {p.fix_applied && <p className="text-[11px] font-mono text-gray-600">Fix: {p.fix_applied}</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#1e2130] p-12 text-center" style={{ background: '#12141f' }}>
          <Brain size={28} color="#333" className="mx-auto mb-3" />
          <p className="text-[12px] font-mono text-gray-600 mb-1">No patterns stored yet</p>
          <p className="text-[11px] font-mono text-gray-700">Approve a fix to save the pattern to memory</p>
        </div>
      )}
    </div>
  )

  const renderApprove = () => (
    <div className="space-y-5">
      <div className="rounded-xl border overflow-hidden"
        style={{
          borderColor: isApproved ? '#00ff8844' : isRejected ? '#ff444444' : isFailed ? '#ff444444' : '#ffaa2244',
          background: isApproved ? 'rgba(0,255,136,0.04)' : isRejected ? 'rgba(255,68,68,0.04)' : 'rgba(255,170,34,0.04)',
        }}>
        <div className="px-6 py-5">
          {isFailed ? (
            <div className="flex items-center gap-3">
              <XCircle size={24} color="#ff5566" />
              <div>
                <p className="font-mono font-bold text-[#ff6666]">Pipeline Failed</p>
                <p className="text-[12px] font-mono text-gray-500 mt-0.5">{data.failure_reason}</p>
              </div>
            </div>
          ) : isApproved ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,255,136,0.15)' }}>
                <CheckCheck size={22} color="#00ff88" />
              </div>
              <div>
                <p className="font-mono font-bold text-[#00ff88] text-[15px]">Fix Approved</p>
                <p className="text-[12px] font-mono text-gray-400 mt-0.5">Recovery artifact created · Pattern saved to knowledge memory</p>
              </div>
            </div>
          ) : isRejected ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,68,68,0.15)' }}>
                <XCircle size={22} color="#ff5566" />
              </div>
              <div>
                <p className="font-mono font-bold text-[#ff6666] text-[15px]">Fix Rejected</p>
                <p className="text-[12px] font-mono text-gray-400 mt-0.5">The proposed patch was rejected by the reviewer</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5">
                <PulsingDot color="#ffaa22" size={8} />
                <p className="font-mono font-bold text-white text-[16px]">Human Approval Required</p>
                <span className="ml-auto text-[11px] font-mono text-gray-600">
                  AI proposes · Sandbox verifies · <span className="text-[#ffaa22] font-bold">You approve</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-lg border border-[#1e2130] p-4" style={{ background: '#0f1118' }}>
                  <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-1">Strategy</p>
                  <p className="text-[12px] font-mono text-gray-200">{data.recovery_strategy ?? 'Patch generated'}</p>
                </div>
                <div className="rounded-lg border border-[#1e2130] p-4" style={{ background: '#0f1118' }}>
                  <p className="text-[10px] font-mono text-gray-600 uppercase tracking-wider mb-1">Sandbox</p>
                  <p className="text-[12px] font-mono" style={{ color: '#00ff88' }}>
                    {tests.filter(t => t.status === 'passed').length}/{tests.length} tests passed
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={approve} disabled={approving}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] font-mono font-bold transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
                  style={{ background: '#00ff88', color: '#080a10', boxShadow: '0 0 28px rgba(0,255,136,0.3)' }}>
                  {approving ? <span className="w-4 h-4 border-2 border-[#080a10]/40 border-t-[#080a10] rounded-full animate-spin" /> : <CheckCheck size={16} />}
                  {approving ? 'Approving...' : 'Approve Fix'}
                </button>
                <button onClick={reject} disabled={rejecting}
                  className="px-6 py-3.5 rounded-xl text-[13px] font-mono font-bold border border-[#ff444433] hover:border-[#ff444466] transition-colors disabled:opacity-50"
                  style={{ color: '#ff6666', background: 'rgba(255,68,68,0.05)' }}>
                  {rejecting ? '...' : 'Reject Fix'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )

  const tabContent: Record<string, () => React.ReactNode> = {
    overview: renderOverview,
    repo: renderRepo,
    appmap: renderAppMap,
    browser: renderBrowser,
    failures: renderFailures,
    bundle: renderBundle,
    recovery: renderRecovery,
    sandbox: renderSandbox,
    pr: renderPR,
    memory: renderMemory,
    approve: renderApprove,
  }

  return (
    <div className="min-h-screen pt-14 pb-32" style={{ background: '#0f1117' }}>
      <div className="fixed inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse 60% 30% at 50% 0%, ${meta.color}04 0%, transparent 55%)`
      }} />

      <div className="max-w-[1060px] mx-auto px-6 pt-8 relative z-10">

        {/* ── Top Incident Banner ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border overflow-hidden mb-6"
          style={{ borderColor: `${meta.color}33`, background: meta.bg }}
        >
          <div className="px-6 py-5 flex items-start gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2.5 flex-wrap">
                <Badge label={meta.label} color={meta.color} />
                <span className="text-[10px] font-mono text-gray-600">
                  scan: <span className="text-gray-500">{scanId.slice(0, 16)}</span>
                </span>
                {data.started_at && (
                  <span className="text-[10px] font-mono text-gray-700 ml-auto">
                    {new Date(data.started_at).toLocaleString()}
                  </span>
                )}
              </div>
              <h2 className="text-[22px] font-bold text-white leading-snug mb-1.5">
                {bundle.frontend_symptom || 'Production incident detected and analyzed'}
              </h2>
              <p className="text-[13px] text-gray-400 leading-relaxed max-w-[600px]">
                {bundle.root_cause_hypothesis ?? 'Root cause analysis complete.'}
              </p>
              {bundle.business_impact && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border"
                  style={{ borderColor: `${meta.color}25`, background: `${meta.color}08` }}>
                  <AlertTriangle size={12} color={meta.color} />
                  <span className="text-[11px] font-mono font-bold" style={{ color: meta.color }}>
                    {bundle.business_impact}
                  </span>
                </div>
              )}
            </div>
            <div className="shrink-0">
              <RiskGauge score={data.risk_score} label={data.risk_label} />
            </div>
          </div>

          {/* Key facts row */}
          <div className="grid grid-cols-3 border-t" style={{ borderColor: `${meta.color}18` }}>
            {[
              { label: 'User Action', value: bundle.user_action ?? '—' },
              { label: 'Failed API', value: bundle.failed_api ?? failedApis[0]?.url?.split('/').slice(-3).join('/') ?? '—' },
              { label: 'Affected Flow', value: bundle.affected_flow ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} className="px-5 py-3.5 border-r last:border-r-0" style={{ borderColor: `${meta.color}18` }}>
                <p className="text-[9px] font-mono text-gray-600 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-[12px] font-mono text-gray-200 truncate" title={String(value)}>{String(value)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-0.5 mb-5 overflow-x-auto pb-1 scrollbar-none">
          {RESULT_TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            const isApproveTab = tab.id === 'approve'
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-mono whitespace-nowrap transition-all duration-200 relative"
                style={{
                  background: isActive ? (isApproveTab && isAwaiting ? 'rgba(255,170,34,0.12)' : 'rgba(0,255,136,0.08)') : 'transparent',
                  color: isActive ? (isApproveTab && isAwaiting ? '#ffaa22' : '#00ff88') : '#555',
                  border: isActive ? `1px solid ${isApproveTab && isAwaiting ? 'rgba(255,170,34,0.25)' : 'rgba(0,255,136,0.2)'}` : '1px solid transparent',
                }}
              >
                <Icon size={11} />
                {tab.label}
                {isApproveTab && isAwaiting && (
                  <span className="ml-1">
                    <PulsingDot color="#ffaa22" size={5} />
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── Tab Content ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {tabContent[activeTab]?.()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Sticky Bottom Approval Row ── */}
      {(isAwaiting || isApproved || isRejected) && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-0 left-0 right-0 z-40 border-t"
          style={{
            background: 'rgba(10,11,18,0.97)',
            backdropFilter: 'blur(24px)',
            borderColor: isApproved ? 'rgba(0,255,136,0.2)' : isRejected ? 'rgba(255,68,68,0.2)' : 'rgba(255,170,34,0.2)',
          }}
        >
          <div className="max-w-[1060px] mx-auto px-6 py-3.5 flex items-center gap-3">
            {isAwaiting && (
              <>
                <div className="flex items-center gap-2 mr-2">
                  <PulsingDot color="#ffaa22" size={7} />
                  <span className="text-[11px] font-mono font-bold text-[#ffaa22]">Human Approval Required</span>
                </div>
                <button
                  onClick={approve}
                  disabled={approving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-mono font-bold transition-all duration-200 disabled:opacity-50 active:scale-[0.97]"
                  style={{ background: '#00ff88', color: '#080a10', boxShadow: '0 0 24px rgba(0,255,136,0.25)' }}
                >
                  {approving
                    ? <span className="w-3.5 h-3.5 border-2 border-[#080a10]/40 border-t-[#080a10] rounded-full animate-spin" />
                    : <CheckCheck size={14} />}
                  {approving ? 'Approving...' : 'Approve Fix'}
                </button>
                <button
                  onClick={downloadPatch}
                  disabled={!data.patch_diff}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-mono transition-all duration-200 border border-[#2a2d3e] hover:border-[#3a3d4e] hover:text-gray-200 disabled:opacity-40"
                  style={{ color: '#888', background: '#12141f' }}
                >
                  <Download size={13} />
                  Download Patch
                </button>
                <button
                  onClick={downloadReport}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-mono transition-all duration-200 border border-[#2a2d3e] hover:border-[#3a3d4e] hover:text-gray-200"
                  style={{ color: '#888', background: '#12141f' }}
                >
                  <Download size={13} />
                  Download Report
                </button>
                <button
                  onClick={reject}
                  disabled={rejecting}
                  className="px-4 py-2.5 rounded-xl text-[12px] font-mono font-bold border border-[#ff444433] hover:border-[#ff444466] transition-colors disabled:opacity-50 ml-auto"
                  style={{ color: '#ff6666', background: 'rgba(255,68,68,0.05)' }}
                >
                  {rejecting ? '...' : 'Reject Fix'}
                </button>
              </>
            )}

            {isApproved && (
              <>
                <CheckCheck size={16} color="#00ff88" />
                <span className="text-[13px] font-mono font-bold text-[#00ff88]">
                  Fix Approved — Pattern saved to knowledge memory
                </span>
                <button
                  onClick={downloadReport}
                  className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-mono transition-all duration-200 border border-[#2a2d3e] hover:border-[#3a3d4e]"
                  style={{ color: '#888', background: '#12141f' }}
                >
                  <Download size={13} />
                  Download Report
                </button>
                <button
                  onClick={onReset}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-mono transition-all duration-200 border border-[#2a2d3e] hover:border-[#3a3d4e]"
                  style={{ color: '#888', background: '#12141f' }}
                >
                  <RotateCcw size={13} />
                  New Scan
                </button>
              </>
            )}

            {isRejected && (
              <>
                <XCircle size={16} color="#ff5566" />
                <span className="text-[13px] font-mono font-bold text-[#ff6666]">Fix Rejected</span>
                <button
                  onClick={onReset}
                  className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-mono transition-all duration-200 border border-[#2a2d3e] hover:border-[#3a3d4e]"
                  style={{ color: '#888', background: '#12141f' }}
                >
                  <RotateCcw size={13} />
                  New Scan
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Failed state bottom bar */}
      {isFailed && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#ff444430]"
          style={{ background: 'rgba(10,11,18,0.97)', backdropFilter: 'blur(24px)' }}>
          <div className="max-w-[1060px] mx-auto px-6 py-3.5 flex items-center gap-3">
            <XCircle size={16} color="#ff5566" />
            <span className="text-[13px] font-mono font-bold text-[#ff6666]">
              Pipeline Failed — {data.failure_reason ?? 'Unknown error'}
            </span>
            <button
              onClick={onReset}
              className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-mono border border-[#2a2d3e] hover:border-[#3a3d4e] transition-colors"
              style={{ color: '#888', background: '#12141f' }}
            >
              <RotateCcw size={13} />
              Start New Scan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function ScanDashboard() {
  const [phase, setPhase] = useState<'form' | 'scanning' | 'results'>('form')
  const [scanId, setScanId] = useState<string | null>(null)
  const [scanData, setScanData] = useState<ScanData | null>(null)

  const handleStart = useCallback((id: string) => {
    setScanId(id)
    setPhase('scanning')
  }, [])

  const handleComplete = useCallback((data: ScanData) => {
    setScanData(data)
    setPhase('results')
  }, [])

  const handleReset = useCallback(() => {
    setScanId(null)
    setScanData(null)
    setPhase('form')
  }, [])

  const navStatus = phase === 'form' ? 'form' : scanData?.status ?? 'started'

  return (
    <>
      <Nav scanId={scanId ?? undefined} status={navStatus} />
      <AnimatePresence mode="wait">
        {phase === 'form' && (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.3 }}>
            <FormPhase onStart={handleStart} />
          </motion.div>
        )}
        {phase === 'scanning' && scanId && (
          <motion.div key="scanning" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <ScanningPhase scanId={scanId} onComplete={handleComplete} />
          </motion.div>
        )}
        {phase === 'results' && scanData && scanId && (
          <motion.div key="results" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <ResultsPhase data={scanData} scanId={scanId} onReset={handleReset} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
