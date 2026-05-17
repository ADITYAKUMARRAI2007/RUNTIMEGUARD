from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime
from datetime import datetime
from uuid import uuid4
from backend.database import Base


class ScanSession(Base):
    __tablename__ = "scan_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    repo_path = Column(String)
    deployment_url = Column(String)
    app_type = Column(String)          # react/next/node/fastapi/unknown
    scan_mode = Column(String)         # quick/deep/recovery
    login_email = Column(String, nullable=True)
    status = Column(String, default="started")
    # started/repo_scanning/browser_scanning/correlating/classifying/bundling
    # /patching/verifying/awaiting_approval/approved/rejected/failed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    # Repo scan output
    repo_risks = Column(Text)          # JSON list of risk findings
    browser_events = Column(Text)      # JSON list of browser events
    pages_visited = Column(Integer)
    buttons_tested = Column(Integer)
    failed_api_calls = Column(Integer)
    console_errors = Column(Integer)

    # Incident classification
    incident_type = Column(String)
    incident_bundle = Column(Text)     # JSON
    recovery_strategy = Column(String)
    patch_diff = Column(Text)
    patch_files = Column(Text)         # JSON list of file paths
    test_code = Column(Text)

    # Sandbox verification
    sandbox_status = Column(String)
    sandbox_tests = Column(Text)       # JSON list of test results
    sandbox_duration_ms = Column(Integer)

    # Risk scoring
    risk_score = Column(Integer)
    risk_label = Column(String)
    risk_reasons = Column(Text)        # JSON list of reasons

    # PR preview
    pr_title = Column(String)
    pr_body = Column(Text)

    # App map - correlated routes, env vars, dependencies
    app_map = Column(Text)             # JSON object: {routes, env_vars, dependencies, api_calls}

    # Screenshots taken during visual scan
    screenshots = Column(Text)         # JSON list of screenshot paths

    # Meta
    knowledge_updated = Column(Boolean, default=False)
    failure_reason = Column(String)
