# Implementation Plan: RuntimeGuard AI

## Overview

RuntimeGuard AI is an AI-powered software immune system that turns production crashes into sandbox-verified recovery PRs. The implementation follows the Two-Day Build Plan: Day 1 focuses on backend infrastructure and the full remediation pipeline, Day 2 on the React frontend dashboard and polish. Every external call has a pre-baked fallback to guarantee demo reliability.

## Tasks

- [x] 1. Backend foundation: config, database, models, and app entry point
  - [x] 1.1 Create `backend/config.py` with Settings dataclass
    - Load all configuration from `.env` via a dataclass with sensible defaults
    - Fields: anthropic_api_key, github_token, github_repo, database_url (default sqlite:///./runtimeguard.db), log_level
    - Never hardcode secrets; all sensitive values from Settings
    - _Requirements: 1.1, 1.5_
  - [x] 1.2 Create `backend/database.py` with SQLAlchemy engine and session
    - SQLite with `check_same_thread=False`
    - Provide `engine`, `SessionLocal`, `get_db` dependency, and `init_db()` function
    - _Requirements: 1.2, 1.3_
  - [x] 1.3 Create `backend/models/__init__.py`, `incident.py`, `patch.py`, `proactive_pr.py`, `health_score.py`
    - Incident model with all fields per design (id, status, PCE fields, replay test fields, preventability fields)
    - Patch model with candidate_num, rejection, sandbox, risk score fields
    - ProactivePR model with file_path, pattern_matched, days_since_created
    - HealthScore model with repo PK, score, breakdown fields
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 1.4 Create `backend/main.py` with FastAPI app, lifespan handler, CORS, router includes
    - Lifespan handler calls `init_db()` and seeds proactive PR if none exists
    - CORS allows `http://localhost:5173`
    - Include all routers (demo, webhook, incidents, health)
    - Use Python logging module for all output
    - _Requirements: 1.3, 1.4, 1.6, 23.1, 23.4_

- [x] 2. Checkpoint — Backend starts
  - Ensure `uvicorn backend.main:app` starts without errors, ask the user if questions arise.

- [x] 3. Demo endpoints and demo application
  - [x] 3.1 Create `backend/routers/demo.py` with POST /demo/trigger and POST /demo/reset
    - `/demo/trigger`: create hardcoded crash payload (KeyError on 'user_id', demo-app/routes/user.py line 12, function get_user, endpoint POST /user, payload {"cart_id": "c123"}), insert Incident with status "detected", fire pipeline as BackgroundTask, return within 500ms
    - `/demo/reset`: delete all incidents and patches, reset health_score to 100, re-seed proactive PR, attempt to close GitHub PRs with "auto-healed" label
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [x] 3.2 Create `demo-app/app.py` with deprecated `@app.on_event("startup")` handler
    - FastAPI application with intentional deprecated pattern for proactive detection
    - _Requirements: 4.1_
  - [x] 3.3 Create `demo-app/routes/__init__.py` and `demo-app/routes/user.py` with buggy endpoint
    - Endpoint raises KeyError when `data['user_id']` is missing from request
    - Include a simple in-memory db dict
    - _Requirements: 4.2_
  - [x] 3.4 Create `demo-app/tests/test_user.py` with exactly 3 pytest tests
    - test_existing_user (passes on any code), test_missing_user (expects 404), test_missing_key (expects 400/422)
    - Tests pass with robust fix (Patch 2), fail with minimal fix (Patch 1)
    - _Requirements: 4.3, 4.4_

- [x] 4. Stack trace parser, incident bundler, and secret redactor
  - [x] 4.1 Create `backend/services/stack_trace_parser.py`
    - ParsedCrash dataclass with all fields (exception_type, exception_message, primary_file, line_number, function_name, endpoint, request_payload, related_files, raw_trace, error_category, suspected_cause)
    - `parse_crash(payload)` function that skips library frames, extracts first user-code frame
    - ERROR_CATEGORIES mapping (KeyError→missing_field, TypeError→null_access, etc.)
    - `_generate_suspected_cause()` helper
    - Never raises — returns sensible defaults on missing data
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 4.2 Create `backend/services/secret_redactor.py`
    - PATTERNS list for AWS keys, GitHub tokens, Stripe keys, passwords, bearer tokens, connection strings, emails
    - `redact(source_code, file_path)` → (redacted_code, events)
    - Log redaction events without logging matched values
    - Never raises
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 5. Replay test generator and before-fix sandbox
  - [x] 5.1 Create `backend/services/replay_test_generator.py`
    - `generate_replay_test(crash: ParsedCrash) -> str` that produces a pytest function
    - Test asserts endpoint does NOT return 500 (inverted assertion for verification after fix)
    - Uses crash.endpoint, crash.request_payload
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 5.2 Create `backend/services/sandbox_verifier.py` — before-fix verification function
    - `verify_replay_before_fix(source_code: str) -> tuple[bool, str]`
    - Attempts Docker execution; falls back to assumed FAIL for demo app (bug confirmed)
    - PRERECORDED_FAIL and PRERECORDED_PASS constants
    - Never raises
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 6. GitHub source fetcher
  - [x] 6.1 Create `backend/services/github_fetcher.py`
    - `fetch_file(repo, file_path, token) -> str`
    - PyGithub with 10-second timeout, retry up to 3 times with exponential backoff
    - Fallback to hardcoded demo-app/routes/user.py content on failure
    - Never raises
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 7. Patch generator with Claude and fallbacks
  - [x] 7.1 Create `backend/services/patch_generator.py`
    - `generate_patches(crash, source_code, settings) -> list[str]` — generates exactly 2 candidates
    - Candidate 1: "most minimal possible fix" prompt
    - Candidate 2: "robust fix with proper input validation" prompt
    - System prompt instructs Claude to return ONLY patched file content
    - 10s timeout, 1 retry, falls back to FALLBACK_PATCH_1 and FALLBACK_PATCH_2 constants
    - `generate_root_cause(crash, source_code, settings) -> str` — plain-language explanation
    - Never raises
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 14.1, 14.2, 14.3_

- [x] 8. Patch policy engine
  - [x] 8.1 Create `backend/services/patch_policy.py`
    - `check_patch_policy(patch_content, crash) -> tuple[bool, list[str]]`
    - Rejection rules: hardcoded dummy values, broad except without re-raise, root function not touched, direct dict access without .get()
    - Returns (is_safe, rejection_reasons)
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 9. Sandbox verifier (after-fix) and risk scorer
  - [x] 9.1 Complete `backend/services/sandbox_verifier.py` — after-fix verification function
    - `verify_patch(patch_content: str) -> tuple[bool, str]`
    - Docker container (python:3.11-slim), apply patch, run pytest, 60s timeout
    - Always cleanup containers in finally block
    - Fallback: pattern-match for `data.get('user_id')` AND `db.get(` → pass; else fail
    - Never raises
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [x] 9.2 Create `backend/services/risk_scorer.py`
    - `compute_risk_score(patch_content, sandbox_passed, crash) -> tuple[int, str]`
    - Score 0-100: sandbox result (most important), lines changed, sensitive keywords, hardcoded values, proper error handling bonus
    - Labels: 80-100="Low Risk", 50-79="Medium Risk", 0-49="High Risk"
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 10. Persistent Context Engine (operational memory)
  - [x] 10.1 Create `backend/services/context_engine.py`
    - PersistentContextEngine class with `ingest(events)` and `reconstruct_context(signal, mode)` methods
    - Dataclasses: CausalEdge, IncidentMatch, Remediation, Context
    - Topology-independent behavioral matching via service alias resolution
    - Causal chain synthesis from correlated events (deploy → error → crash)
    - Remediation history with confidence scoring
    - `_generate_explanation()` for human-readable investigation narrative
    - "fast" mode returns within 2 seconds
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.9, 16.10_
  - [x] 10.2 Implement PCE seeding logic
    - Seed with historical event sequence: deploy (47 days ago, payments-svc v2.14.0), topology rename (payments-svc → billing-svc), incident signal (deprecated @app.on_event crash), remediation (rollback, outcome=resolved)
    - When demo crash fires, `reconstruct_context` surfaces this as similar past incident despite rename
    - Integrate seeding into `seed_proactive_pr()` function
    - _Requirements: 16.7, 16.8_

- [x] 11. PR creator and preventability check
  - [x] 11.1 Create `backend/services/pr_creator.py`
    - `create_pr(repo, file_path, patch_content, incident_id, token, incident, risk_score) -> tuple[str, int]`
    - Branch: `runtimeguard/fix-{incident_id[:8]}`, commit patched file, open PR against main
    - PR title: `[RuntimeGuard] Fix {exception_type} in {endpoint}`
    - PR body: incident ID, root cause, failing payload, stack trace, before/after sandbox, risk score, replay test, "Human approval required", preventability note if applicable
    - Add "auto-healed" label (create if needed)
    - Fallback: mock PR URL and number on GitHub API failure
    - `close_demo_prs(repo, token)` function for /demo/reset
    - Never raises
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_
  - [x] 11.2 Create `backend/services/memory_graph.py`
    - `check_preventable(db, file_path) -> ProactivePR | None`
    - Cross-reference crash file against proactive_prs table
    - _Requirements: 17.2 (preventability step)_

- [x] 12. Full pipeline orchestrator
  - [x] 12.1 Create `backend/services/pipeline.py`
    - `run_remediation_pipeline(incident_id, payload)` async function
    - Full loop: parse → bundled → replay test → reproducing → before-fix sandbox → patching → PCE context → root cause → generate patches → policy check → verifying → sandbox verify → risk score → select winner → pr_created → create PR → healed → learn (PCE ingest)
    - Atomic status updates after each step
    - try/except around every step; set status "failed" with failure_reason on error
    - Call `recalculate_health_score()` after completion
    - Ingest resolution event into PCE after healing
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8_

- [x] 13. Checkpoint — Full pipeline works end-to-end
  - Ensure `POST /demo/trigger` completes the full loop to "healed" status, ask the user if questions arise.

- [x] 14. Webhook router and incidents router
  - [x] 14.1 Create `backend/routers/webhook.py`
    - `POST /webhook/crash` — validate payload (exception_type, exception_message, stacktrace, repo required), create Incident, launch pipeline as BackgroundTask, return 202 with incident_id
    - _Requirements: 18.1, 18.2, 18.3, 18.4_
  - [x] 14.2 Create `backend/routers/incidents.py`
    - `GET /incidents` — all incidents ordered by created_at DESC with patches array (risk scores, rejection reasons)
    - `GET /incidents/{incident_id}` — full detail with patches, replay_test_code, before-fix result, root_cause_explanation, PCE fields
    - Pydantic response models for clean serialization
    - _Requirements: 19.1, 19.2, 19.3_

- [x] 15. Health score router and dependency scanner
  - [x] 15.1 Create `backend/routers/health.py`
    - `GET /health-score?repo={repo}` — current score and breakdown
    - `GET /proactive-prs` — all proactive PR records
    - Health score formula: `max(0, min(100, 100 − (cve×10) − (deprecated×5) − (open_incidents×15) − (risky_patterns×8)))`
    - _Requirements: 20.1, 20.2, 20.3_
  - [x] 15.2 Create `backend/services/dependency_scanner.py` and `backend/data/known_breaking_changes.json`
    - JSON with 5 patterns: @app.on_event, requests.get( without timeout, @app.before_first_request, autocommit=True, openai.ChatCompletion.create
    - Scanner scans Python files for these patterns and reports matches
    - _Requirements: 20.4, 20.5_
  - [x] 15.3 Create `backend/requirements.txt`
    - Include: fastapi, uvicorn, sqlalchemy, anthropic, PyGithub, docker, python-dotenv, pydantic, httpx, pytest
    - _Requirements: 1.1_

- [x] 16. Checkpoint — All backend endpoints working
  - Ensure all endpoints return correct responses, run 3 full demo trigger/reset cycles, ask the user if questions arise.

- [x] 17. Frontend setup: Vite, Tailwind, types, polling hook
  - [x] 17.1 Create `frontend/package.json` and `frontend/vite.config.ts`
    - React 19, Vite, Tailwind CSS, Recharts, Lucide React
    - Vite proxy: `/api` → `http://localhost:8000`
    - _Requirements: 21.11_
  - [x] 17.2 Create `frontend/src/types.ts`
    - TypeScript interfaces: Incident, Patch, HealthScore, ProactivePR matching backend Pydantic models
    - Include PCE fields: pce_explain, pce_similar_incidents, pce_suggested_remediations, pce_causal_chain
    - _Requirements: 19.3, 21.9, 21.10_
  - [x] 17.3 Create `frontend/src/hooks/usePolling.ts`
    - Generic `usePolling<T>(url, interval)` hook that polls every 5 seconds
    - Returns { data, loading, error, refetch }
    - _Requirements: 21.11_
  - [x] 17.4 Create `frontend/src/index.css` with Tailwind directives and dark theme base styles
    - bg-gray-950 text-white base
    - _Requirements: 21.12_

- [x] 18. Frontend components: health and status
  - [x] 18.1 Create `frontend/src/components/HealthScoreGauge.tsx`
    - SVG circular gauge, 0-100, color-coded (green ≥80, amber 50-79, red <50)
    - Animated transitions, breakdown grid showing cve_count, deprecated_count, open_incidents, risky_patterns
    - _Requirements: 21.2_
  - [x] 18.2 Create `frontend/src/components/LiveStatusBadge.tsx`
    - Green pulsing dot + "LIVE" text
    - _Requirements: 21.1_

- [x] 19. Frontend components: incident timeline and cards
  - [x] 19.1 Create `frontend/src/components/IncidentCard.tsx`
    - Expandable card showing status badge (colored by pipeline stage), exception info (type + file + line)
    - Status color mapping: detected=red, bundled/reproducing=amber, patching/verifying=amber+pulse, pr_created=blue, healed=green, failed=red
    - _Requirements: 21.3_
  - [x] 19.2 Create `frontend/src/components/PreventableAnnotation.tsx`
    - Amber background banner with AlertTriangle icon
    - Text: "Was preventable — PR #{number} warned about this deprecation {days} days ago"
    - Bold and visually prominent
    - _Requirements: 21.4_
  - [x] 19.3 Create `frontend/src/components/RootCauseCard.tsx`
    - Plain language explanation of what caused the crash
    - _Requirements: 21.7_
  - [x] 19.4 Create `frontend/src/components/ReplayTestCard.tsx`
    - Display replay test code and before-fix result ("Bug confirmed: test fails on unfixed code")
    - _Requirements: 21.6_

- [x] 20. Frontend components: patches and risk
  - [x] 20.1 Create `frontend/src/components/PatchCard.tsx`
    - Candidate number, REJECTED badge with reasons (Patch 1), VERIFIED badge with risk score (Patch 2)
    - SELECTED tag on winner, collapsible sandbox output, before/after comparison
    - _Requirements: 21.5_
  - [x] 20.2 Create `frontend/src/components/RiskScoreBadge.tsx`
    - Display "Risk Score: {score}/100 — {label}" with color coding
    - _Requirements: 21.8_
  - [x] 20.3 Create `frontend/src/components/ContextEnginePanel.tsx`
    - PCE reconstructed context: causal chain visualization, similar past incidents with similarity scores, suggested remediations with confidence levels
    - Display PCE explain narrative as human-readable investigation summary
    - _Requirements: 21.9, 21.10_

- [x] 21. Frontend: Dashboard page and App.tsx
  - [x] 21.1 Create `frontend/src/pages/Dashboard.tsx`
    - Top bar: "RUNTIMEGUARD AI" branding, LiveStatusBadge, Demo Trigger button, Demo Reset button
    - Left column (1/3): HealthScoreGauge
    - Right column (2/3): Incident timeline with expandable IncidentCards
    - Expanded detail: RootCauseCard, ReplayTestCard, PatchCards, ContextEnginePanel, PR link
    - Wire up usePolling for /incidents and /health-score (5s interval)
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 21.10, 21.11, 21.12_
  - [x] 21.2 Create `frontend/src/App.tsx`
    - Dark theme wrapper (bg-gray-950 text-white), render Dashboard
    - _Requirements: 21.12_

- [x] 22. Checkpoint — Frontend renders and connects to backend
  - Ensure the frontend dev server starts, displays the dashboard, and successfully polls backend data, ask the user if questions arise.

- [x] 23. Polish: animations, error states, loading
  - [x] 23.1 Add loading skeletons and error states to Dashboard
    - Show loading state while polling, graceful error display if backend unreachable
    - _Requirements: 22.1_
  - [x] 23.2 Add pulse animations to active pipeline stages
    - Amber pulse on reproducing/patching/verifying statuses
    - Smooth transitions between states
    - _Requirements: 21.3_

- [x] 24. README and documentation
  - [x] 24.1 Create `README.md` at project root
    - Project description, architecture overview, setup instructions (.env, pip install, npm install)
    - How to run: backend (uvicorn), frontend (npm run dev), demo-app
    - Demo flow walkthrough
    - What's real vs. simulated table
    - _Requirements: 22.1_

- [x] 25. Final checkpoint — End-to-end demo reliability
  - Ensure 3 full demo trigger/reset cycles complete in under 2 minutes each with consistent results. Verify: bug reproduction confirmed, Patch 1 rejected, Patch 2 verified, risk score computed, PR created, "Was preventable" annotation shown. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP (none in this plan — all tasks are core for demo reliability)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- The build order follows the design's Two-Day Build Plan: backend foundation → pipeline services → frontend → polish
- Every external API call (Anthropic, GitHub, Docker) must have try/except with pre-baked fallback
- Demo reliability is the #1 priority — the pipeline NEVER crashes
