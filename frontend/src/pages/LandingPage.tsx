import { useState, Suspense, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import { useRef } from 'react'
import {
  Activity, Brain, Shield, GitPullRequest, Terminal, Layers,
  Zap, Lock, Eye, Users, BarChart3, ChevronDown,
  Server, Code, Cloud, CheckCircle2, AlertTriangle,
  ArrowRight, Play, Sparkles, Globe
} from 'lucide-react'
import HeroScene from '../components/three/HeroScene'
import PipelineVisualization from '../components/three/PipelineVisualization'

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' as const } },
}

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' as const } },
}

function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// Pulsing dot indicator component (Giga-style)
function PulsingDot({ color = 'bg-accent' }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-75`} />
      <span className={`relative inline-flex rounded-full h-2 w-2 ${color}`} />
    </span>
  )
}

// Animated counter component
function AnimatedCounter({ value, suffix = '', prefix = '' }: { value: string; suffix?: string; prefix?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  return (
    <span ref={ref} className="inline-block">
      {isInView ? (
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {prefix}{value}{suffix}
        </motion.span>
      ) : (
        <span className="opacity-0">{prefix}{value}{suffix}</span>
      )}
    </span>
  )
}

// Glassmorphic card component
function GlassCard({ children, className = '', hover = true }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <motion.div
      whileHover={hover ? { scale: 1.02, y: -4 } : undefined}
      transition={{ duration: 0.3 }}
      className={`relative bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl overflow-hidden ${className}`}
      style={{
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}
    >
      {children}
    </motion.div>
  )
}

// Progress bar component (Giga-style)
function AnimatedProgress({ progress, delay = 0 }: { progress: number; delay?: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  return (
    <div ref={ref} className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={isInView ? { width: `${progress}%` } : { width: 0 }}
        transition={{ duration: 1.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="h-full rounded-full bg-gradient-to-r from-accent/80 to-accent"
      />
    </div>
  )
}

// Architecture layers data
const architectureLayers = [
  {
    id: 'L1',
    title: 'Runtime Listener',
    description: 'Lightweight exception hook that captures crashes with full context. Zero-config integration via middleware injection.',
    details: [
      'Flask/Django/FastAPI middleware auto-detection',
      'Captures: exception type, message, full stack trace, request payload',
      'Async webhook delivery with retry logic',
      'Memory overhead: <2MB per process',
    ],
    progress: 100,
  },
  {
    id: 'L2',
    title: 'Incident Context Extractor',
    description: 'Parses stack traces and enriches with repository context. Identifies the exact failure point and surrounding code.',
    details: [
      'Stack trace parsing with frame extraction',
      'Git blame integration for change attribution',
      'Dependency version correlation',
      'Historical incident pattern matching',
    ],
    progress: 95,
  },
  {
    id: 'L3',
    title: 'Repository Context Layer',
    description: 'Fetches minimal, relevant code context from the repository. Only retrieves what\'s needed for the fix.',
    details: [
      'Targeted file fetching (not full repo clone)',
      'AST-aware context windowing',
      'Import/dependency graph traversal',
      'Secret redaction before AI processing',
    ],
    progress: 90,
  },
  {
    id: 'L4',
    title: 'Remediation Agent',
    description: 'Claude-powered patch generation with multiple candidate strategies. Generates minimal, focused fixes.',
    details: [
      'Multi-candidate generation (3-5 patches per incident)',
      'Strategy diversity: defensive, type-safe, refactor approaches',
      'Minimal diff philosophy — smallest change that fixes the issue',
      'Confidence scoring per candidate',
    ],
    progress: 88,
  },
  {
    id: 'L5',
    title: 'Verification Sandbox',
    description: 'Isolated execution environment that validates patches before human review. Runs original crash + regression tests.',
    details: [
      'Docker-based isolation per patch candidate',
      'Replay of original crash scenario',
      'Existing test suite execution',
      'Auto-generated regression test inclusion',
      'Resource limits and timeout enforcement',
    ],
    progress: 92,
  },
  {
    id: 'L6',
    title: 'Human Approval Layer',
    description: 'PR creation with full context for human review. Never merges without explicit approval.',
    details: [
      'GitHub PR with structured description',
      'Before/after code comparison',
      'Risk score and confidence metrics',
      'One-click approve or request changes',
    ],
    progress: 97,
  },
  {
    id: 'L7',
    title: 'Incident Dashboard',
    description: 'Real-time visibility into the full pipeline. MTTR analytics, health scoring, and audit trail.',
    details: [
      'Live incident timeline with status tracking',
      'Repository health score (CVEs, deprecated deps, patterns)',
      'MTTR trend analytics',
      'Full audit log of all AI decisions',
    ],
    progress: 85,
  },
]

// Demo timeline data — shows real integration flow
const demoTimeline = [
  { time: 'Step 1', label: 'Connect Your Repo', description: 'Install the RuntimeGuard GitHub App and select which repositories to monitor. One click, zero config.', icon: GitPullRequest, color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/20' },
  { time: 'Step 2', label: 'Monitors Continuously', description: 'RuntimeGuard watches your production logs, dependency versions, and framework changelogs 24/7.', icon: Activity, color: 'text-accent2', bg: 'bg-accent2/10', border: 'border-accent2/20' },
  { time: 'Step 3', label: 'Detects Issues', description: 'Production crash from logs? Deprecated API? New framework version breaks your code? Detected instantly.', icon: AlertTriangle, color: 'text-red', bg: 'bg-red/10', border: 'border-red/20' },
  { time: 'Step 4', label: 'Generates Fix in Sandbox', description: 'AI generates 3-5 candidate patches and runs each in an isolated Docker sandbox with your test suite.', icon: Brain, color: 'text-purple', bg: 'bg-purple/10', border: 'border-purple/20' },
  { time: 'Step 5', label: 'Opens a PR', description: 'The verified fix is submitted as a PR with full context: what broke, why, and how the patch fixes it.', icon: Code, color: 'text-accent3', bg: 'bg-accent3/10', border: 'border-accent3/20' },
  { time: 'Step 6', label: 'You Review & Merge', description: 'You stay in control. Review the diff, check the sandbox results, and merge when you\'re confident.', icon: CheckCircle2, color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/20' },
]

// Features data
const features = [
  { icon: GitPullRequest, title: 'GitHub Integration', description: 'Install the GitHub App, select repos — RuntimeGuard handles the rest automatically', stat: '1-click' },
  { icon: Activity, title: 'Log Monitoring', description: 'Reads production error logs in real-time and triggers autonomous fix pipelines', stat: '24/7' },
  { icon: Zap, title: 'Deprecated API Fixes', description: 'Detects deprecated APIs and auto-generates migration patches before they break', stat: 'Proactive' },
  { icon: Globe, title: 'Framework Upgrades', description: 'Monitors framework releases and updates your code to new versions automatically', stat: 'Auto' },
  { icon: Shield, title: 'Sandbox-First', description: 'Every fix runs in an isolated Docker sandbox with your test suite before any PR', stat: '100%' },
  { icon: Brain, title: 'Claude-Powered', description: 'Anthropic Claude reasons about code context to generate minimal, correct patches', stat: 'AI' },
  { icon: Layers, title: 'Multi-Candidate', description: '3-5 fix strategies per issue — defensive, type-safe, refactor — picks the best', stat: '3-5x' },
  { icon: Users, title: 'Human Approval', description: 'Never merges without your explicit review. You stay in control, always.', stat: '0 auto' },
  { icon: Lock, title: 'Secret Redaction', description: 'Your code is stripped of secrets before any AI processing. SOC2-ready.', stat: '99.9%' },
]

// Error types data — broader use cases RuntimeGuard handles
const errorTypes = [
  { type: 'Production Crash', language: 'Python', before: 'email = data["email"]', after: 'email = data.get("email", "")' },
  { type: 'Deprecated API', language: 'Node.js', before: 'new Buffer(data)', after: 'Buffer.from(data)' },
  { type: 'Framework Upgrade', language: 'React', before: 'componentWillMount()', after: 'useEffect(() => {}, [])' },
  { type: 'Security Vuln', language: 'Python', before: 'yaml.load(file)', after: 'yaml.safe_load(file)' },
  { type: 'Breaking Change', language: 'Python', before: 'requests.get(url)', after: 'httpx.get(url, timeout=5)' },
  { type: 'Type Error', language: 'TypeScript', before: 'user.profile.name', after: 'user?.profile?.name ?? ""' },
]

// Tech stack data
const techStack = [
  { group: 'Backend', items: ['Python 3.11+', 'FastAPI', 'SQLite/PostgreSQL', 'Docker SDK'], icon: Server },
  { group: 'Frontend', items: ['React 19', 'TypeScript', 'Tailwind CSS', 'Recharts'], icon: Layers },
  { group: 'AI / APIs', items: ['Anthropic Claude', 'GitHub API', 'Slack API', 'Sentry SDK'], icon: Brain },
  { group: 'Infrastructure', items: ['Docker', 'GitHub Actions', 'Webhook Ingestion', 'Sandbox Isolation'], icon: Cloud },
]

// Security data
const securityItems = [
  { icon: Eye, title: 'Minimal context', description: 'Only fetches files directly related to the crash — never clones full repos' },
  { icon: Lock, title: 'Secret redaction', description: 'Regex + entropy-based detection strips secrets before any AI call' },
  { icon: Shield, title: 'Sandbox isolation', description: 'Docker containers with no network, resource limits, auto-cleanup' },
  { icon: Users, title: 'Human approval', description: 'AI never merges code — always requires explicit human review' },
  { icon: Activity, title: 'Audit log', description: 'Every AI decision, patch generation, and approval tracked' },
  { icon: Server, title: 'Enterprise-ready', description: 'SOC2 compliance path, SSO, role-based access control' },
]

// Pricing data
const pricingTiers = [
  {
    name: 'Starter',
    price: '$49',
    period: '/month',
    description: 'For small teams getting started',
    features: ['Up to 50 incidents/month', '3 repositories', 'Email notifications', 'Basic analytics', 'Community support'],
    featured: false,
  },
  {
    name: 'Growth',
    price: '$299',
    period: '/month',
    description: 'For growing engineering teams',
    features: ['Unlimited incidents', 'Unlimited repositories', 'Slack integration', 'Advanced MTTR analytics', 'Priority support', 'Custom policies'],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations',
    features: ['Everything in Growth', 'SSO / SAML', 'SOC2 compliance', 'Dedicated sandbox cluster', 'SLA guarantee', 'On-prem deployment option'],
    featured: false,
  },
]

export default function LandingPage() {
  const [openLayer, setOpenLayer] = useState<string | null>(null)

  // Rotate through features (for future interactive feature highlight)
  const [, setActiveFeature] = useState(0)

  // Rotate through features
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const toggleLayer = (id: string) => {
    setOpenLayer(openLayer === id ? null : id)
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      {/* Nav - Glassmorphic fixed nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-bg/70 backdrop-blur-2xl border-b border-white/[0.06] h-16 flex items-center justify-between px-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center">
            <Shield size={14} className="text-accent" />
          </div>
          <span className="font-mono text-[13px] text-text tracking-wider font-bold">RuntimeGuard</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#flow" className="text-muted text-[13px] hover:text-text transition-colors duration-300">Product</a>
          <a href="#architecture" className="text-muted text-[13px] hover:text-text transition-colors duration-300">Architecture</a>
          <a href="#demo" className="text-muted text-[13px] hover:text-text transition-colors duration-300">How It Works</a>
          <a href="#features" className="text-muted text-[13px] hover:text-text transition-colors duration-300">Features</a>
          <a href="#security" className="text-muted text-[13px] hover:text-text transition-colors duration-300">Security</a>
          <a href="#pricing" className="text-muted text-[13px] hover:text-text transition-colors duration-300">Pricing</a>
        </div>
        <Link
          to="/dashboard"
          className="group relative bg-accent text-bg px-5 py-2 rounded-full text-[13px] font-medium hover:shadow-[0_0_30px_rgba(0,255,136,0.3)] transition-all duration-300"
        >
          <span className="relative z-10">Launch Dashboard</span>
        </Link>
      </nav>

      {/* Hero - Full viewport with gradient mask */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* 3D Background Scene */}
        <Suspense fallback={null}>
          <HeroScene />
        </Suspense>

        {/* Radial gradient overlay */}
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,transparent_0%,#070a0f_70%)]" />
        
        {/* Animated grid */}
        <div className="absolute inset-0 opacity-[0.03] z-[1]" style={{
          backgroundImage: 'linear-gradient(rgba(0,255,136,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.3) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }} />

        {/* Top gradient fade */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-bg to-transparent z-[2]" />

        <div className="relative z-10 max-w-[1000px] mx-auto text-center px-6 pt-16">
          {/* Badge with pulsing dot */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="inline-flex items-center gap-2 bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] rounded-full px-5 py-2 mb-8"
          >
            <PulsingDot color="bg-accent" />
            <span className="text-accent/90 text-[12px] font-medium tracking-wide">AUTONOMOUS RUNTIME REMEDIATION</span>
          </motion.div>

          {/* Main headline - Large and bold like Giga */}
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold leading-[0.95] mb-8 tracking-tight"
          >
            <span className="block text-text">From crash</span>
            <span className="block mt-2">
              to verified{' '}
              <span className="relative inline-block">
                <span className="text-accent">PR</span>
                <motion.span
                  className="absolute -bottom-2 left-0 right-0 h-[3px] bg-accent rounded-full"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.8, delay: 1.2 }}
                />
              </span>
              <span className="text-accent">.</span>
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="text-muted text-lg md:text-xl max-w-[650px] mx-auto mb-14 leading-relaxed"
          >
            Connect your GitHub repo. RuntimeGuard monitors production logs, detects crashes, 
            upgrades deprecated APIs, and ships verified fixes — autonomously.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20"
          >
            <Link
              to="/dashboard"
              className="group relative bg-accent text-bg px-8 py-3.5 rounded-full text-[14px] font-semibold hover:shadow-[0_0_40px_rgba(0,255,136,0.3)] transition-all duration-300 flex items-center gap-2"
            >
              <Play size={16} className="group-hover:scale-110 transition-transform" />
              Watch Live Demo
            </Link>
            <a
              href="#flow"
              className="px-8 py-3.5 rounded-full text-[14px] font-medium border border-white/[0.1] text-text hover:border-white/[0.2] hover:bg-white/[0.03] transition-all duration-300"
            >
              How it works
            </a>
          </motion.div>

          {/* Animated pipeline flow */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 1.1 }}
            className="flex flex-wrap justify-center items-center gap-2 md:gap-3 mb-20"
          >
            {['connect repo', 'monitor logs', 'detect issues', 'sandbox fix', 'open PR'].map((step, i) => (
              <motion.div
                key={step}
                className="flex items-center gap-2 md:gap-3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 1.3 + i * 0.15 }}
              >
                <motion.span
                  className="bg-white/[0.04] backdrop-blur-sm border border-white/[0.08] rounded-full px-4 py-2 text-[11px] md:text-[12px] font-mono text-text/80 hover:border-accent/30 hover:text-accent transition-all duration-300 cursor-default"
                  whileHover={{ scale: 1.05, borderColor: 'rgba(0,255,136,0.4)' }}
                >
                  {step}
                </motion.span>
                {i < 4 && (
                  <motion.div
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                  >
                    <ArrowRight size={14} className="text-accent/60" />
                  </motion.div>
                )}
              </motion.div>
            ))}
          </motion.div>

          {/* Large stats - Giga style with big mono numbers */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.6 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-[800px] mx-auto"
          >
            {[
              { value: '$14K', label: 'avg cost per minute of downtime', color: 'text-red' },
              { value: '<3 min', label: 'crash to verified PR', color: 'text-accent' },
              { value: '$37B', label: 'addressable market (TAM)', color: 'text-accent2' },
            ].map((stat, i) => (
              <GlassCard key={stat.label} className="p-8 text-center group">
                <motion.div
                  className={`text-4xl md:text-5xl font-mono font-bold ${stat.color} mb-3`}
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2 }}
                >
                  {stat.value}
                </motion.div>
                <div className="text-muted text-[12px] leading-relaxed">{stat.label}</div>
              </GlassCard>
            ))}
          </motion.div>
        </div>

        {/* Bottom gradient mask (Giga-style) */}
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-bg to-transparent z-[2]" />
      </section>

      {/* Core Flow - Product section with glassmorphic cards */}
      <section id="flow" className="py-32 px-6 relative">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/[0.03] rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-[1200px] mx-auto relative">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 mb-4">
              <PulsingDot color="bg-accent" />
              <span className="text-accent text-[12px] font-medium tracking-wide">CORE FLOW</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl lg:text-6xl font-bold mt-3 tracking-tight">
              Seven layers.<br />
              <span className="text-muted">One pipeline.</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-muted mt-5 max-w-[550px] mx-auto text-lg">
              Each component is independently testable, replaceable, and observable.
            </motion.p>
          </AnimatedSection>

          {/* 3D Pipeline Visualization */}
          <Suspense fallback={<div className="h-[300px] bg-white/[0.02] rounded-2xl animate-pulse border border-white/[0.05]" />}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="mb-16 rounded-2xl border border-white/[0.06] overflow-hidden bg-white/[0.02] backdrop-blur-sm"
            >
              <PipelineVisualization />
            </motion.div>
          </Suspense>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[
              { icon: Terminal, title: 'Log Monitor', desc: 'Watches production logs for crashes, errors, and anomalies in real-time', color: 'from-red/20 to-red/5' },
              { icon: Activity, title: 'Dependency Scanner', desc: 'Detects deprecated APIs, outdated packages, and security vulnerabilities', color: 'from-accent3/20 to-accent3/5' },
              { icon: Code, title: 'Code Analyzer', desc: 'Fetches minimal context from your repo — only what\'s needed for the fix', color: 'from-purple/20 to-purple/5' },
              { icon: Brain, title: 'AI Patch Engine', desc: 'Claude generates 3-5 candidate fixes with different strategies', color: 'from-accent2/20 to-accent2/5' },
              { icon: Shield, title: 'Sandbox Verifier', desc: 'Docker-isolated testing — runs your test suite against each patch', color: 'from-accent/20 to-accent/5' },
              { icon: GitPullRequest, title: 'PR Creator', desc: 'Opens a PR with full context: what broke, why, and how it\'s fixed', color: 'from-accent/20 to-accent/5' },
              { icon: BarChart3, title: 'Health Dashboard', desc: 'Track repo health, MTTR, and proactive issue prevention', color: 'from-accent2/20 to-accent2/5' },
            ].map(({ icon: Icon, title, desc, color }, i) => (
              <motion.div
                key={title}
                variants={scaleIn}
                className="group"
              >
                <GlassCard className="p-6 h-full">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon size={18} className="text-text" />
                  </div>
                  <h3 className="font-semibold text-[14px] mb-2 text-text">{title}</h3>
                  <p className="text-muted text-[13px] leading-relaxed">{desc}</p>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Architecture - Accordion with progress bars */}
      <section id="architecture" className="py-32 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent pointer-events-none" />
        
        <div className="max-w-[900px] mx-auto relative">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 mb-4">
              <PulsingDot color="bg-accent2" />
              <span className="text-accent2 text-[12px] font-medium tracking-wide">ARCHITECTURE</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold mt-3 tracking-tight">Deep dive into each layer</motion.h2>
            <motion.p variants={fadeInUp} className="text-muted mt-4 text-lg">Click to expand and explore the implementation details.</motion.p>
          </AnimatedSection>

          <div className="space-y-3">
            {architectureLayers.map((layer, idx) => (
              <motion.div
                key={layer.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.05 }}
              >
                <GlassCard hover={false} className={`transition-all duration-300 ${openLayer === layer.id ? 'border-accent/20' : ''}`}>
                  <button
                    onClick={() => toggleLayer(layer.id)}
                    className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors text-left"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <span className="text-accent font-mono text-[11px] font-bold bg-accent/10 px-2.5 py-1 rounded-lg">{layer.id}</span>
                      <div className="flex-1">
                        <span className="font-semibold text-[14px]">{layer.title}</span>
                        <div className="mt-2">
                          <AnimatedProgress progress={layer.progress} delay={idx * 0.1} />
                        </div>
                      </div>
                    </div>
                    <motion.div
                      animate={{ rotate: openLayer === layer.id ? 180 : 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronDown size={16} className="text-muted" />
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {openLayer === layer.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 border-t border-white/[0.05]">
                          <p className="text-muted text-[13px] mt-4 mb-4 leading-relaxed">{layer.description}</p>
                          <ul className="space-y-2">
                            {layer.details.map((detail, i) => (
                              <motion.li
                                key={i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-start gap-3 text-[13px]"
                              >
                                <CheckCircle2 size={14} className="text-accent mt-0.5 shrink-0" />
                                <span className="text-text/80">{detail}</span>
                              </motion.li>
                            ))}
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Timeline - Interactive with animated connections */}
      <section id="demo" className="py-32 px-6 relative">
        <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-accent/[0.02] rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-[800px] mx-auto relative">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 mb-4">
              <PulsingDot color="bg-accent3" />
              <span className="text-accent3 text-[12px] font-medium tracking-wide">HOW IT WORKS</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold mt-3 tracking-tight">
              Integrate once. <span className="text-muted">Fix forever.</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-muted mt-4 text-lg">Connect your repo and let RuntimeGuard handle the rest — from detection to verified PR.</motion.p>
          </AnimatedSection>

          <div className="relative">
            {/* Animated timeline line */}
            <motion.div
              className="absolute left-[28px] md:left-[32px] top-0 bottom-0 w-px"
              style={{ background: 'linear-gradient(to bottom, transparent, rgba(0,255,136,0.3), transparent)' }}
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.5 }}
            />

            <div className="space-y-4">
              {demoTimeline.map((item, i) => {
                const Icon = item.icon
                return (
                  <motion.div
                    key={item.time}
                    className="flex items-start gap-5 relative pl-2"
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: i * 0.1 }}
                  >
                    {/* Timeline dot */}
                    <motion.div
                      className={`relative z-10 w-14 h-14 md:w-14 md:h-14 rounded-2xl ${item.bg} border ${item.border} flex items-center justify-center shrink-0`}
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4, delay: i * 0.1 + 0.2, type: 'spring' }}
                    >
                      <Icon size={18} className={item.color} />
                    </motion.div>

                    {/* Content card */}
                    <GlassCard className="flex-1 p-5 group">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`font-mono text-[11px] font-bold ${item.color}`}>{item.time}</span>
                        <span className="text-[10px] text-muted bg-white/[0.05] px-2 py-0.5 rounded-full">{item.label}</span>
                      </div>
                      <p className="text-text/80 text-[13px] leading-relaxed">{item.description}</p>
                    </GlassCard>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* CTA after timeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-center mt-12"
          >
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 bg-accent text-bg px-6 py-3 rounded-full text-[13px] font-semibold hover:shadow-[0_0_30px_rgba(0,255,136,0.3)] transition-all duration-300"
            >
              <Play size={14} />
              Try it yourself
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Product Mockup Section - Real integration preview */}
      <section className="py-20 px-6 relative overflow-hidden">
        <div className="max-w-[1100px] mx-auto">
          <AnimatedSection className="text-center mb-12">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 mb-4">
              <PulsingDot color="bg-purple" />
              <span className="text-purple text-[12px] font-medium tracking-wide">WHAT IT CATCHES</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold tracking-tight">
              Always watching. <span className="text-muted">Always fixing.</span>
            </motion.h2>
          </AnimatedSection>

          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            {/* Mockup frame */}
            <div className="relative rounded-2xl border border-white/[0.08] overflow-hidden bg-white/[0.02] backdrop-blur-sm p-1">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red/60" />
                  <div className="w-3 h-3 rounded-full bg-accent3/60" />
                  <div className="w-3 h-3 rounded-full bg-accent/60" />
                </div>
                <div className="flex-1 flex justify-center">
                  <div className="bg-white/[0.05] rounded-lg px-4 py-1 text-[11px] text-muted font-mono">
                    app.runtimeguard.ai/dashboard
                  </div>
                </div>
              </div>
              
              {/* Dashboard preview content */}
              <div className="bg-bg p-6 min-h-[340px] relative">
                {/* Top stats */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-surface rounded-lg p-3 border border-border">
                    <div className="text-[9px] text-muted mb-1">Connected Repos</div>
                    <div className="text-xl font-mono font-bold text-accent">7</div>
                  </div>
                  <div className="bg-surface rounded-lg p-3 border border-border">
                    <div className="text-[9px] text-muted mb-1">Issues Fixed (30d)</div>
                    <div className="text-xl font-mono font-bold text-accent2">34</div>
                  </div>
                  <div className="bg-surface rounded-lg p-3 border border-border">
                    <div className="text-[9px] text-muted mb-1">Deprecated APIs</div>
                    <div className="text-xl font-mono font-bold text-accent3">5</div>
                  </div>
                  <div className="bg-surface rounded-lg p-3 border border-border">
                    <div className="text-[9px] text-muted mb-1">Health Score</div>
                    <div className="text-xl font-mono font-bold text-accent">94/100</div>
                  </div>
                </div>

                {/* Active issues feed */}
                <div className="bg-surface rounded-lg p-4 border border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    <span className="text-[11px] font-mono text-muted">Live Issue Feed</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 bg-white/[0.02] rounded-lg px-3 py-2">
                      <div className="w-2 h-2 rounded-full bg-red" />
                      <span className="text-[10px] font-mono text-red">CRASH</span>
                      <span className="text-[11px] text-text/70 flex-1">KeyError in /api/users — PR #47 opened</span>
                      <span className="text-[9px] text-accent bg-accent/10 px-2 py-0.5 rounded">verified</span>
                    </div>
                    <div className="flex items-center gap-3 bg-white/[0.02] rounded-lg px-3 py-2">
                      <div className="w-2 h-2 rounded-full bg-accent3" />
                      <span className="text-[10px] font-mono text-accent3">DEPRECATION</span>
                      <span className="text-[11px] text-text/70 flex-1">urllib3 v1.x → v2.x migration — PR #48 opened</span>
                      <span className="text-[9px] text-accent2 bg-accent2/10 px-2 py-0.5 rounded">sandbox</span>
                    </div>
                    <div className="flex items-center gap-3 bg-white/[0.02] rounded-lg px-3 py-2">
                      <div className="w-2 h-2 rounded-full bg-purple" />
                      <span className="text-[10px] font-mono text-purple">UPGRADE</span>
                      <span className="text-[11px] text-text/70 flex-1">React 18 → 19 breaking changes — analyzing</span>
                      <span className="text-[9px] text-muted bg-white/[0.05] px-2 py-0.5 rounded">detecting</span>
                    </div>
                  </div>
                </div>
                
                {/* Gradient mask at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-bg to-transparent" />
              </div>
            </div>

            {/* Glow effect behind mockup */}
            <div className="absolute -inset-4 bg-gradient-to-r from-accent/[0.05] via-purple/[0.05] to-accent2/[0.05] rounded-3xl blur-xl -z-10" />
          </motion.div>
        </div>
      </section>

      {/* Features Grid - Glassmorphic with stats */}
      <section id="features" className="py-32 px-6 relative">
        <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-purple/[0.03] rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-[1200px] mx-auto relative">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 mb-4">
              <PulsingDot color="bg-accent" />
              <span className="text-accent text-[12px] font-medium tracking-wide">FEATURES</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold mt-3 tracking-tight">
              Built for <span className="text-muted">production reality</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-muted mt-4 text-lg max-w-[500px] mx-auto">
              Every feature designed around real-world incident response patterns.
            </motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon: Icon, title, description, stat }, i) => (
              <motion.div key={title} variants={scaleIn}>
                <GlassCard className="p-6 h-full group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors duration-300">
                      <Icon size={18} className="text-accent" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-accent/70 bg-accent/[0.06] px-2 py-1 rounded-lg">
                      {stat}
                    </span>
                  </div>
                  <h3 className="font-semibold text-[14px] mb-2">{title}</h3>
                  <p className="text-muted text-[13px] leading-relaxed">{description}</p>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Error Types - Interactive code comparison */}
      <section id="errors" className="py-32 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.005] to-transparent pointer-events-none" />
        
        <div className="max-w-[1200px] mx-auto relative">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 mb-4">
              <PulsingDot color="bg-red" />
              <span className="text-red text-[12px] font-medium tracking-wide">USE CASES</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold mt-3 tracking-tight">
              Fixes the issues <span className="text-muted">you actually face</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-muted mt-4 text-lg">From runtime crashes to framework migrations — all handled autonomously.</motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {errorTypes.map((err, i) => (
              <motion.div key={err.type} variants={scaleIn}>
                <GlassCard className="p-5 h-full group">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle size={14} className="text-red" />
                    <span className="font-mono text-[12px] font-bold text-red">{err.type}</span>
                    <span className="text-muted text-[10px] ml-auto font-mono bg-white/[0.05] px-2 py-0.5 rounded">{err.language}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-red/[0.06] border border-red/10 rounded-lg px-3 py-2.5 group-hover:border-red/20 transition-colors">
                      <span className="text-[9px] font-mono text-red/50 block mb-1">BEFORE</span>
                      <code className="text-[11px] font-mono text-red/90">{err.before}</code>
                    </div>
                    <div className="flex justify-center">
                      <ArrowRight size={12} className="text-accent/40 rotate-90" />
                    </div>
                    <div className="bg-accent/[0.06] border border-accent/10 rounded-lg px-3 py-2.5 group-hover:border-accent/20 transition-colors">
                      <span className="text-[9px] font-mono text-accent/50 block mb-1">AFTER</span>
                      <code className="text-[11px] font-mono text-accent/90">{err.after}</code>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Tech Stack - With icons and glassmorphic cards */}
      <section id="stack" className="py-32 px-6 relative">
        <div className="max-w-[1000px] mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 mb-4">
              <PulsingDot color="bg-accent2" />
              <span className="text-accent2 text-[12px] font-medium tracking-wide">TECH STACK</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold mt-3 tracking-tight">
              Modern. Proven. <span className="text-muted">Boring where it counts.</span>
            </motion.h2>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {techStack.map(({ group, items, icon: Icon }, i) => (
              <motion.div key={group} variants={scaleIn}>
                <GlassCard className="p-6 h-full">
                  <div className="w-10 h-10 rounded-xl bg-accent2/10 flex items-center justify-center mb-4">
                    <Icon size={18} className="text-accent2" />
                  </div>
                  <h3 className="font-semibold text-[13px] text-accent2 mb-4 tracking-wide">{group}</h3>
                  <ul className="space-y-2.5">
                    {items.map((item) => (
                      <li key={item} className="text-[13px] text-muted flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent2/40" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Security - Premium enterprise section */}
      <section id="security" className="py-32 px-6 relative">
        <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-accent/[0.02] rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-[1200px] mx-auto relative">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 mb-4">
              <PulsingDot color="bg-accent" />
              <span className="text-accent text-[12px] font-medium tracking-wide">SECURITY</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold mt-3 tracking-tight">
              Security-first <span className="text-muted">by design</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-muted mt-4 text-lg max-w-[500px] mx-auto">
              Your code never leaves your control. AI sees only what it needs.
            </motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {securityItems.map(({ icon: Icon, title, description }, i) => (
              <motion.div key={title} variants={scaleIn}>
                <GlassCard className="p-6 h-full group">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors duration-300">
                    <Icon size={18} className="text-accent" />
                  </div>
                  <h3 className="font-semibold text-[14px] mb-2">{title}</h3>
                  <p className="text-muted text-[13px] leading-relaxed">{description}</p>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Pricing - Glassmorphic with featured highlight */}
      <section id="pricing" className="py-32 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/[0.01] to-transparent pointer-events-none" />
        
        <div className="max-w-[1100px] mx-auto relative">
          <AnimatedSection className="text-center mb-16">
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 mb-4">
              <PulsingDot color="bg-accent3" />
              <span className="text-accent3 text-[12px] font-medium tracking-wide">PRICING</span>
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-4xl md:text-5xl font-bold mt-3 tracking-tight">
              Simple, <span className="text-muted">transparent pricing</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-muted mt-4 text-lg">Start free. Scale as your team grows.</motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {pricingTiers.map((tier, i) => (
              <motion.div key={tier.name} variants={scaleIn}>
                <div className={`relative rounded-2xl p-7 border backdrop-blur-xl h-full flex flex-col ${
                  tier.featured
                    ? 'bg-white/[0.05] border-accent/30 shadow-[0_0_40px_rgba(0,255,136,0.08)]'
                    : 'bg-white/[0.02] border-white/[0.08]'
                }`}>
                  {tier.featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="text-[10px] font-semibold text-bg bg-accent px-3 py-1 rounded-full">
                        MOST POPULAR
                      </span>
                    </div>
                  )}
                  <h3 className="font-bold text-[16px] mb-1">{tier.name}</h3>
                  <p className="text-muted text-[13px] mb-5">{tier.description}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{tier.price}</span>
                    <span className="text-muted text-[13px]">{tier.period}</span>
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2.5 text-[13px] text-muted">
                        <CheckCircle2 size={14} className="text-accent shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`w-full py-3 rounded-full text-[13px] font-semibold transition-all duration-300 ${
                      tier.featured
                        ? 'bg-accent text-bg hover:shadow-[0_0_30px_rgba(0,255,136,0.3)]'
                        : 'bg-white/[0.05] border border-white/[0.1] text-text hover:border-white/[0.2] hover:bg-white/[0.08]'
                    }`}
                  >
                    {tier.name === 'Enterprise' ? 'Contact Sales' : 'Get Started'}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Pitch / Social Proof - Large quote with stats */}
      <section id="pitch" className="py-32 px-6 relative">
        <div className="max-w-[900px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <GlassCard className="p-10 md:p-16 text-center" hover={false}>
              {/* Decorative quote marks */}
              <div className="text-accent/10 text-[120px] font-serif leading-none absolute top-4 left-8">"</div>
              
              <div className="relative">
                <div className="inline-flex items-center gap-2 mb-8">
                  <Sparkles size={14} className="text-accent3" />
                  <span className="text-accent3 text-[12px] font-medium tracking-wide">THE PITCH</span>
                </div>
                
                <blockquote className="text-2xl md:text-3xl lg:text-4xl font-bold leading-snug mb-12 tracking-tight">
                  Every minute of downtime costs{' '}
                  <span className="text-red">$14,000</span>. RuntimeGuard catches crashes, deprecated APIs, and breaking changes — and ships{' '}
                  <span className="text-accent">verified fixes</span> before your team even notices.
                </blockquote>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    { value: '87%', label: 'patches pass sandbox on first try', color: 'text-accent' },
                    { value: '2.3 min', label: 'average time to verified PR', color: 'text-accent2' },
                    { value: '94%', label: 'human approval rate', color: 'text-accent3' },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center">
                      <div className={`text-3xl md:text-4xl font-mono font-bold ${stat.color} mb-2`}>
                        <AnimatedCounter value={stat.value} />
                      </div>
                      <div className="text-muted text-[12px]">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-accent/[0.02] to-transparent pointer-events-none" />
        <div className="max-w-[600px] mx-auto text-center relative">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">Ready to stop firefighting?</h2>
            <p className="text-muted text-lg mb-8">Connect your repo. RuntimeGuard handles crashes, upgrades, and deprecations while you build features.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/dashboard"
                className="group bg-accent text-bg px-8 py-3.5 rounded-full text-[14px] font-semibold hover:shadow-[0_0_40px_rgba(0,255,136,0.3)] transition-all duration-300 flex items-center gap-2"
              >
                <Zap size={16} className="group-hover:scale-110 transition-transform" />
                Start Free Trial
              </Link>
              <a
                href="#pricing"
                className="px-8 py-3.5 rounded-full text-[14px] font-medium border border-white/[0.1] text-text hover:border-white/[0.2] hover:bg-white/[0.03] transition-all duration-300"
              >
                View Pricing
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer - Minimal */}
      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-[1100px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 flex items-center justify-center">
              <Shield size={10} className="text-accent" />
            </div>
            <span className="font-mono text-[12px] text-muted">RuntimeGuard AI</span>
          </div>
          <span className="text-[12px] text-muted/60">
            From crash to verified PR · Built for Ship to Scale 2025
          </span>
        </div>
      </footer>
    </div>
  )
}
