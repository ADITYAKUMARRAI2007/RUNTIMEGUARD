from sqlalchemy import Column, String, Integer, DateTime
from datetime import datetime
from backend.database import Base

class HealthScore(Base):
    __tablename__ = "health_scores"

    repo = Column(String, primary_key=True)
    score = Column(Integer, default=100)
    cve_count = Column(Integer, default=0)
    deprecated_count = Column(Integer, default=0)
    open_incidents = Column(Integer, default=0)
    risky_patterns = Column(Integer, default=0)
    last_updated = Column(DateTime, default=datetime.utcnow)
