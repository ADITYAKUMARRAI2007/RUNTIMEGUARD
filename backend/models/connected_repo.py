"""Model for connected GitHub repositories."""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Integer, Text
from backend.database import Base


class ConnectedRepo(Base):
    __tablename__ = "connected_repos"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # GitHub info
    repo_full_name = Column(String, unique=True, nullable=False)  # e.g. "owner/repo"
    repo_url = Column(String, nullable=True)
    default_branch = Column(String, default="main")
    language = Column(String, nullable=True)

    # Connection status
    connected = Column(Boolean, default=True)
    github_token = Column(String, nullable=True)  # Per-repo token if using GitHub App

    # Scan results
    last_scan_at = Column(DateTime, nullable=True)
    deprecated_count = Column(Integer, default=0)
    vulnerability_count = Column(Integer, default=0)
    outdated_deps_count = Column(Integer, default=0)
    health_score = Column(Integer, default=100)

    # Monitoring config
    monitor_logs = Column(Boolean, default=True)
    monitor_deps = Column(Boolean, default=True)
    monitor_frameworks = Column(Boolean, default=True)
    auto_fix = Column(Boolean, default=False)  # Auto-create PRs without manual trigger

    def __repr__(self):
        return f"<ConnectedRepo {self.repo_full_name} (score={self.health_score})>"
