from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4
from backend.database import Base

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow)
    exception_type = Column(String, nullable=False)
    exception_msg = Column(String, nullable=False)
    file_path = Column(String)
    line_number = Column(Integer)
    function_name = Column(String)
    raw_stack_trace = Column(Text)
    source_repo = Column(String)
    endpoint = Column(String)
    request_payload = Column(Text)
    suspected_cause = Column(String)
    severity = Column(String, default="P1")
    root_cause_explanation = Column(Text)

    # Replay test
    replay_test_code = Column(Text)
    replay_test_before_result = Column(Text)

    # Pipeline status: detected → bundled → reproducing → patching → verifying → pr_created → healed → failed
    status = Column(String, default="detected")
    failure_reason = Column(String)

    # PR result
    pr_url = Column(String)
    pr_number = Column(Integer)

    # Preventability
    was_preventable = Column(Boolean, default=False)
    preventable_pr_number = Column(Integer)
    preventable_pr_days_ago = Column(Integer)

    # PCE (Persistent Context Engine) output
    pce_explain = Column(Text)
    pce_similar_incidents = Column(Text)  # JSON
    pce_suggested_remediations = Column(Text)  # JSON
    pce_causal_chain = Column(Text)  # JSON

    # Relationship
    patches = relationship("Patch", back_populates="incident", lazy="joined")
