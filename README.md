# RuntimeGuard AI

**From production crash to verified recovery PR.**

RuntimeGuard AI turns production crashes into sandbox-verified recovery pull requests and learns from every incident to prevent the next one.

```
┌─────────────────────────────────────────────────────────────────┐
│  RUNTIMEGUARD AI — Autonomous Software Immune System            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Detect → Bundle → Reproduce → Patch → Verify → PR → Learn     │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Crash    │→ │ Context  │→ │ Claude   │→ │ Docker   │→ PR    │
│  │ Webhook  │  │ Engine   │  │ Patches  │  │ Sandbox  │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  + Persistent Context Engine (operational memory)               │
│  + Patch Policy Engine (rejects unsafe fixes)                   │
│  + Risk Score Engine (trust signals)                            │
│  + "Was Preventable" annotation (47-day warning)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url>
cd Sentinel
cp .env.example .env
# Edit .env with your API keys
```

### 2. Install backend

```bash
pip install -r backend/requirements.txt
```

### 3. Install frontend

```bash
cd frontend
npm install
cd ..
```

### 4. Run

Terminal 1 — Backend:
```bash
uvicorn backend.main:app --reload --port 8000
```

Terminal 2 — Frontend:
```bash
cd frontend
npm run dev
```

Open http://localhost:5173

## Demo Flow

1. Click **"Demo Trigger"** on the dashboard
2. Watch the incident progress through pipeline stages in real-time:
   - 🔴 **Detected** → crash received
   - 🟡 **Bundled** → context extracted, root cause identified
   - 🟡 **Reproducing** → replay test confirms bug exists
   - 🟡 **Patching** → Claude generates 2 candidates
   - 🟡 **Verifying** → Patch 1 REJECTED, Patch 2 VERIFIED
   - 🔵 **PR Created** → recovery PR with full evidence
   - 🟢 **Healed** → incident resolved
3. See the **"Was preventable"** annotation (PR #142 warned 47 days ago)
4. Click **"Reset"** to clean up and run again

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| Frontend | React 19, Vite, Tailwind CSS, Recharts, Lucide |
| AI | Anthropic Claude (with pre-baked fallbacks) |
| Sandbox | Docker SDK (with pattern-matching fallback) |
| GitHub | PyGithub (with mock fallback) |
| Memory | Persistent Context Engine (in-process) |

## Architecture

- **12 pipeline services** chained with atomic status updates
- **Every external call** has a try/except with pre-baked fallback
- **Demo never fails** — Claude down? Fallback patches. Docker unavailable? Pattern matching.
- **Persistent Context Engine** — topology-independent behavioral matching across service renames

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/demo/trigger` | Trigger demo crash loop |
| POST | `/demo/reset` | Reset all demo data |
| POST | `/webhook/crash` | Receive production crash |
| GET | `/incidents` | List all incidents |
| GET | `/incidents/{id}` | Get incident detail |
| GET | `/health-score` | Get health score |
| GET | `/proactive-prs` | List proactive PRs |

## Team

Built for Ship to Scale 2026 — Scaler School of Technology
