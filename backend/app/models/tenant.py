from sqlalchemy import Column, Integer, String, Boolean, Numeric, Date, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=True)
    room_no = Column(String(50), nullable=False)
    start_date = Column(Date, nullable=True)
    rent_amount = Column(Numeric(10, 2), nullable=False)
    aadhaar_images = Column(JSON, default=list, nullable=False)
    status = Column(String(20), default="active", nullable=False)
    is_water_charge = Column(Boolean, default=False, nullable=False)
    water_charge = Column(Numeric(8, 2), default=0, nullable=False)
    is_advanced = Column(Boolean, default=False, nullable=False)
    advance_amount = Column(Numeric(10, 2), default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner = relationship("User", foreign_keys=[parent_id])
    manager = relationship("User", foreign_keys=[manager_id])
    invoices = relationship("Invoice", back_populates="tenant", cascade="all, delete")
    transactions = relationship("Transaction", back_populates="tenant", cascade="all, delete")
