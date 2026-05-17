from sqlalchemy import Column, String, Integer, DateTime
from datetime import datetime
from uuid import uuid4
from backend.database import Base

class ProactivePR(Base):
    __tablename__ = "proactive_prs"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    created_at = Column(DateTime, default=datetime.utcnow)
    file_path = Column(String, nullable=False)
    pattern_matched = Column(String, nullable=False)
    pr_url = Column(String)
    pr_number = Column(Integer)
    pr_title = Column(String)
    days_since_created = Column(Integer, default=47)
    repo = Column(String)
