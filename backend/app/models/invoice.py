from sqlalchemy import Column, Integer, String, Boolean, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True, index=True)
    room_no = Column(String(50), nullable=True)
    month = Column(String(7), nullable=False) # YYYY-MM
    electricity_units = Column(Integer, default=0, nullable=False)
    previous_reading = Column(Integer, default=0, nullable=False)
    current_reading = Column(Integer, default=0, nullable=False)
    electricity_charge = Column(Numeric(8, 2), default=0, nullable=False)
    water_charge = Column(Numeric(8, 2), default=0, nullable=False)
    rent_amount = Column(Numeric(10, 2), nullable=False)
    total_amount = Column(Numeric(10, 2), nullable=False)
    received_amount = Column(Numeric(10, 2), default=0, nullable=False)
    is_excluded = Column(Boolean, default=False, nullable=False)
    is_closer = Column(Boolean, default=False, nullable=False)
    advance_applied = Column(Numeric(10, 2), default=0, nullable=False)
    status = Column(String(20), default="unpaid", nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant = relationship("Tenant", back_populates="invoices")
    transactions = relationship("Transaction", back_populates="invoice", cascade="all, delete")
