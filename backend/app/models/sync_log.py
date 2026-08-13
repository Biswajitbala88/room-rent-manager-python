from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.sql import func
from app.database import Base

class SyncLog(Base):
    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    status = Column(String(20), nullable=False, default="running")  # running, success, failed
    # Deliberately not a FK: sync_logs must survive a "TRUNCATE ... CASCADE" on users
    # (the sync itself truncates/reloads users), so this stays a plain informational id.
    triggered_by = Column(Integer, nullable=True)
    summary = Column(Text, nullable=True)  # JSON: {"users": 3, "rooms": 5, ...}
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
