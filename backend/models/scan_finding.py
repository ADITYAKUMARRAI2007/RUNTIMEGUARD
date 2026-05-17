"""Model for scan findings — deprecated APIs, vulnerabilities, outdated deps."""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, Text, Boolean
from backend.database import Base


class ScanFinding(Base):
    __tablename__ = "scan_findings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Which repo
    repo_full_name = Column(String, nullable=False)

    # Finding type: "deprecated_api", "outdated_dep", "vulnerability", "breaking_change", "framework_upgrade"
    finding_type = Column(String, nullable=False)

    # Details
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    file_path = Column(String, nullable=True)
    line_number = Column(Integer, nullable=True)
    severity = Column(String, default="MEDIUM")  # LOW, MEDIUM, HIGH, CRITICAL
    package_name = Column(String, nullable=True)
    current_version = Column(String, nullable=True)
    latest_version = Column(String, nullable=True)
    fix_hint = Column(Text, nullable=True)

    # Status: "detected", "fix_in_progress", "pr_created", "resolved", "ignored"
    status = Column(String, default="detected")
    pr_url = Column(String, nullable=True)
    pr_number = Column(Integer, nullable=True)

    # Was a fix attempted?
    fix_attempted = Column(Boolean, default=False)

    def __repr__(self):
        return f"<ScanFinding {self.finding_type}: {self.title} ({self.severity})>"
