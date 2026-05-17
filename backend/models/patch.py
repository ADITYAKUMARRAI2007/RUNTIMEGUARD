from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4
from backend.database import Base

class Patch(Base):
    __tablename__ = "patches"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    incident_id = Column(String, ForeignKey("incidents.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    candidate_num = Column(Integer, nullable=False)  # 1 or 2
    patch_content = Column(Text, nullable=False)

    # Policy check
    rejected = Column(Boolean, default=False)
    rejection_reasons = Column(Text)  # JSON array of reason strings

    # Sandbox verification
    sandbox_status = Column(String, default="pending")  # pending, passed, failed, skipped
    sandbox_output = Column(Text)

    # Risk scoring
    risk_score = Column(Integer)  # 0-100
    risk_label = Column(String)  # "Low Risk", "Medium Risk", "High Risk"

    # Selection
    selected = Column(Boolean, default=False)

    # Relationship
    incident = relationship("Incident", back_populates="patches")
